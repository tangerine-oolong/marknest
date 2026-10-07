/* BMO core: diff —— 草稿态 vs 源快照 → 可执行的操作序列（供扩展写回浏览器）
   执行顺序保证安全：先建（父先于子）→ 改名 → 移动 → 删条目 → 删分类（深先浅后）。 */
window.BMO = window.BMO || {};

BMO.Diff = (function () {
  const M = () => BMO.Model;

  function compute(state) {
    const Mo = M();
    const snap = state.snapshot;
    if (!snap) return { ops: [], summary: null, unsupported: true };

    const snapFolders = new Map(snap.folders.map(f => [f.srcId, f]));
    const snapItems = new Map(snap.items.map(i => [i.srcId, i]));
    const draftFolderSrcIds = new Set(state.folders.filter(f => f.srcId).map(f => f.srcId));
    const draftItemSrcIds = new Set(state.items.filter(i => i.srcId && !i.trashed).map(i => i.srcId));
    const depth = f => Mo.depthOf(state, f);
    const parentSrcOf = f => {
      if (!f.parent) return null;
      const p = Mo.folderById(state, f.parent);
      if (!p) return null;
      return p.srcId ? { parentSrcId: p.srcId } : { parentRef: p.id };
    };
    const ops = [];

    /* --- 新建分类（浅→深，保证父已存在） --- */
    state.folders.filter(f => !f.srcId)
      .sort((a, b) => depth(a) - depth(b))
      .forEach(f => ops.push(Object.assign({ op: 'createFolder', ref: f.id, name: f.name }, parentSrcOf(f))));

    /* --- 新建条目 --- */
    state.items.filter(i => !i.srcId && !i.trashed).forEach(i => {
      const f = Mo.folderById(state, i.folder);
      ops.push(Object.assign({ op: 'createItem', ref: i.id, title: i.name, url: i.url },
        f ? (f.srcId ? { parentSrcId: f.srcId } : { parentRef: f.id }) : {}));
    });

    /* --- 改名 --- */
    state.folders.filter(f => f.srcId && snapFolders.has(f.srcId))
      .forEach(f => { const s = snapFolders.get(f.srcId); if (s.name !== f.name) ops.push({ op: 'renameFolder', srcId: f.srcId, name: f.name }); });
    state.items.filter(i => i.srcId && snapItems.has(i.srcId) && !i.trashed)
      .forEach(i => { const s = snapItems.get(i.srcId); if (s.name !== i.name) ops.push({ op: 'renameItem', srcId: i.srcId, title: i.name }); });

    /* --- 移动（分类：浅→深；条目一起）--- 注意：比较必须统一用浏览器侧 srcId */
    const srcOfFolder = fid => { const f = Mo.folderById(state, fid); return f && f.srcId ? f.srcId : null; };
    state.folders.filter(f => f.srcId && snapFolders.has(f.srcId)).forEach(f => {
      const s = snapFolders.get(f.srcId);
      const want = srcOfFolder(f.parent);
      const cur = s.parent || null;
      if (want !== cur) ops.push(Object.assign({ op: 'moveFolder', srcId: f.srcId, index: 9999 }, parentSrcOf(f)));
    });
    state.items.filter(i => i.srcId && snapItems.has(i.srcId) && !i.trashed).forEach(i => {
      const s = snapItems.get(i.srcId);
      if (srcOfFolder(i.folder) !== (s.folder || null)) {
        const f = Mo.folderById(state, i.folder);
        if (f) ops.push(Object.assign({ op: 'moveItem', srcId: i.srcId, index: 9999 },
          f.srcId ? { parentSrcId: f.srcId } : { parentRef: f.id }));
      }
    });

    /* --- 删除 --- */
    snapItems.forEach((s, srcId) => { if (!draftItemSrcIds.has(srcId)) ops.push({ op: 'removeItem', srcId }); });
    snap.folders
      .filter(s => !draftFolderSrcIds.has(s.srcId))
      .map(s => ({ s, d: depthOfSnap(snap, s) }))
      .sort((a, b) => b.d - a.d)
      .forEach(x => ops.push({ op: 'removeFolder', srcId: x.s.srcId }));

    const by = k => ops.filter(o => o.op.startsWith(k)).length;
    return {
      ops,
      summary: {
        createFolders: by('createFolder'), createItems: by('createItem'),
        renames: by('renameFolder') + by('renameItem'),
        moves: by('moveFolder') + by('moveItem'),
        removeItems: by('removeItem'), removeFolders: by('removeFolder'),
        total: ops.length,
      },
      unsupported: false,
    };
  }

  function depthOfSnap(snap, f) {
    let d = 0, cur = f; const map = new Map(snap.folders.map(x => [x.srcId, x]));
    while (cur && cur.parent) { d++; cur = map.get(cur.parent); if (d > 20) break; }
    return d;
  }

  /** 人类可读的 ops 摘要（UI 预览用） */
  function describe(state, ops, limit) {
    const Mo = M(); const out = [];
    for (const o of (ops || []).slice(0, limit || 40)) {
      let s = o.op;
      if (o.op === 'createFolder') s += ` ${o.name}`;
      else if (o.op === 'createItem') s += ` ${o.title}`;
      else if (o.op === 'renameFolder' || o.op === 'renameItem') s += ` → ${o.name || o.title}`;
      else if (o.op === 'moveFolder' || o.op === 'moveItem') {
        const f = state.folders.find(x => x.srcId === o.srcId || x.id === o.parentRef);
        s += ` → ${f ? Mo.folderPath(state, Mo.folderById(state, f.id)) : (o.parentSrcId || '顶层')}`;
      } else s += ` ${o.srcId}`;
      out.push(s);
    }
    return out;
  }

  return { compute, describe };
})();
