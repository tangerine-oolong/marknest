/* mock chrome.* API —— 只给自动化测试用，让 chrome-adapter 能在普通页面里跑通。
   实现 chrome.bookmarks / chrome.history / chrome.storage.local / chrome.runtime.lastError。 */
window.MockChrome = (function () {
  function seed(tree) {
    const nodes = {};
    let seq = 10;
    const walk = (n, parentId) => {
      const id = n.id || String(++seq);
      nodes[id] = { id, parentId: parentId || null, title: n.title || '', url: n.url || null, children: [], dateAdded: n.dateAdded || Date.now() * 1000 };
      if (parentId && nodes[parentId]) nodes[parentId].children.push(id);
      (n.children || []).forEach(c => walk(c, id));
      return id;
    };
    (tree || []).forEach(r => walk(r, null));
    return nodes;
  }

  function api(initial) {
    const nodes = seed(initial);
    const roots = Object.values(nodes).filter(n => !n.parentId).map(n => n.id);
    roots.forEach(r => { nodes[r].isRoot = true; });
    const history = [];
    const store = {};
    let seq = 1000;

    const kids = id => (nodes[id] ? nodes[id].children : []);
    const detach = n => { if (n.parentId && nodes[n.parentId]) nodes[n.parentId].children = nodes[n.parentId].children.filter(c => c !== n.id); };
    const attach = (n, pid, index) => {
      if (!nodes[pid]) throw new Error('no such folder: ' + pid);
      if (nodes[pid].url) throw new Error('parent is a bookmark, not a folder');
      const arr = nodes[pid].children;
      const i = (index == null || index < 0 || index > arr.length) ? arr.length : index;
      arr.splice(i, 0, n.id); n.parentId = pid;
    };
    const cb = (fn, res) => { if (typeof fn === 'function') setTimeout(() => fn(res), 0); return res; };
    const snapshot = (id) => {
      const n = nodes[id]; if (!n) return null;
      const o = { id: n.id, parentId: n.parentId, title: n.title };
      if (n.url) o.url = n.url; else o.children = kids(n.id).map(snapshot).filter(Boolean);
      return o;
    };

    const bookmarks = {
      getTree: (done) => cb(done, [{ id: '0', title: '', children: roots.map(snapshot) }]),
      get: (id, done) => cb(done, [snapshot(id)].filter(Boolean)),
      getChildren: (id, done) => cb(done, kids(id).map(snapshot).filter(Boolean)),
      create: (arg, done) => {
        if (typeof arg === 'function') { done = arg; arg = arguments[1]; }
        const id = String(++seq);
        const n = { id, parentId: arg.parentId || roots[roots.length - 1], title: arg.title || '', url: arg.url || null, children: [], dateAdded: Date.now() * 1000 };
        nodes[id] = n; attach(n, n.parentId, arg.index);
        return cb(done, snapshot(id));
      },
      update: (id, changes, done) => {
        const n = nodes[id]; if (!n) throw new Error('no node');
        if (changes.title != null) n.title = changes.title;
        if (changes.url != null) n.url = changes.url;
        return cb(done, snapshot(id));
      },
      move: (id, dest, done) => {
        const n = nodes[id]; if (!n) throw new Error('no node');
        if (n.isRoot) throw new Error('cannot move root');
        detach(n);
        attach(n, dest.parentId != null ? dest.parentId : n.parentId, dest.index);
        return cb(done, snapshot(id));
      },
      remove: (id, done) => {
        const n = nodes[id]; if (!n) return cb(done, id);
        if (!n.url) throw new Error('folder: use removeTree');
        detach(n); delete nodes[id];
        return cb(done, id);
      },
      removeTree: (id, done) => {
        const n = nodes[id]; if (!n) return cb(done, id);
        if (n.isRoot) throw new Error('cannot remove root');
        (function del(x) { kids(x).forEach(del); if (nodes[x] && !nodes[x].isRoot) { detach(nodes[x]); delete nodes[x]; } })(id);
        return cb(done, id);
      },
      search: (q, done) => cb(done, Object.values(nodes).filter(n => n.url && (!q.query || n.title.includes(q.query))).map(n => ({ id: n.id, title: n.title, url: n.url }))),
    };

    return {
      __nodes: nodes, __roots: roots, __history: history,
      bookmarks,
      history: {
        search: (q, done) => cb(done, history.filter(h => !q.text || h.url.includes(q.text)).map(h => ({ url: h.url, title: h.title, visitCount: h.visitCount, lastVisitTime: h.lastVisitTime }))),
        __add: h => history.push(h),
      },
      storage: {
        local: {
          get: (keys, done) => {
            const want = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : keys ? Object.keys(keys) : Object.keys(store));
            const out = {}; want.forEach(k => { if (store[k] !== undefined) out[k] = JSON.parse(JSON.stringify(store[k])); });
            return cb(done, out);
          },
          set: (obj, done) => { Object.keys(obj).forEach(k => store[k] = JSON.parse(JSON.stringify(obj[k]))); return cb(done); },
          remove: (keys, done) => { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete store[k]); return cb(done); },
        },
      },
      runtime: { lastError: null },
    };
  }

  return { api };
})();
