/* BMO core: parse —— 解析浏览器导出的 Netscape 书签 HTML（容错） */
window.BMO = window.BMO || {};

BMO.Parse = (function () {
  const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u200B-\u200D\uFEFF]/g;
  const clean = s => String(s == null ? '' : s).replace(CTRL, '').replace(/\s+/g, ' ').trim();

  /** ADD_DATE 可能是秒、毫秒或 0 */
  function num(v) {
    const n = parseInt(v, 10);
    if (!isFinite(n) || n <= 0) return null;
    return n > 1e12 ? Math.round(n / 1000) : n;
  }

  function mkFolder(el) {
    return {
      type: 'folder',
      name: clean(el.textContent) || '未命名文件夹',
      children: [],
      toolbar: /true/i.test(el.getAttribute('PERSONAL_TOOLBAR_FOLDER') || ''),
      added: num(el.getAttribute('ADD_DATE')),
    };
  }
  function mkLink(el) {
    return {
      type: 'link',
      name: clean(el.textContent),
      url: clean(el.getAttribute('HREF')),
      added: num(el.getAttribute('ADD_DATE')),
      modified: num(el.getAttribute('LAST_MODIFIED')),
      srcId: el.getAttribute('id') || null,
    };
  }

  /** Netscape 语义：同一个 DL 内，<A> 属于当前文件夹；<H3> 开一个子文件夹，
   *  紧跟其后的那个 <DL> 是它的内容，消耗完就回到当前文件夹（兄弟节点，不能继续往里嵌）。 */
  function pushFolder(el, parent) {
    const node = mkFolder(el);
    parent.children.push(node);
    return node;
  }
  function pushLink(el, parent) {
    const link = mkLink(el);
    if (link.url) parent.children.push(link);
  }
  function consume(el, state, parent) {
    const tag = el.tagName ? el.tagName.toUpperCase() : '';
    if (tag === 'DT') {
      Array.from(el.children).forEach(k => consume(k, state, parent));
      if (!el.children.length) {
        const a = el.querySelector && el.querySelector('a');
        if (a) pushLink(a, state.pending || parent);
      }
      return;
    }
    if (tag === 'H2' || tag === 'H3' || tag === 'H4') { state.pending = pushFolder(el, parent); return; }
    if (tag === 'A') { pushLink(el, state.pending || parent); return; }
    if (tag === 'DL') { parseInto(el, state.pending || parent); state.pending = null; return; }
  }
  function parseInto(container, parent) {
    const state = { pending: null };
    Array.from(container.children).forEach(el => consume(el, state, parent));
    return parent;
  }

  /**
   * @returns {{roots: Array, warnings: string[], stats: object}}
   */
  function html(text) {
    const warnings = [];
    const doc = new DOMParser().parseFromString(String(text || ''), 'text/html');
    const root = { type: 'folder', name: '', children: [] };
    const dls = doc.body ? doc.body.querySelectorAll('dl') : [];
    if (!dls.length) {
      warnings.push('没找到 <DL> 结构，按纯链接列表尽力解析');
      const links = doc.body ? doc.body.querySelectorAll('a') : [];
      links.forEach(a => root.children.push(mkLink(a)));
    } else {
      // 最外层 DL 可能有多个（Chrome 只写一个），逐个并入同一个虚拟根
      Array.from(dls).forEach(dl => {
        if (dl.closest('dl') && dl.parentElement && dl.parentElement.tagName.toUpperCase() === 'DT') return;
        parseInto(dl, root);
      });
    }
    // 丢掉空占位根：若根只有一个子文件夹且根无链接，直接下钻
    let roots = root.children.filter(c => c.type === 'link' ? !!c.url : true);
    const linksAtRoot = roots.filter(c => c.type === 'link');
    if (linksAtRoot.length) {
      const misc = { type: 'folder', name: '未归类', children: [] };
      roots = roots.filter(c => c.type !== 'link');
      misc.children = linksAtRoot;
      roots.unshift(misc);
    }
    const stats = { folders: 0, links: 0, toolbar: null };
    (function count(nodes) {
      for (const n of nodes) {
        if (n.type === 'folder') { stats.folders++; if (n.toolbar && !stats.toolbar) stats.toolbar = n.name; count(n.children); }
        else stats.links++;
      }
    })(roots);
    if (!stats.links) warnings.push('解析结果为 0 条书签，请确认导出的是「书签 HTML」文件');
    return { roots, warnings, stats };
  }

  /** 我们自己的进度 JSON */
  function json(text) {
    const o = JSON.parse(text);
    if (!o || !Array.isArray(o.folders) || !Array.isArray(o.items)) throw new Error('不是本工具的进度 JSON 文件');
    return o;
  }

  return { html, json, clean, num };
})();
