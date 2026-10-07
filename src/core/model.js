/* BMO core: model —— 书签树的数据模型与纯函数操作（不依赖浏览器 API） */
window.BMO = window.BMO || {};

BMO.Model = (function () {
  const uid = (p => () => p + Math.random().toString(36).slice(2, 9))('f');

  function create(opts) {
    return Object.assign({
      version: 1,
      source: 'unknown',
      folders: [],      // {id, name, parent}   数组顺序 = 同级显示顺序
      items: [],        // {id, name, url, folder, home, orig, added, used, visits, tags, check, moved, trashed, prevFolder, prevName, srcId}
      ui: {},
      capturedAt: null, // 源快照时间（用于 diff）
    }, opts || {});
  }

  /* ---------- 文件夹查询 ---------- */
  const byId = st => { const m = {}; st.folders.forEach(f => m[f.id] = f); return m; };
  const folderById = (st, id) => st.folders.find(f => f.id === id) || null;
  const topFolders = st => st.folders.filter(f => !f.parent);
  const subFolders = (st, pid) => st.folders.filter(f => (f.parent || null) === (pid || null));
  const siblingsOf = (st, pid) => st.folders.filter(f => (f.parent || null) === (pid || null));

  function folderPath(st, f) {
    const p = []; let c = f;
    while (c) { p.unshift(c.name); c = c.parent ? folderById(st, c.parent) : null; }
    return p.join(' / ');
  }
  function depthOf(st, f) { let d = 0, c = f; while (c && c.parent) { d++; c = folderById(st, c.parent); } return d; }
  function descendants(st, id) {
    const out = [id]; const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      for (const f of st.folders) if (f.parent === cur) { out.push(f.id); stack.push(f.id); }
    }
    return out;
  }
  const isDescendant = (st, a, b) => a !== b && descendants(st, b).includes(a);

  /** 按父子关系 DFS 展开；exclude 中的分类连同子树跳过 */
  function folderOptions(st, exclude) {
    const ex = exclude || []; const out = [];
    const rec = (pid, depth) => {
      for (const f of st.folders.filter(x => (x.parent || null) === pid)) {
        if (ex.includes(f.id)) continue;
        out.push({ f, depth });
        rec(f.id, depth + 1);
      }
    };
    rec(null, 0);
    return out;
  }

  /* ---------- 计数 ---------- */
  const live = st => st.items.filter(i => !i.trashed);
  function itemsIn(st, ids) { const s = new Set(ids); return live(st).filter(i => s.has(i.folder)); }
  function countIn(st, id, includeSub) {
    if (id === '__all__') return live(st).length;
    if (id === '__trash__') return st.items.filter(i => i.trashed).length;
    const ids = includeSub ? descendants(st, id) : [id];
    return itemsIn(st, ids).length;
  }
  function totalIn(st, id) { return itemsIn(st, descendants(st, id)).length; }

  /* ---------- 文件夹结构变更 ---------- */
  function createFolder(st, name, parent) {
    const f = { id: uid(), name: String(name || '').trim() || '未命名', parent: parent || null };
    st.folders.push(f);
    return f;
  }
  function renameFolder(st, id, name) {
    const f = folderById(st, id); if (!f) return false;
    const v = String(name || '').trim(); if (!v || v === f.name) return false;
    f.name = v; return true;
  }
  /** 放到 newParent 下，插在 beforeId 之前 / afterId 之后；都不给则追加到同级末尾 */
  function placeFolder(st, fid, newParent, beforeId, afterId) {
    const arr = st.folders;
    const i = arr.findIndex(f => f.id === fid);
    if (i < 0) return null;
    const [f] = arr.splice(i, 1);
    f.parent = newParent || null;
    let at = -1;
    if (beforeId) at = arr.findIndex(x => x.id === beforeId);
    else if (afterId) { const k = arr.findIndex(x => x.id === afterId); at = k < 0 ? -1 : k + 1; }
    if (at < 0) {
      const sibs = siblingsOf(st, f.parent);
      const last = sibs[sibs.length - 1];
      at = last ? arr.findIndex(x => x.id === last.id) + 1 : arr.length;
    }
    arr.splice(at, 0, f);
    return f;
  }
  /** 删除分类（含子树）：其内书签进回收站。返回 {folders:removedIds, items:trashedIds} */
  function removeFolder(st, fid) {
    const ds = descendants(st, fid);
    const set = new Set(ds);
    const trashed = [];
    for (const it of st.items) {
      if (!it.trashed && set.has(it.folder)) {
        it.trashed = true; it.prevFolder = it.folder;
        it.prevName = folderPath(st, folderById(st, fid)) || '';
        trashed.push(it.id);
      }
    }
    st.folders = st.folders.filter(f => !set.has(f.id));
    return { folders: ds, items: trashed };
  }

  /* ---------- 书签变更 ---------- */
  function moveItems(st, ids, fid) {
    const set = new Set(ids); let n = 0;
    for (const it of st.items) {
      if (!set.has(it.id)) continue;
      if (it.trashed) { it.trashed = false; it.prevName = null; }
      if (it.folder !== fid) { it.moved = true; n++; }
      it.folder = fid;
    }
    return n;
  }
  function trashItems(st, ids) {
    const set = new Set(ids); let n = 0;
    for (const it of st.items) {
      if (!set.has(it.id) || it.trashed) continue;
      it.trashed = true; it.prevFolder = it.folder;
      it.prevName = folderPath(st, folderById(st, it.folder)) || '';
      n++;
    }
    return n;
  }
  function restoreItems(st, ids) {
    const set = new Set(ids); let n = 0;
    for (const it of st.items) {
      if (!set.has(it.id) || !it.trashed) continue;
      const back = it.prevFolder && folderById(st, it.prevFolder) ? it.prevFolder : (st.folders[0] && st.folders[0].id);
      if (!back) continue;
      it.trashed = false; it.folder = back; it.prevName = null; n++;
    }
    return n;
  }
  function purgeItems(st, ids) {
    const set = new Set(ids); const before = st.items.length;
    st.items = st.items.filter(i => !set.has(i.id));
    return before - st.items.length;
  }
  function renameItem(st, id, name) {
    const it = st.items.find(x => x.id === id); if (!it) return false;
    const v = String(name || '').trim().replace(/\s+/g, ' ');
    if (!v || v === it.name) return false;
    it.name = v; it.moved = true; return true;
  }

  /* ---------- 从任意树构建 ---------- */
  /**
   * nodes: [{name, children:[...]}] 文件夹树 + links
   * 约定节点：{type:'folder', name, children} 或 {type:'link', name, url, added}
   */
  function fromTree(roots, opts) {
    const st = create(opts);
    let seq = 0;
    const addPath = (parent, segs) => {
      let pid = parent;
      for (const s of segs) {
        let f = st.folders.find(x => (x.parent || null) === (pid || null) && x.name === s);
        if (!f) f = createFolder(st, s, pid);
        pid = f.id;
      }
      return pid;
    };
    const walk = (node, parent, pathNames) => {
      for (const c of node.children || []) {
        if (c.type === 'folder') {
          const f = createFolder(st, c.name, parent);
          f.srcId = c.srcId || null;
          walk(c, f.id, pathNames.concat(c.name));
        } else {
          st.items.push({
            id: 'b' + (++seq),
            name: sanitizeName(c.name, c.url),
            url: c.url,
            folder: parent,
            home: parent || null,
            orig: pathNames.join('/'),
            added: c.added || null,
            used: c.used || null,
            visits: c.visits == null ? null : c.visits,
            tags: [], check: null, moved: false, trashed: false,
            prevFolder: null, prevName: null, srcId: c.srcId || null,
          });
        }
      }
    };
    (roots || []).forEach(r => {
      if (r.type === 'folder') {
        const f = createFolder(st, r.name, null);
        f.srcId = r.srcId || null;
        walk(r, f.id, [r.name]);
      } else {                       // 根上直接挂的散链
        let misc = st.folders.find(x => !x.parent && x.name === MISC);
        if (!misc) misc = createFolder(st, MISC, null);
        walk({ children: [r] }, misc.id, [misc.name]);
      }
    });
    st.items.forEach(i => { if (!folderById(st, i.folder)) i.folder = st.folders[0] ? st.folders[0].id : null; });
    return st;
  }

  const MISC = '未归类';

  function sanitizeName(name, url) {
    let n = String(name || '').trim().replace(/\s+/g, ' ');
    if (!n || /^https?:/i.test(n)) {
      try { n = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { n = n || url || '(无标题)'; }
    }
    return n.slice(0, 300);
  }

  const clone = o => JSON.parse(JSON.stringify(o));

  return {
    create, clone, uid, byId, folderById, topFolders, subFolders, siblingsOf, folderPath, depthOf,
    descendants, isDescendant, folderOptions, live, countIn, totalIn, itemsIn,
    createFolder, renameFolder, placeFolder, removeFolder,
    moveItems, trashItems, restoreItems, purgeItems, renameItem,
    fromTree, sanitizeName,
  };
})();
