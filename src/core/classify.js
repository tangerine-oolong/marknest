/* BMO core: classify —— 分类引擎。三层策略：
   keep（默认，完全保留用户原结构）/ domain（按域名聚类的建议）/ rules（用户自定义规则表）。
   所有自动归类都是"提议"，由 UI 决定是否应用；rules 可以批量应用。 */
window.BMO = window.BMO || {};

BMO.Classify = (function () {
  const MULTI = ['com.cn', 'org.cn', 'net.cn', 'gov.cn', 'co.uk', 'com.br', 'co.jp', 'com.tw'];

  function host(url) { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; } }

  /** 粗略主域名：把 com.cn 这类二级后缀算进去 */
  function domainKey(url) {
    const h = host(url); if (!h) return '(无效网址)';
    const parts = h.split('.');
    if (parts.length > 2 && MULTI.includes(parts.slice(-2).join('.'))) return parts.slice(-3).join('.');
    return parts.length > 2 ? parts.slice(-2).join('.') : h;
  }

  /* ---------- 站点聚类 ---------- */
  /** 默认按完整主机名聚类（对书签清理更可操作：同一站点的收藏扎堆）；
   *  opts.by='domain' 时按注册主域名合并（docs.x.com 与 api.x.com 归一组）。 */
  function clusters(state, opts) {
    const o = opts || {};
    const min = o.min || 4;
    const keyOf = o.by === 'domain' ? domainKey : (u => host(u) || '(无效网址)');
    const g = {};
    state.items.filter(i => !i.trashed).forEach(i => {
      const k = keyOf(i.url);
      (g[k] = g[k] || { domain: k, items: [], paths: {} }).items.push(i);
      const p = i.orig || '/'; g[k].paths[p] = (g[k].paths[p] || 0) + 1;
    });
    return Object.values(g)
      .filter(c => c.items.length >= min)
      .map(c => ({
        domain: c.domain, count: c.items.length,
        folders: Object.keys(c.paths).length,
        spread: Object.keys(c.paths).length > 1,
        sample: c.items.slice(0, 3).map(i => i.name.slice(0, 40)),
        ids: c.items.map(i => i.id),
      }))
      .sort((a, b) => b.count - a.count);
  }

  /* ---------- 规则表 ---------- */
  /** rule: {id, enabled, host?, title?, path?, addedBefore?, to:'A/B'}  条件全部命中才算匹配 */
  function matches(item, rule) {
    if (rule.enabled === false) return false;
    const h = host(item.url), p = item.orig || '';
    if (rule.host && !h.includes(rule.host.toLowerCase())) return false;
    if (rule.title && !item.name.toLowerCase().includes(rule.title.toLowerCase())) return false;
    if (rule.path && !p.toLowerCase().includes(rule.path.toLowerCase())) return false;
    if (rule.addedBefore) {
      const cut = Date.parse(rule.addedBefore);
      if (!isFinite(cut)) return false;
      if (!(item.added && item.added < cut / 1000)) return false;
    }
    return !!(rule.host || rule.title || rule.path || rule.addedBefore);
  }

  function firstMatch(item, rules) {
    for (const r of (rules || [])) if (matches(item, r)) return r;
    return null;
  }

  /** 按规则把书签归到目标路径；返回 {moved, created} */
  function applyRules(state, rules, opts) {
    const pathCache = {};
    const ensure = pathStr => {
      if (pathCache[pathStr]) return pathCache[pathStr];
      const segs = String(pathStr || '').split('/').map(s => s.trim()).filter(Boolean);
      if (!segs.length) return null;
      let pid = null;
      for (let i = 0; i < segs.length; i++) {
        const nm = segs[i];
        let f = state.folders.find(x => (x.parent || null) === pid && x.name === nm);
        if (!f) { if (opts && opts.dryRun) return null; f = BMO.Model.createFolder(state, nm, pid); }
        pid = f.id;
      }
      pathCache[pathStr] = pid;
      return pid;
    };
    let moved = 0, created = 0;
    const before = state.folders.length;
    for (const it of state.items) {
      if (it.trashed) continue;
      const r = firstMatch(it, rules); if (!r) continue;
      const fid = ensure(r.to);
      if (fid && it.folder !== fid) { it.folder = fid; it.moved = true; moved++; }
    }
    created = state.folders.length - before;
    return { moved, created };
  }

  /* ---------- 结构整理 ---------- */
  /** 把超过 maxDepth 层的分类上提一层 */
  function flatten(state, maxDepth) {
    const md = maxDepth == null ? 1 : maxDepth;
    let n = 0;
    for (const f of state.folders.filter(x => BMO.Model.depthOf(state, x) > md)) {
      const p = BMO.Model.folderById(state, f.parent);
      if (p && p.parent) { f.parent = p.parent; n++; }
    }
    return n;
  }

  /** 只有 1 条书签且自身没有子分类的文件夹 → 建议并入父级 */
  function singletonFolders(state) {
    const M = BMO.Model;
    return state.folders
      .filter(f => M.totalIn(state, f.id) > 0 && M.subFolders(state, f.id).length === 0 && M.countIn(state, f.id, true) <= 1)
      .map(f => ({ id: f.id, name: f.name, path: M.folderPath(state, f), parent: f.parent,
                   parentName: f.parent ? M.folderPath(state, M.folderById(state, f.parent)) : '顶层',
                   items: M.itemsIn(state, [f.id]).map(i => i.id) }));
  }

  function mergeSingletons(state, ids) {
    const M = BMO.Model; let n = 0;
    for (const id of (ids || singletonFolders(state).map(f => f.id))) {
      const f = M.folderById(state, id); if (!f) continue;
      const items = M.itemsIn(state, [id]);
      if (items.length > 1 || M.subFolders(state, id).length) continue;
      const target = f.parent;
      if (!target) continue;
      M.moveItems(state, items.map(i => i.id), target);
      M.removeFolder(state, id);
      n++;
    }
    return n;
  }

  /** 压平：把某个分类下所有子孙分类的书签提到该分类，再删空壳 */
  function collapse(state, fid) {
    const M = BMO.Model;
    const ds = M.descendants(state, fid).filter(x => x !== fid);
    if (!ds.length) return 0;
    const set = new Set(ds);
    let n = 0;
    for (const it of M.itemsIn(state, ds)) { it.folder = fid; it.moved = true; n++; }
    state.folders = state.folders.filter(f => !set.has(f.id));
    return n;
  }

  return { host, domainKey, clusters, matches, firstMatch, applyRules, flatten, singletonFolders, mergeSingletons, collapse };
})();
