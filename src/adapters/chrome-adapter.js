/* BMO adapter: chrome —— 扩展形态。直接读写浏览器书签，用 history 补使用度。
   依赖：chrome.bookmarks / chrome.storage，可选 chrome.history。
   同一份代码也跑在 tests 的 mock chrome 上。 */
window.BMO = window.BMO || {};

BMO.ChromeAdapter = (function () {
  const M = () => BMO.Model;
  const USAGE_TTL = 6 * 3600 * 1000;
  const BACKUP_KEY = 'bmo:backups';
  const DRAFT_KEY = 'bmo:draft';
  const USAGE_KEY = 'bmo:usage';

  const available = () => typeof chrome !== 'undefined' && !!(chrome && chrome.bookmarks);

  /** 同时兼容 callback 与 Promise 两种风格 */
  function bp(fn, ctx) {
    return (...args) => new Promise((resolve, reject) => {
      let ret;
      try {
        ret = fn.apply(ctx || chrome, args.concat([res => {
          const e = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError);
          if (e) reject(new Error(e.message || 'chrome api error')); else resolve(res);
        }]));
      } catch (err) { reject(err); return; }
      if (ret && typeof ret.then === 'function') ret.then(resolve, reject);
    });
  }
  const st = () => chrome.storage.local;
  const storageGet = key => bp((...a) => st().get(...a), st())([key]).then(o => (o ? o[key] : undefined)).catch(() => undefined);
  const storageSet = (key, val) => bp((...a) => st().set(...a), st())({ [key]: val });
  const storageRemove = key => bp((...a) => st().remove(...a), st())([key]);

  /* ---------- 读取 ---------- */
  function toNode(n) {
    if (n.url) return { type: 'link', name: n.title, url: n.url, added: n.dateAdded ? Math.floor(n.dateAdded / 1000) : null, srcId: String(n.id) };
    return {
      type: 'folder', name: n.title, srcId: String(n.id),
      toolbar: !!n.dateGroupModified && false,      // getTree 不给根标记，靠位置判断
      children: (n.children || []).map(toNode),
    };
  }

  async function load(opts) {
    if (!available()) throw new Error('chrome.bookmarks 不可用');
    const o = opts || {};
    const tree = await bp(chrome.bookmarks.getTree, chrome.bookmarks)();
    const roots = ((tree[0] || {}).children || []).map(toNode);
    // 前三个根（书签栏 / 其他书签 / 移动书签）标记 toolbar 归属
    if (roots[0]) roots[0].toolbar = true;
    const state = M().fromTree(roots, { source: 'chrome' });
    const usage = await loadUsage(o.refreshUsage);
    state.items.forEach(i => {
      const u = usage && usage[i.url];
      i.used = u ? u.used : null;
      i.visits = u ? u.visits : (usage ? 0 : null);
    });
    const hasUsage = BMO.Tags.refresh(state, { usage: !!usage });
    state.hasUsage = !!usage;
    state.snapshot = snapshot(state);
    state.capturedAt = Date.now();
    return { state, warnings: usage ? [] : ['拿不到浏览历史（未授予 history 权限），「常用/从未访问」标签不可用，已退化为按添加年份判断'] };
  }

  async function loadUsage(force) {
    if (!chrome.history || !chrome.history.search) return null;
    if (!force) {
      const cached = await storageGet(USAGE_KEY);
      if (cached && cached.at && Date.now() - cached.at < USAGE_TTL && cached.map) return cached.map;
    }
    let entries = [];
    try { entries = await bp(chrome.history.search, chrome.history)({ text: '', startTime: 0, maxResults: 0 }) || []; }
    catch (e) { return null; }
    const map = {};
    entries.forEach(e => {
      if (!e.url) return;
      map[e.url] = { used: e.lastVisitTime ? Math.floor(e.lastVisitTime / 1000) : 0, visits: e.visitCount || 0 };
    });
    try { await storageSet(USAGE_KEY, { at: Date.now(), map }); } catch (e) { /* 超配额就放弃缓存 */ }
    return map;
  }

  function snapshot(state) {
    const Mo = M();
    return {
      at: Date.now(),
      folders: state.folders.filter(f => f.srcId).map(f => ({
        srcId: f.srcId, name: f.name, parent: f.parent ? (Mo.folderById(state, f.parent) || {}).srcId || null : null,
      })),
      items: state.items.filter(i => i.srcId).map(i => ({
        srcId: i.srcId, name: i.name, url: i.url,
        folder: (Mo.folderById(state, i.folder) || {}).srcId || null,
      })),
    };
  }

  /* ---------- 备份 / 回滚 ---------- */
  /** 备份的必须是"改动前浏览器的真实状态"（load 时抓的快照），不是改好的草稿 */
  async function backup(state, note) {
    const snap = state && state.snapshot;
    if (!snap) return 0;
    const list = (await storageGet(BACKUP_KEY)) || [];
    list.unshift({ at: Date.now(), note: note || 'apply', folders: snap.folders, items: snap.items });
    while (list.length > 5) list.pop();
    try { await storageSet(BACKUP_KEY, list); } catch (e) { /* 配额 */ }
    return list.length;
  }
  const listBackups = () => storageGet(BACKUP_KEY).then(l => (l || []).map(b => ({ at: b.at, note: b.note, folders: b.folders.length, items: b.items.length })));

  /** 回到某个备份：清空三个根下的内容，再按备份重建（顶层同名分类复用浏览器原有的根） */
  async function restore(at, onProgress) {
    const list = (await storageGet(BACKUP_KEY)) || [];
    const b = list.find(x => x.at === at) || list[0];
    if (!b) throw new Error('没有可用备份');
    const tree = await bp(chrome.bookmarks.getTree, chrome.bookmarks)();
    const roots = ((tree[0] || {}).children || []);
    const rootIds = roots.map(n => n.id);
    for (const r of roots) {
      for (const k of ((await bp(chrome.bookmarks.getChildren, chrome.bookmarks)(r.id)) || [])) await bp(chrome.bookmarks.removeTree, chrome.bookmarks)(k.id);
    }
    const rootByTitle = {};
    roots.forEach(r => { rootByTitle[r.title] = r.id; });
    const idMap = {};
    b.folders.filter(f => !f.parent).forEach(f => { if (rootByTitle[f.name]) idMap[f.srcId] = rootByTitle[f.name]; });
    const total = b.folders.length + b.items.length;
    let done = 0;
    const ordered = b.folders.filter(f => !idMap[f.srcId])
      .slice().sort((x, y) => depth(b, x) - depth(b, y));
    for (const f of ordered) {
      const pid = f.parent ? (idMap[f.parent] || rootIds[0]) : rootIds[0];
      const n = await bp(chrome.bookmarks.create, chrome.bookmarks)({ parentId: pid, title: f.name });
      idMap[f.srcId] = n.id;
      onProgress && onProgress(++done, total);
    }
    for (const it of b.items) {
      const pid = (it.folder && (idMap[it.folder] || rootIds[0])) || rootIds[0];
      await bp(chrome.bookmarks.create, chrome.bookmarks)({ parentId: pid, title: it.name, url: it.url });
      onProgress && onProgress(++done, total);
    }
    return { folders: ordered.length, items: b.items.length };
  }
  const depth = (b, f) => { let d = 0, c = f; while (c && c.parent) { d++; c = b.folders.find(x => x.srcId === c.parent); if (d > 30) break; } return d; };

  /* ---------- 应用草稿 ---------- */
  async function apply(state, onProgress) {
    const { ops, summary, unsupported } = BMO.Diff.compute(state);
    if (unsupported) throw new Error('缺少源快照，无法安全写回');
    if (!ops.length) return { summary, done: 0, errors: [], backedUp: false };
    const n = await backup(state, 'before-apply');
    const refMap = {};
    const errors = [];
    let done = 0;
    const parentFor = op => op.parentSrcId || (op.parentRef ? refMap[op.parentRef] : undefined);
    for (const op of ops) {
      try {
        if (op.op === 'createFolder') {
          const r = await bp(chrome.bookmarks.create, chrome.bookmarks)({ parentId: parentFor(op), title: op.name });
          refMap[op.ref] = r.id;
        } else if (op.op === 'createItem') {
          const r = await bp(chrome.bookmarks.create, chrome.bookmarks)({ parentId: parentFor(op), title: op.title, url: op.url });
          refMap[op.ref] = r.id;
        } else if (op.op === 'renameFolder' || op.op === 'renameItem') {
          await bp(chrome.bookmarks.update, chrome.bookmarks)(op.srcId, { title: op.name || op.title });
        } else if (op.op === 'moveFolder' || op.op === 'moveItem') {
          await bp(chrome.bookmarks.move, chrome.bookmarks)(op.srcId, { parentId: parentFor(op), index: op.index });
        } else if (op.op === 'removeItem') {
          await bp(chrome.bookmarks.remove, chrome.bookmarks)(op.srcId);
        } else if (op.op === 'removeFolder') {
          await bp(chrome.bookmarks.removeTree, chrome.bookmarks)(op.srcId);
        }
      } catch (e) {
        errors.push({ op: op.op, srcId: op.srcId || op.ref, message: String((e && e.message) || e) });
      }
      done++;
      onProgress && onProgress(done, ops.length, op);
    }
    // 写回成功后刷新快照，避免重复执行同一批 diff
    const fresh = await load();
    state.snapshot = fresh.state.snapshot;
    return { summary, done, errors, backedUp: n };
  }

  /* ---------- 草稿持久化 ---------- */
  const saveDraft = state => storageSet(DRAFT_KEY, BMO.Export.json(state));
  const loadDraft = () => storageGet(DRAFT_KEY).then(s => (s ? BMO.Export.fromJson(s) : null));
  const clearDraft = () => storageRemove(DRAFT_KEY);

  return { name: 'chrome', canApply: true, available, load, loadUsage, apply, backup, listBackups, restore,
           saveDraft, loadDraft, clearDraft, snapshot, storageGet, storageSet };
})();
