/* BMO ui: app —— 表格视图、选择、拖拽、撤销、分类建议、预检、失效检测、导出/应用 */
(function () {
  'use strict';
  const M = BMO.Model, T = BMO.Tags, CL = BMO.Classify, PF = BMO.Preflight, EX = BMO.Export, DF = BMO.Diff;
  const t = (k, p) => BMO.i18n.t(k, p);
  const $ = s => document.querySelector(s);
  const $$ = (s, root) => Array.prototype.slice.call((root || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const fmtDate = ts => ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '—';
  const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return String(u).slice(0, 40); } };

  /* ---------- 状态 ---------- */
  let S = null, MODE = 'file', AD = null;
  let history = [], future = [];
  let selected = new Set(), selectedFolders = new Set();
  let curFolder = '__all__', query = '', activeTag = '', sortMode = 'default', treeQuery = '';
  let lastClickedIndex = null, lastClickId = null, lastClickTime = 0;
  let lastTreeClickId = null, lastTreeClickTime = 0, lastListKey = null;
  let dragFolderId = null, dragZone = null, checker = null, preflightDone = false;
  let rules = [];

  const folderById = id => M.folderById(S, id);
  const topFolders = () => M.topFolders(S);
  const subFolders = p => M.subFolders(S, p);
  const folderPath = f => M.folderPath(S, f);
  const descendants = id => M.descendants(S, id);
  const depthOf = f => M.depthOf(S, f);
  const live = () => M.live(S);
  const incSub = () => !!(S.ui && S.ui.includeSub);
  const folderIdsFor = id => incSub() ? descendants(id) : [id];
  const countIn = id => M.countIn(S, id, incSub());
  const staleIn = id => {
    const ids = id === '__all__' ? null : folderIdsFor(id);
    return S.items.filter(i => !i.trashed && (ids ? ids.includes(i.folder) : true) && (i.tags || []).includes('stale')).length;
  };
  const searchHere = () => !!(S.ui && S.ui.searchHere);
  const globalSearch = () => query.trim() !== '' && !searchHere() && curFolder !== '__trash__';

  const TAG_LABEL = k => t('tag_' + k);
  const CHIP_ORDER = ['hot', 'stale', 'old3', 'never', 'recent', 'dead'];
  const itemTags = it => it.tags || [];
  const COLS = [
    { k: 'ck', w: 46 }, { k: 'nm', w: 0, label: 'col_name', sort: 'name', resizable: true },
    { k: 'tags', w: 190, label: 'col_tags', resizable: true }, { k: 'dom', w: 200, label: 'col_domain', resizable: true },
    { k: 'loc', w: 180, label: 'col_loc', sort: 'folder', resizable: true }, { k: 'added', w: 92, label: 'col_added', sort: 'added', resizable: true },
    { k: 'used', w: 92, label: 'col_used', sort: 'used', resizable: true }, { k: 'act', w: 112 },
  ];
  const colW = k => (S.ui && S.ui.cols && S.ui.cols[k]) || (COLS.find(c => c.k === k) || {}).w || 0;
  function activeCols() {
    const w = window.innerWidth, gs = globalSearch();
    return COLS.filter(c => {
      if (c.k === 'loc') return gs || w > 1240;
      if (c.k === 'dom') return w > 1040;
      if (c.k === 'added' || c.k === 'used') return w > 880;
      return true;
    });
  }

  /* ---------- 持久化 / 历史 ---------- */
  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { AD.saveDraft(S); $('#save-hint').textContent = AD.storageOk === false ? '⚠ 本地存储不可用，请用「保存进度」导出 JSON' : ''; }
      catch (e) { $('#save-hint').textContent = '⚠ ' + e.message; }
    }, 250);
  }
  function snapshot() { history.push(clone(S)); if (history.length > 200) history.shift(); future.length = 0; }
  function undo() {
    if (!history.length) return toast(t('undo') + ': —');
    future.push(clone(S)); S = history.pop();
    pruneSelection(); save(); render(); toast(t('undo'), t('redo'), redo);
  }
  function redo() {
    if (!future.length) return toast(t('redo') + ': —');
    history.push(clone(S)); S = future.pop();
    pruneSelection(); save(); render(); toast(t('redo'));
  }
  const pruneSelection = () => {
    const ids = new Set(S.items.map(i => i.id)), fs = new Set(S.folders.map(f => f.id));
    selected = new Set([...selected].filter(x => ids.has(x)));
    selectedFolders = new Set([...selectedFolders].filter(x => fs.has(x)));
  };
  const save = () => persist();

  /* ---------- 渲染 ---------- */
  function render() { applyUiPrefs(); renderStats(); renderTree(); renderChips(); renderList(); renderSelbar(); }

  function applyUiPrefs() {
    const ui = Object.assign({ aside: 268 }, S.ui || {});
    const a = $('#aside');
    if (a) { a.style.width = ui.aside + 'px'; a.style.flexBasis = ui.aside + 'px'; }
  }

  function renderStats() {
    const l = live(), trashed = S.items.length - l.length;
    const stale = l.filter(i => (i.tags || []).includes('stale')).length;
    const dead = l.filter(i => i.check === 'fail').length;
    $('#stats').innerHTML =
      `<span>${esc(t('stat_total', { n: S.items.length }))}</span>` +
      `<span>${esc(t('stat_stale', { n: stale }))}</span>` +
      (dead ? `<span>${esc(t('stat_dead', { n: dead }))}</span>` : '') +
      `<span>${esc(t('stat_trash', { n: trashed }))}</span>` +
      `<span>${esc(t('stat_moved', { n: l.filter(i => i.moved).length }))}</span>` +
      `<span>${esc(t('stat_folders', { n: S.folders.length }))}</span>`;
  }

  function renderChips() {
    const pool = S.items.filter(i => curFolder === '__trash__' ? i.trashed : !i.trashed);
    const scope = (curFolder === '__all__' || curFolder === '__trash__') ? pool : pool.filter(i => folderIdsFor(curFolder).includes(i.folder));
    const cnt = k => scope.filter(i => itemTags(i).includes(k)).length;
    $('#filters').innerHTML =
      `<span style="color:var(--faint);font-size:11.5px">标签</span>` +
      `<button class="chip ${activeTag === '' ? 'on' : ''}" data-tag="">${esc(t('all_bookmarks'))} <b>${scope.length}</b></button>` +
      CHIP_ORDER.filter(k => cnt(k) || k === 'dead').map(k =>
        `<button class="chip ${k} ${activeTag === k ? 'on' : ''}" data-tag="${k}">${esc(TAG_LABEL(k))} <b>${cnt(k)}</b></button>`).join('') +
      (activeTag ? `<button class="btn ghost" id="btn-select-filtered" style="margin-left:6px">${esc(t('select_filtered'))}</button>` : '');
    $$('#filters .chip').forEach(c => c.onclick = () => { activeTag = c.dataset.tag === activeTag ? '' : c.dataset.tag; selected.clear(); render(); });
    const bf = $('#btn-select-filtered');
    if (bf) bf.onclick = () => { visibleItems().forEach(i => selected.add(i.id)); render(); toast(`${selected.size}`); };
  }

  /* ---------- 分类树：折叠 + 筛选 ---------- */
  const collapsedSet = () => new Set((S.ui && S.ui.collapsed) || []);
  const setCollapsed = list => { S.ui = Object.assign({}, S.ui, { collapsed: list }); persist(); };
  function collapseAll() { setCollapsed(S.folders.filter(f => subFolders(f.id).length).map(f => f.id)); renderTree(); }
  function expandAll() { setCollapsed([]); renderTree(); }
  function toggleCollapse(id) {
    const s = collapsedSet();
    s.has(id) ? s.delete(id) : s.add(id);
    setCollapsed([...s]); renderTree();
  }
  /** 展开某分类的全部祖先（不含它自己） */
  function revealAncestors(id) {
    const s = collapsedSet(); let changed = false;
    let f = folderById(id);
    while (f && f.parent) { if (s.delete(f.parent)) changed = true; f = folderById(f.parent); }
    if (changed) setCollapsed([...s]);
  }
  function toggleSilent(id) {
    const s = collapsedSet();
    s.has(id) ? s.delete(id) : s.add(id);
    setCollapsed([...s]);
  }
  /** 展开某分类的全部祖先，并把它自己展开（从列表的文件夹行进入时用，保证看得到它和子级） */
  function revealFolder(id) {
    revealAncestors(id);
    const s = collapsedSet();
    if (s.delete(id)) setCollapsed([...s]);
  }
  function treeMatchSet() {
    const q = treeQuery.trim().toLowerCase();
    if (!q) return null;
    const keep = new Set();
    for (const f of S.folders) {
      if (!f.name.toLowerCase().includes(q)) continue;
      keep.add(f.id);
      let p = folderById(f.parent);
      while (p) { keep.add(p.id); p = folderById(p.parent); }
    }
    return keep;
  }

  function renderTree() {
    const tree = $('#tree');
    const match = treeMatchSet();
    const col = collapsedSet();
    const node = f => {
      if (match && !match.has(f.id)) return '';
      const subs = subFolders(f.id).filter(x => !match || match.has(x.id));
      const st = staleIn(f.id);
      const closed = match ? false : col.has(f.id);
      const caret = subs.length ? `<button class="caret" data-act="caret" data-id="${esc(f.id)}" title="${closed ? '展开' : '折叠'}">${closed ? '▸' : '▾'}</button>` : '<span class="caret-sp"></span>';
      return `<div class="tnode">
        <div class="trow ${curFolder === f.id ? 'sel' : ''}" data-folder="${esc(f.id)}" draggable="true">
          ${caret}<span class="tname">${esc(f.name)}</span>
          ${st ? `<span class="tcount" style="color:var(--warn)" title="${esc(t('tag_stale'))} ${st}">${st}⌛</span>` : ''}
          <span class="tcount">${countIn(f.id)}</span>
          <span class="tact">
            <button data-act="newsub" data-id="${esc(f.id)}" title="${esc(t('new_sub'))}">＋</button>
            <button data-act="movefolder" data-id="${esc(f.id)}" title="${esc(t('move_folder'))}">⇄</button>
            <button data-act="rename" data-id="${esc(f.id)}" title="${esc(t('rename'))}">✎</button>
            <button data-act="delfolder" data-id="${esc(f.id)}" title="${esc(t('del_folder'))}">🗑</button>
          </span>
        </div>
        ${subs.length && !closed ? `<div class="tsub">${subs.map(node).join('')}</div>` : ''}
      </div>`;
    };
    tree.innerHTML =
      `<div class="trow ${curFolder === '__all__' ? 'sel' : ''}" data-folder="__all__"><span class="caret-sp"></span><span class="tname">${esc(t('all_bookmarks'))}</span><span class="tcount">${live().length}</span></div>` +
      topFolders().map(node).join('') +
      `<div class="trow ${curFolder === '__trash__' ? 'sel' : ''}" data-folder="__trash__" style="margin-top:10px;border-top:1px solid var(--line2);padding-top:9px">
         <span class="caret-sp"></span><span class="tname">🗑 ${esc(t('trash'))}</span><span class="tcount">${S.items.filter(i => i.trashed).length}</span></div>` +
      (match && !match.size ? `<p class="note" style="padding:8px">${esc(t('no_match'))}</p>` : '');
    bindTreeRows(tree);
  }

  function bindTreeRows(tree) {
    $$('.trow[data-folder]', tree).forEach(row => {
      const fid = row.dataset.folder, isSpecial = fid.indexOf('__') === 0;
      row.onclick = e => {
        const b = e.target.closest('button');
        if (b && b.dataset.act) { e.stopPropagation(); treeAction(b.dataset.act, b.dataset.id); return; }
        // 树行不做双击改名：单击已经承担"选中 + 展开/收起"，双击改名会和它打架
        curFolder = fid; selected.clear(); selectedFolders.clear(); lastClickedIndex = null;
        revealAncestors(fid);
        if (subFolders(fid).length) toggleSilent(fid);   // 点整行即可展开/收起这个分类
        render();
      };
      if (!isSpecial) {
        row.ondragstart = e => {
          dragFolderId = fid;
          e.dataTransfer.setData('application/x-folder', fid); e.dataTransfer.setData('text/plain', 'folder:' + fid);
          e.dataTransfer.effectAllowed = 'move'; row.classList.add('drag'); markDragging(true);
        };
        row.ondragend = () => { dragFolderId = null; dragZone = null; row.classList.remove('drag'); markDragging(false); clearDrop(); };
      }
      row.ondragover = e => {
        if (dragFolderId) { if (folderDragOver(row, fid, e)) return; }
        else if (selectionSize() && !isSpecial) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.classList.add('drop'); }
      };
      row.ondragleave = () => row.classList.remove('drop', 'drop-before', 'drop-after');
      row.ondrop = e => {
        e.preventDefault();
        const z = dragZone; clearDrop();
        if (dragFolderId) { applyFolderDrop(fid, z); return; }
        applyMixedDrop(fid);
      };
    });
  }

  function visibleItems() {
    const q = query.trim().toLowerCase();
    let arr = S.items.filter(i => curFolder === '__trash__' ? i.trashed : !i.trashed);
    if (!globalSearch() && curFolder !== '__all__' && curFolder !== '__trash__') {
      const ids = folderIdsFor(curFolder); arr = arr.filter(i => ids.includes(i.folder));
    }
    if (activeTag) arr = arr.filter(i => itemTags(i).includes(activeTag));
    if (q) arr = arr.filter(i => (i.name + ' ' + i.url + ' ' + (i.orig || '')).toLowerCase().includes(q));
    if (sortMode === 'name') arr = arr.slice().sort((a, b) => a.name.localeCompare(b.name));
    else if (sortMode === 'added') arr = arr.slice().sort((a, b) => (b.added || 0) - (a.added || 0));
    else if (sortMode === 'used') arr = arr.slice().sort((a, b) => (b.used || 0) - (a.used || 0));
    else if (sortMode === 'folder') arr = arr.slice().sort((a, b) => (folderPath(folderById(a.folder)) || '').localeCompare(folderPath(folderById(b.folder)) || ''));
    return arr;
  }

  function renderList() {
    const items = visibleItems();
    const inTrash = curFolder === '__trash__';
    const gs = globalSearch();
    const label = gs ? t('global_search', { q: query.trim() })
      : (curFolder === '__all__' ? t('all_bookmarks') : curFolder === '__trash__' ? t('trash') : (folderPath(folderById(curFolder)) || ''));
    const span = gs ? t('across_folders', { n: new Set(items.map(i => i.folder)).size }) : '';
    const scope = !gs && curFolder !== '__all__' && curFolder !== '__trash__' ? ' · ' + (incSub() ? t('scope_with_sub') : t('scope_only')) : '';
    $('#crumb').innerHTML = `<b>${esc(label)}</b><span>${items.length}${span}${scope}${activeTag ? ' · ' + esc(TAG_LABEL(activeTag)) : ''}</span>`;
    $('#inc-sub').checked = incSub();
    const sh = $('#search-here'); sh.checked = searchHere(); sh.disabled = !query.trim();
    const list = $('#list');
    const subs = (curFolder !== '__all__' && curFolder !== '__trash__') ? subFolders(curFolder) : [];
    const key = [curFolder, query, activeTag, sortMode].join('|');
    const keep = key === lastListKey ? list.scrollTop : 0; lastListKey = key;

    if (!items.length && !subs.length) {
      list.innerHTML = `<div class="empty"><p>${inTrash ? esc(t('trash')) + ' ∅' : '∅'}</p><p style="font-size:12px">${gs ? esc(t('search_here')) : ''}</p></div>`;
      list.scrollTop = keep; return;
    }
    const cols = activeCols();
    const colgroup = cols.map(c => {
      const w = c.k === 'nm' && nmFloor(cols) ? nmFloor(cols) : colW(c.k);
      return `<col data-col="${c.k}"${w ? ` style="width:${w}px"` : ''}>`;
    }).join('');
    const heads = cols.map(c => {
      const cls = [c.k === 'ck' ? 'ck' : '', c.sort ? 'sortable' : ''].join(' ').trim();
      const inner = c.k === 'ck'
        ? `<input type="checkbox" id="ck-all" ${allChecked(items, subs) ? 'checked' : ''}>`
        : esc(t(c.label));
      return `<th class="${cls}"${c.sort ? ` data-sort="${c.sort}"` : ''}>${inner}${c.resizable ? `<span class="col-resize" data-col="${c.k}"></span>` : ''}</th>`;
    }).join('');
    list.innerHTML = `<table><colgroup>${colgroup}</colgroup><thead><tr>${heads}</tr></thead><tbody>${
      subs.map(f => folderRow(f, cols)).join('')}${items.map((i, idx) => itemRow(i, idx, inTrash, cols)).join('')}</tbody></table>`;
    list.scrollTop = keep;
    bindListRows(list, items, subs);
  }

  const selectionSize = () => selected.size + selectedFolders.size;
  const allChecked = (items, subs) => (items.length + subs.length) > 0 &&
    items.every(i => selected.has(i.id)) && subs.every(f => selectedFolders.has(f.id));
  function nmFloor(cols) {
    const avail = ($('#list').clientWidth || 800);
    const sum = cols.filter(c => c.k !== 'nm').reduce((a, c) => a + (colW(c.k) || 0), 0);
    return (avail - sum) < 140 ? 140 : 0;
  }

  function itemRow(i, idx, inTrash, cols) {
    const f = folderById(i.folder);
    const chips = itemTags(i).map(k => `<span class="tag ${k}">${esc(TAG_LABEL(k))}</span>`).join('') +
      (i.check === 'timeout' ? `<span class="tag timeout">${esc(t('tag_timeout'))}</span>` : '') +
      (i.check === 'http' ? `<span class="tag insecure">${esc(t('tag_insecure'))}</span>` : '');
    const cell = {
      ck: `<td class="ck"><input type="checkbox" ${selected.has(i.id) ? 'checked' : ''}></td>`,
      nm: `<td class="nm"><div class="nmwrap">${i.moved ? '<span class="dot"></span>' : ''}
             <span class="nmtext" title="${esc(i.name)}&#10;${esc(i.url)}&#10;${esc(i.orig || '')}">${esc(i.name)}</span></div></td>`,
      tags: `<td><div class="tags">${chips || '<span style="color:#d3d7dd">—</span>'}</div></td>`,
      dom: `<td class="dom" title="${esc(i.url)}">${esc(hostOf(i.url))}</td>`,
      loc: `<td class="orig">${esc(inTrash && i.prevName ? i.prevName : (f ? folderPath(f) : t('uncategorized')))}</td>`,
      added: `<td class="date">${fmtDate(i.added)}</td>`,
      used: `<td class="date">${i.used ? fmtDate(i.used) : `<span style="color:#c8cdd4">${esc(t('never'))}</span>`}</td>`,
      act: `<td><div class="rowact">${inTrash
        ? `<button data-act="restore" title="${esc(t('undo'))}">↩</button><button data-act="purge" class="del" title="×">✕</button>`
        : `<button data-act="open" title="↗">↗</button><button data-act="rename" title="${esc(t('rename'))}">✎</button>
           <button data-act="mv" title="${esc(t('move_to'))}">⇄</button><button data-act="del" class="del" title="${esc(t('del'))}">🗑</button>`}</div></td>`,
    };
    return `<tr data-id="${esc(i.id)}" data-idx="${idx}" class="${selected.has(i.id) ? 'sel' : ''}" draggable="${inTrash ? 'false' : 'true'}">${
      cols.map(c => cell[c.k]).join('')}</tr>`;
  }

  function folderRow(f, cols) {
    const n = countIn(f.id), st = staleIn(f.id), subs = subFolders(f.id).length;
    const on = selectedFolders.has(f.id);
    const cell = {
      ck: `<td class="ck"><input type="checkbox" ${on ? 'checked' : ''}></td>`,
      nm: `<td class="nm"><div class="nmwrap"><span class="ficon">📁</span><span class="nmtext">${esc(f.name)}</span></div></td>`,
      tags: `<td><div class="tags"><span class="tag">${n}</span>${st ? `<span class="tag stale">${esc(t('tag_stale'))} ${st}</span>` : ''}</div></td>`,
      dom: `<td class="dom" style="color:#b9c0c9">${subs ? subs + ' ↘' : ''}</td>`,
      loc: `<td class="orig">${esc(f.parent ? (folderPath(folderById(f.parent)) || '') : t('top_level'))}</td>`,
      added: '<td class="date"></td>', used: '<td class="date"></td>',
      act: `<td><div class="rowact"><button data-fact="rename" title="${esc(t('rename'))}">✎</button>
             <button data-fact="movefolder" title="${esc(t('move_folder'))}">⇄</button>
             <button data-fact="delfolder" class="del" title="${esc(t('del_folder'))}">🗑</button></div></td>`,
    };
    return `<tr class="frow ${on ? 'sel' : ''}" data-folder="${esc(f.id)}" draggable="true">${cols.map(c => cell[c.k]).join('')}</tr>`;
  }

  function bindListRows(list, items, subs) {
    const ckAll = $('#ck-all');
    if (ckAll) ckAll.onchange = e => {
      if (e.target.checked) { items.forEach(i => selected.add(i.id)); subs.forEach(f => selectedFolders.add(f.id)); }
      else { items.forEach(i => selected.delete(i.id)); subs.forEach(f => selectedFolders.delete(f.id)); }
      updateSelectionUI();
    };
    const ckHead = list.querySelector('th.ck');
    if (ckHead) ckHead.onclick = e => {
      if (e.target.id === 'ck-all') return;
      if (ckAll) { ckAll.checked = !ckAll.checked; ckAll.dispatchEvent(new Event('change', { bubbles: true })); }
    };
    $$('th.sortable', list).forEach(th => th.onclick = e => {
      if (e.target.closest('.col-resize')) return;
      const m = th.dataset.sort; sortMode = sortMode === m ? 'default' : m; renderSortLabel(); renderList();
    });

    $$('tbody tr:not(.frow)', list).forEach(tr => {
      const id = tr.dataset.id, idx = +tr.dataset.idx;
      const box = tr.querySelector('td.ck input');
      if (box) box.onchange = e => { e.target.checked ? selected.add(id) : selected.delete(id); lastClickedIndex = idx; updateSelectionUI(); };
      const cell = tr.querySelector('td.ck');
      if (cell) cell.onclick = e => {
        e.stopPropagation();
        if (e.target.tagName === 'INPUT') return;
        selected.has(id) ? selected.delete(id) : selected.add(id);
        lastClickedIndex = idx; updateSelectionUI();
      };
      tr.onclick = e => {
        if (e.target.closest('button') || e.target.isContentEditable || e.target.tagName === 'INPUT') return;
        const plain = !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
        if (plain && lastClickId === id && Date.now() - lastClickTime < 420) { lastClickId = null; startRename(tr.querySelector('.nmtext'), id); return; }
        if (plain) { lastClickId = id; lastClickTime = Date.now(); }
        if (e.metaKey || e.ctrlKey) { selected.has(id) ? selected.delete(id) : selected.add(id); }
        else if (e.shiftKey) {
          const anchor = lastClickedIndex !== null ? lastClickedIndex
            : (() => { const f = items.findIndex(x => selected.has(x.id)); return f >= 0 ? f : idx; })();
          for (let k = Math.min(anchor, idx); k <= Math.max(anchor, idx); k++) if (items[k]) selected.add(items[k].id);
        } else { selected.clear(); selectedFolders.clear(); selected.add(id); }
        lastClickedIndex = idx; updateSelectionUI();
      };
      tr.ondragstart = e => {
        if (!selected.has(id)) { selected.clear(); selectedFolders.clear(); selected.add(id); updateSelectionUI(); }
        tr.classList.add('drag'); markDragging(true);
        e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id);
        const n = selectionSize(); if (n > 1 && e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(dragBadge(n), 16, 16);
      };
      tr.ondragend = () => { tr.classList.remove('drag'); markDragging(false); };
      const b = a => tr.querySelector(`[data-act=${a}]`);
      if (b('open')) b('open').onclick = () => window.open(S.items.find(x => x.id === id).url, '_blank');
      if (b('rename')) b('rename').onclick = () => startRename(tr.querySelector('.nmtext'), id);
      if (b('mv')) b('mv').onclick = () => openMove([id], []);
      if (b('del')) b('del').onclick = () => deleteMixed([id], []);
      if (b('restore')) b('restore').onclick = () => restoreItems([id]);
      if (b('purge')) b('purge').onclick = () => purgeItems([id]);
    });

    $$('tr.frow', list).forEach(tr => {
      const fid = tr.dataset.folder;
      const box = tr.querySelector('td.ck input');
      if (box) box.onchange = e => { e.target.checked ? selectedFolders.add(fid) : selectedFolders.delete(fid); updateSelectionUI(); };
      const cell = tr.querySelector('td.ck');
      if (cell) cell.onclick = e => {
        e.stopPropagation();
        if (e.target.tagName === 'INPUT') return;
        selectedFolders.has(fid) ? selectedFolders.delete(fid) : selectedFolders.add(fid); updateSelectionUI();
      };
      tr.onclick = e => {
        if (e.target.tagName === 'INPUT') return;
        const b = e.target.closest('button');
        if (b && b.dataset.fact) { e.stopPropagation(); treeAction(b.dataset.fact, fid); return; }
        if (e.metaKey || e.ctrlKey) { selectedFolders.has(fid) ? selectedFolders.delete(fid) : selectedFolders.add(fid); updateSelectionUI(); return; }
        if (lastTreeClickId === fid && Date.now() - lastTreeClickTime < 420) { lastTreeClickId = null; treeAction('rename', fid); return; }
        lastTreeClickId = fid; lastTreeClickTime = Date.now();
        curFolder = fid; selected.clear(); selectedFolders.clear(); revealFolder(fid); render();
      };
      tr.ondragstart = e => {
        if (!selectedFolders.has(fid)) { selectedFolders.clear(); selectedFolders.add(fid); selected.clear(); updateSelectionUI(); }
        dragFolderId = fid;
        e.dataTransfer.setData('application/x-folder', fid); e.dataTransfer.setData('text/plain', 'folder:' + fid);
        e.dataTransfer.effectAllowed = 'move'; tr.classList.add('drag'); markDragging(true);
        const n = selectionSize(); if (n > 1 && e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(dragBadge(n), 16, 16);
      };
      tr.ondragend = () => { dragFolderId = null; dragZone = null; tr.classList.remove('drag'); markDragging(false); clearDrop(); };
      tr.ondragover = e => {
        if (dragFolderId) folderDragOver(tr, fid, e);
        else if (selected.size) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; tr.classList.add('drop'); }
      };
      tr.ondragleave = () => tr.classList.remove('drop', 'drop-before', 'drop-after');
      tr.ondrop = e => {
        e.preventDefault(); const z = dragZone; clearDrop();
        if (dragFolderId) { applyFolderDrop(fid, z); return; }
        applyMixedDrop(fid);
      };
    });
  }

  function updateSelectionUI() {
    const rows = $$('tbody tr:not(.frow)', $('#list'));
    rows.forEach(tr => {
      const on = selected.has(tr.dataset.id);
      tr.classList.toggle('sel', on);
      const c = tr.querySelector('td.ck input'); if (c) c.checked = on;
    });
    const frows = $$('tr.frow', $('#list'));
    frows.forEach(tr => {
      const on = selectedFolders.has(tr.dataset.folder);
      tr.classList.toggle('sel', on);
      const c = tr.querySelector('td.ck input'); if (c) c.checked = on;
    });
    const all = $('#ck-all');
    if (all) all.checked = (rows.length + frows.length) > 0 && rows.every(tr => selected.has(tr.dataset.id)) && frows.every(tr => selectedFolders.has(tr.dataset.folder));
    renderSelbar();
  }

  function renderSelbar() {
    const n = selected.size, m = selectedFolders.size;
    $('#selbar').classList.toggle('hide', !n && !m);
    if (n || m) $('#selcount').innerHTML = esc(t('sel_items', { n })) + (m ? esc(t('sel_folders', { n: m })) : '')
      + `<span style="color:var(--muted);margin-left:10px">${esc(t('sel_hint'))}</span>`;
    const cs = $('#btn-clear-sel');
    cs.disabled = !(n + m); cs.textContent = n + m ? `${t('clear_sel')} (${n + m})` : t('clear_sel');
  }

  function renderSortLabel() {
    const map = { default: '默认', name: t('col_name'), added: t('col_added'), used: t('col_used'), folder: t('col_loc') };
    $('#btn-sort').textContent = `${t('sort')}：${map[sortMode] || sortMode}`;
  }

  /* ---------- 拖拽落点 ---------- */
  function dropZone(row, e) {
    const r = row.getBoundingClientRect(), y = (e.clientY - r.top) / Math.max(1, r.height);
    return y < 0.3 ? 'before' : y > 0.7 ? 'after' : 'into';
  }
  function clearDrop(scope) {
    (scope || document).querySelectorAll('.drop,.drop-before,.drop-after')
      .forEach(x => x.classList.remove('drop', 'drop-before', 'drop-after'));
  }
  function folderDragOver(row, fid, e) {
    const blocked = fid === dragFolderId || fid === '__trash__' || (fid !== '__all__' && descendants(dragFolderId).includes(fid));
    clearDrop();
    if (blocked) { dragZone = null; return false; }
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const z = fid === '__all__' ? 'into' : dropZone(row, e);
    dragZone = z; row.classList.add(z === 'into' ? 'drop' : 'drop-' + z);
    return true;
  }
  function dragBadge(n) {
    const el = document.createElement('div');
    el.className = 'drag-badge'; el.textContent = `${n}`;
    document.body.appendChild(el); setTimeout(() => el.remove(), 0);
    return el;
  }
  function markDragging(on) { $$('#list tbody tr.sel').forEach(x => x.classList.toggle('dragging', on)); }

  function applyFolderDrop(targetFid, zone) {
    const src = dragFolderId; dragFolderId = null; const z = zone; dragZone = null;
    $$('.drag').forEach(x => x.classList.remove('drag')); markDragging(false); clearDrop();
    if (!src) return;
    if (z === 'before' || z === 'after') { reorderFolder(src, targetFid, z); return; }
    const target = targetFid === '__all__' ? null : targetFid;
    const ok = x => target === null || (x !== target && !descendants(x).includes(target));
    const carried = [...selectedFolders].filter(ok);
    if (!carried.includes(src) && ok(src)) carried.push(src);
    const iids = target === null ? [] : [...selected];
    if (!carried.length && !iids.length) return;
    snapshot();
    carried.forEach(x => M.placeFolder(S, x, target, null, null));
    if (iids.length) M.moveItems(S, iids, target);
    selected.clear(); selectedFolders.clear(); persist(); render();
    toast(target === null ? `${carried.length} → ${t('top_level')}` : `${carried.length} → ${folderById(target).name}`, t('undo'), undo);
  }

  function applyMixedDrop(targetFid) {
    if (!targetFid || targetFid.indexOf('__') === 0) return;
    const fids = [...selectedFolders].filter(x => x !== targetFid && !descendants(x).includes(targetFid));
    const iids = [...selected];
    if (!fids.length && !iids.length) return;
    snapshot();
    if (iids.length) M.moveItems(S, iids, targetFid);
    fids.forEach(x => M.placeFolder(S, x, targetFid, null, null));
    selected.clear(); selectedFolders.clear(); persist(); render();
    toast(`${iids.length} ${fids.length ? '+ ' + fids.length : ''} → ${folderById(targetFid).name}`, t('undo'), undo);
  }

  /* ---------- 操作 ---------- */
  function reorderFolder(srcId, targetId, zone) {
    const src = folderById(srcId), target = folderById(targetId);
    if (!src || !target || srcId === targetId) return;
    if (descendants(srcId).includes(targetId)) return toast('⚠');
    const newParent = target.parent || null;
    const ids = M.siblingsOf(S, newParent).map(f => f.id).filter(x => x !== srcId);
    const ti = ids.indexOf(targetId);
    const desired = ids.slice(); desired.splice(zone === 'before' ? ti : ti + 1, 0, srcId);
    if ((src.parent || null) === newParent && M.siblingsOf(S, newParent).map(f => f.id).join('|') === desired.join('|')) return toast('·');
    snapshot();
    M.placeFolder(S, srcId, newParent, zone === 'before' ? targetId : null, zone === 'after' ? targetId : null);
    persist(); render(); toast(`↕ ${src.name}`, t('undo'), undo);
  }

  function deleteMixed(itemIds, folderIds) {
    folderIds = [...new Set(folderIds)].filter(f => folderById(f));
    itemIds = itemIds.filter(id => { const i = S.items.find(x => x.id === id); return i && !i.trashed; });
    if (!itemIds.length && !folderIds.length) return;
    const tn = folderIds.reduce((a, f) => a + M.totalIn(S, f), 0);
    const run = () => {
      snapshot();
      const n = M.trashItems(S, itemIds);
      folderIds.forEach(f => M.removeFolder(S, f));
      if (curFolder !== '__all__' && curFolder !== '__trash__' && !folderById(curFolder)) curFolder = '__all__';
      selected.clear(); selectedFolders.clear(); persist(); render();
      toast(`${n} + ${folderIds.length}`, t('undo'), undo);
    };
    folderIds.length ? confirmBox(t('del_folder') + ' × ' + folderIds.length,
      `${tn} · ${itemIds.length} · ${t('trash')}`, run) : run();
  }
  function restoreItems(ids) {
    snapshot(); const n = M.restoreItems(S, ids);
    persist(); render(); toast(`↩ ${n}`, t('undo'), undo);
  }
  function purgeItems(ids) {
    snapshot(); const n = M.purgeItems(S, ids);
    persist(); render(); toast(`✕ ${n}`, t('undo'), undo);
  }
  function goHome(ids) {
    const list = ids.filter(id => { const i = S.items.find(x => x.id === id); return i && i.home && folderById(i.home) && i.folder !== i.home; });
    if (!list.length) return toast('·');
    snapshot();
    list.forEach(id => { const i = S.items.find(x => x.id === id); if (i) { i.folder = i.home; i.moved = true; } });
    selected.clear(); persist(); render(); toast(`⌂ ${list.length}`, t('undo'), undo);
  }
  function treeAction(act, id) {
    if (act === 'caret') toggleCollapse(id);
    else if (act === 'movefolder') openMoveFolder(id);
    else if (act === 'rename') promptText(t('rename'), folderById(id).name, v => {
      if (!v) return; snapshot(); M.renameFolder(S, id, v); persist(); render(); toast('✎', t('undo'), undo);
    });
    else if (act === 'newsub') promptText(t('new_sub'), '', v => {
      if (!v) return; snapshot(); M.createFolder(S, v, id); persist(); render(); toast('+', t('undo'), undo);
    });
    else if (act === 'delfolder') deleteMixed([], [id]);
  }
  function startRename(el, id) {
    const it = S.items.find(x => x.id === id); if (!el || !it || el.contentEditable === 'true') return;
    el.contentEditable = 'true'; el.scrollIntoView({ block: 'nearest' }); el.focus();
    const range = document.createRange(); range.selectNodeContents(el);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    let done = false;
    const finish = commit => {
      if (done) return; done = true; el.contentEditable = 'false';
      const v = el.textContent.trim().replace(/\s+/g, ' ');
      const changed = commit && v && v !== it.name;
      if (changed) { snapshot(); M.renameItem(S, id, v); persist(); }
      render(); if (changed) toast('✎', t('undo'), undo);
    };
    el.onblur = () => finish(true);
    el.onkeydown = e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); el.onblur = null; finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); el.onblur = null; el.textContent = it.name; finish(false); }
    };
    el.onclick = e => e.stopPropagation();
  }

  /* ---------- 弹窗 ---------- */
  function closeModal() { $('#modal-root').innerHTML = ''; }
  function shell(title, body, foot, wide) {
    $('#modal-root').innerHTML = `<div class="mask"><div class="modal${wide ? ' wide' : ''}">
      <h3>${esc(title)}</h3><div class="body">${body}</div><div class="foot">${foot}</div></div></div>`;
    $('#modal-root .mask').addEventListener('click', e => { if (e.target.classList.contains('mask')) closeModal(); });
    return $('#modal-root .modal');
  }
  function promptText(title, value, onOk) {
    const m = shell(title, `<div class="field"><input id="pv" value="${esc(value)}"></div>`,
      `<button class="btn ghost" data-x>${esc(t('cancel'))}</button><button class="btn primary" data-ok>${esc(t('confirm'))}</button>`);
    const inp = m.querySelector('#pv'); inp.focus(); inp.select();
    m.querySelector('[data-x]').onclick = closeModal;
    const ok = () => { closeModal(); onOk(inp.value.trim()); };
    m.querySelector('[data-ok]').onclick = ok;
    inp.onkeydown = e => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') closeModal(); };
  }
  function confirmBox(title, detail, onOk) {
    const m = shell(title, `<p class="note">${esc(detail)}</p>`,
      `<button class="btn ghost" data-x>${esc(t('cancel'))}</button><button class="btn danger" data-ok>${esc(t('confirm'))}</button>`);
    m.querySelector('[data-x]').onclick = closeModal;
    m.querySelector('[data-ok]').onclick = () => { closeModal(); onOk(); };
  }
  function pickerHtml(pick, exclude) {
    return M.folderOptions(S, exclude).map(({ f, depth }) =>
      `<div class="fpick ${pick === f.id ? 'on' : ''}" data-f="${esc(f.id)}" style="margin-left:${depth * 16}px" data-name="${esc(f.name.toLowerCase())}">
        <span class="fp-branch">${depth ? '└' : ''}</span><span class="fp-name">${esc(f.name)}</span>
        <span class="cnt">${M.countIn(S, f.id, true)}</span></div>`).join('');
  }
  function bindPickerFilter(root) {
    const inp = root.querySelector('#fp-filter'); if (!inp) return;
    const rows = Array.prototype.slice.call(root.querySelectorAll('.fpick'));
    rows.forEach(r => r.dataset.depth = Math.round((parseFloat(r.style.marginLeft) || 0) / 16));
    inp.oninput = () => {
      const q = inp.value.trim().toLowerCase();
      rows.forEach(r => r.style.display = '');
      if (!q) return;
      const show = new Set();
      rows.forEach((r, idx) => {
        if (r.dataset.pin) { show.add(r); return; }
        if (!(r.dataset.name || '').includes(q)) return;
        show.add(r);
        let d = +r.dataset.depth;
        for (let k = idx - 1; k >= 0 && d > 0; k--) { const kd = +rows[k].dataset.depth; if (kd < d) { show.add(rows[k]); d = kd; } }
      });
      rows.forEach(r => { if (!show.has(r)) r.style.display = 'none'; });
    };
  }
  function openMove(ids, folderIds, preset) {
    folderIds = folderIds || [];
    let pick = preset || (ids.length === 1 && !folderIds.length ? (S.items.find(i => i.id === ids[0]) || {}).folder : null);
    const exclude = folderIds.reduce((a, x) => a.concat(descendants(x)), []);
    const m = shell(`${t('move_to')} ${ids.length}${folderIds.length ? ' + ' + folderIds.length : ''}`,
      `<div class="field"><input id="fp-filter" placeholder="⌕"></div>
       <div class="picklist">${pickerHtml(pick, exclude)}</div>
       <div class="field"><label>${esc(t('new_category'))}</label><input id="np"></div>`,
      `<button class="btn ghost" data-x>${esc(t('cancel'))}</button><button class="btn primary" data-ok>${esc(t('confirm'))}</button>`);
    bindPickerFilter(m);
    m.querySelectorAll('.fpick').forEach(el => el.onclick = () => {
      pick = el.dataset.f; m.querySelectorAll('.fpick').forEach(x => x.classList.toggle('on', x === el));
    });
    m.querySelector('[data-x]').onclick = closeModal;
    m.querySelector('[data-ok]').onclick = () => {
      const np = m.querySelector('#np').value.trim();
      closeModal();
      if (!np && !pick) return toast('⚠');
      snapshot();
      let fid = pick;
      if (np) { const f = M.createFolder(S, np, null); fid = f.id; }
      const n = M.moveItems(S, ids, fid);
      let nf = 0;
      folderIds.forEach(x => { if (x !== fid && !descendants(x).includes(fid)) { M.placeFolder(S, x, fid, null, null); nf++; } });
      selected.clear(); selectedFolders.clear(); persist(); render();
      toast(`${n}${nf ? ' + ' + nf : ''} → ${folderById(fid).name}`, t('undo'), undo);
    };
  }
  function openMoveFolder(fid) {
    const f = folderById(fid); if (!f) return;
    const ex = descendants(fid);
    let pick = f.parent || '__top__';
    const m = shell(`${t('move_folder')} · ${f.name}`,
      `<p class="note">${M.totalIn(S, fid)} · ${ex.length - 1}</p>
       <div class="field"><input id="fp-filter" placeholder="⌕"></div>
       <div class="picklist">
         <div class="fpick ${pick === '__top__' ? 'on' : ''}" data-f="__top__" data-name="top ⬆" data-pin="1"><span class="fp-branch"></span><span class="fp-name">⬆ ${esc(t('top_level'))}</span></div>
         ${pickerHtml(pick === '__top__' ? null : pick, ex)}
       </div>`,
      `<button class="btn ghost" data-x>${esc(t('cancel'))}</button><button class="btn primary" data-ok>${esc(t('confirm'))}</button>`);
    bindPickerFilter(m);
    m.querySelectorAll('.fpick').forEach(el => el.onclick = () => {
      pick = el.dataset.f; m.querySelectorAll('.fpick').forEach(x => x.classList.toggle('on', x === el));
    });
    m.querySelector('[data-x]').onclick = closeModal;
    m.querySelector('[data-ok]').onclick = () => { closeModal(); reparentFolder(fid, pick === '__top__' ? null : pick); };
  }
  function reparentFolder(fid, newParent) {
    const f = folderById(fid); if (!f) return;
    if (fid === newParent) return toast('⚠');
    if (newParent && descendants(fid).includes(newParent)) return toast('⚠');
    if ((f.parent || null) === (newParent || null)) return toast('·');
    snapshot(); M.placeFolder(S, fid, newParent, null, null);
    persist(); render(); toast(`${f.name} → ${newParent ? folderById(newParent).name : t('top_level')}`, t('undo'), undo);
  }

  /* ---------- 分类建议面板 ---------- */
  let classifyTab = 'domain';
  function openClassify() {
    const clusters = CL.clusters(S, { min: 4 });
    const singles = CL.singletonFolders(S);
    const body = `
      <div class="tabs">
        <button class="tab ${classifyTab === 'domain' ? 'on' : ''}" data-tab="domain">${esc(t('strat_domain'))}</button>
        <button class="tab ${classifyTab === 'rules' ? 'on' : ''}" data-tab="rules">${esc(t('strat_rules'))}</button>
        <button class="tab ${classifyTab === 'ops' ? 'on' : ''}" data-tab="ops">结构整理</button>
      </div>
      <div id="tabpane"></div>`;
    const m = shell(t('classify_title'), body, `<button class="btn ghost" data-x>${esc(t('close'))}</button>`, true);
    m.querySelector('[data-x]').onclick = closeModal;
    const pane = m.querySelector('#tabpane');
    const draw = () => {
      m.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === classifyTab));
      if (classifyTab === 'domain') {
        pane.innerHTML = clusters.length
          ? `<p class="note">${clusters.length} ${esc(t('strat_domain'))}</p><div class="klist">` + clusters.slice(0, 40).map((c, i) =>
            `<div class="krow"><span class="kmain">${esc(c.domain)}</span><span class="kmeta">${c.count} · ${c.folders}${c.spread ? ' ⤷' : ''}</span>
               <button class="btn" data-cluster="${i}">${esc(t('apply'))}</button></div>`).join('') + '</div>'
          : `<p class="note">—</p>`;
        pane.querySelectorAll('[data-cluster]').forEach(b => b.onclick = () => {
          const c = clusters[+b.dataset.cluster];
          snapshot();
          const f = M.createFolder(S, c.domain, null);
          M.moveItems(S, c.ids, f.id);
          persist(); render(); closeModal(); toast(`${c.count} → ${c.domain}`, t('undo'), undo);
        });
      } else if (classifyTab === 'rules') {
        pane.innerHTML = `<div class="rules" id="rules"></div>
          <div style="margin-top:10px;display:flex;gap:8px">
            <button class="btn" id="rule-add">${esc(t('new_category'))}</button>
            <button class="btn primary" id="rule-run">${esc(t('apply_all'))}</button>
            <button class="btn ghost" id="rule-io">JSON ⇅</button></div>`;
        const drawRules = () => {
          pane.querySelector('#rules').innerHTML = rules.length ? rules.map((r, i) => `
            <div class="rule" data-i="${i}">
              <input data-f="host" placeholder="${esc(t('rule_host'))}" value="${esc(r.host || '')}">
              <input data-f="title" placeholder="${esc(t('rule_title'))}" value="${esc(r.title || '')}">
              <input data-f="path" placeholder="${esc(t('rule_path'))}" value="${esc(r.path || '')}">
              <input data-f="addedBefore" type="date" title="${esc(t('rule_before'))}" value="${esc(r.addedBefore || '')}">
              <input data-f="to" placeholder="${esc(t('rule_to'))} A/B" value="${esc(r.to || '')}">
              <button class="btn ghost" data-del="${i}">✕</button></div>`).join('')
            : `<p class="note">${esc(t('strat_keep'))}</p>`;
          pane.querySelectorAll('.rule').forEach(el => {
            const i = +el.dataset.i;
            el.querySelectorAll('[data-f]').forEach(inp => inp.onchange = () => { rules[i][inp.dataset.f] = inp.value; });
            el.querySelector('[data-del]').onclick = () => { rules.splice(i, 1); drawRules(); };
          });
        };
        drawRules();
        pane.querySelector('#rule-add').onclick = () => { rules.push({ id: Math.random().toString(36).slice(2, 7), enabled: true, to: '' }); drawRules(); };
        pane.querySelector('#rule-run').onclick = () => {
          const valid = rules.filter(r => (r.host || r.title || r.path || r.addedBefore) && r.to);
          if (!valid.length) return toast('⚠');
          snapshot(); const r = CL.applyRules(S, valid);
          persist(); render(); closeModal(); toast(`+${r.created} · ${r.moved}`, t('undo'), undo);
        };
        pane.querySelector('#rule-io').onclick = () => {
          const txt = prompt('rules JSON', JSON.stringify(rules));
          if (txt) { try { rules = JSON.parse(txt); drawRules(); } catch (e) { toast('⚠ JSON'); } }
        };
      } else {
        pane.innerHTML = `<div class="klist">
          <div class="krow"><span class="kmain">压平层级 &gt; 2</span><span class="kmeta">${S.folders.filter(f => depthOf(f) > 1).length}</span><button class="btn" id="op-flatten">${esc(t('apply'))}</button></div>
          <div class="krow"><span class="kmain">合并只有 1 条书签的碎片分类</span><span class="kmeta">${singles.length}</span><button class="btn" id="op-single">${esc(t('apply'))}</button></div>
        </div>`;
        pane.querySelector('#op-flatten').onclick = () => { snapshot(); const n = CL.flatten(S, 1); persist(); render(); closeModal(); toast(`↥ ${n}`, t('undo'), undo); };
        pane.querySelector('#op-single').onclick = () => { snapshot(); const n = CL.mergeSingletons(S); persist(); render(); closeModal(); toast(`⊕ ${n}`, t('undo'), undo); };
      }
    };
    m.querySelectorAll('.tab').forEach(b => b.onclick = () => { classifyTab = b.dataset.tab; draw(); });
    draw();
  }

  /* ---------- 预检 ---------- */
  function showPreflight() {
    const rows = PF.run(S);
    const bad = rows.filter(r => r.level !== 'ok').length;
    const icon = l => l === 'ok' ? '<span style="color:var(--ok)">✓</span>' : l === 'warn' ? '<span style="color:var(--warn)">⚠</span>' : '<span style="color:var(--danger)">✕</span>';
    const m = shell(t('preflight'), `
      <p class="note">${bad ? t('pf_issues', { n: bad }) : t('pf_ok')}</p>
      <table class="pf" style="width:100%;border-collapse:collapse">${rows.map(r => `<tr>
        <td class="i">${icon(r.level)}</td><td class="t">${esc(r.title)}</td><td>${esc(r.detail)}</td>
        <td class="f">${r.fix ? `<button class="btn" data-fix="${esc(r.fix)}" style="font-size:11.5px;padding:2px 8px">${esc(t('fix'))}</button>` : ''}</td></tr>`).join('')}</table>`,
      `<button class="btn ghost" data-x>${esc(t('close'))}</button>
       <button class="btn" id="pf-export">${esc(t('btn_export'))}</button>
       ${MODE === 'chrome' ? `<button class="btn primary" id="pf-apply">${esc(t('btn_apply'))}</button>` : ''}`, true);
    m.querySelector('[data-x]').onclick = closeModal;
    m.querySelector('#pf-export').onclick = () => { closeModal(); doExport(); };
    if (MODE === 'chrome') m.querySelector('#pf-apply').onclick = () => { closeModal(); doApply(); };
    m.querySelectorAll('[data-fix]').forEach(b => b.onclick = () => { preflightFix(b.dataset.fix); });
  }
  function preflightFix(kind) {
    if (kind === 'empties') {
      const es = S.folders.filter(f => M.totalIn(S, f) === 0);
      if (!es.length) return;
      snapshot(); const set = new Set(es.map(f => f.id));
      S.folders = S.folders.filter(f => !set.has(f.id));
      if (set.has(curFolder)) curFolder = '__all__';
      persist(); render(); toast(`− ${es.length}`, t('undo'), undo);
    } else if (kind === 'orphans') {
      const ids = new Set(S.folders.map(f => f.id));
      const orphans = live().filter(i => !ids.has(i.folder));
      if (!orphans.length || !S.folders[0]) return;
      snapshot(); M.moveItems(S, orphans.map(i => i.id), S.folders[0].id);
      persist(); render(); toast(`⌂ ${orphans.length}`, t('undo'), undo);
    } else if (kind === 'home') {
      const tid = topFolders().find(f => /常用|frequent/i.test(f.name));
      if (tid) goHome(live().filter(i => i.folder === tid.id).map(i => i.id));
    } else if (kind === 'purge') {
      const ids = S.items.filter(i => i.trashed).map(i => i.id);
      if (ids.length) { snapshot(); const n = M.purgeItems(S, ids); persist(); render(); toast(`✕ ${n}`, t('undo'), undo); }
    }
    closeModal(); showPreflight();
  }

  /* ---------- 失效检测 ---------- */
  function checkPool(scope) {
    const l = live();
    const view = (curFolder !== '__all__' && curFolder !== '__trash__') ? l.filter(i => descendants(curFolder).includes(i.folder)) : l;
    if (scope === 'all') return l;
    if (scope === 'unchecked') return view.filter(i => !i.check);
    if (scope === 'stale') return view.filter(i => (i.tags || []).includes('stale'));
    return view;
  }
  function openChecker() {
    const m = shell(t('check_links'), `
      <p class="note">no-cors fetch：只判断能否连上，读不到 404；http 会被当混合内容拦截。</p>
      <div class="field"><label>${esc(t('check_links'))}</label>
        <select id="scope">
          <option value="view">${esc(t('all_bookmarks'))} · ${checkPool('view').length}</option>
          <option value="all">all · ${live().length}</option>
          <option value="unchecked">unchecked · ${checkPool('unchecked').length}</option>
          <option value="stale">${esc(t('tag_stale'))} · ${checkPool('stale').length}</option>
        </select></div>
      <div id="prog" style="display:none"><div class="bar"><i id="progbar"></i></div><div class="note mono" id="progtxt"></div></div>`,
      `<button class="btn ghost" id="ck-cancel">${esc(t('close'))}</button><button class="btn primary" id="ck-start">${esc(t('apply'))}</button>`);
    m.querySelector('#ck-cancel').onclick = closeModal;
    m.querySelector('#ck-start').onclick = () => runCheck(checkPool(m.querySelector('#scope').value), m);
  }
  async function runCheck(items, m) {
    if (!items.length) return toast('∅');
    checker = { stop: false };
    const CONC = 10, TIMEOUT = 9000;
    let i = 0, done = 0, ok = 0, fail = 0, to = 0, skip = 0;
    const bar = m.querySelector('#progbar'), txt = m.querySelector('#progtxt');
    const start = m.querySelector('#ck-start'), cancel = m.querySelector('#ck-cancel');
    m.querySelector('#prog').style.display = 'block';
    start.disabled = true; start.textContent = t('checking');
    cancel.textContent = t('stop'); cancel.onclick = () => { checker.stop = true; };
    const tick = () => {
      bar.style.width = (done / items.length * 100).toFixed(1) + '%';
      txt.textContent = `${done}/${items.length} · ✓${ok} ✕${fail} ⏳${to} ⊘${skip}`;
    };
    tick();
    const worker = async () => {
      while (i < items.length && !checker.stop) {
        const it = items[i++];
        if (!/^https:/i.test(it.url)) { it.check = 'http'; skip++; done++; tick(); continue; }
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
        try { await fetch(it.url, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal }); ctrl.abort(); it.check = 'ok'; ok++; }
        catch (e) { if (e && e.name === 'AbortError') { it.check = 'timeout'; to++; } else { it.check = 'fail'; fail++; } }
        finally { clearTimeout(timer); done++; tick(); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONC, items.length) }, worker));
    const stopped = checker && checker.stop; checker = null;
    T.refresh(S, { usage: !!S.hasUsage });
    persist(); render();
    start.disabled = false; start.textContent = t('restart');
    cancel.textContent = t('close'); cancel.onclick = closeModal;
    txt.textContent += stopped ? ' · ' + t('stopped') : ' · ' + t('done');
    toast(`✕ ${fail}`, t('apply'), () => { activeTag = 'dead'; curFolder = '__all__'; query = ''; $('#q').value = ''; closeModal(); render(); });
  }

  /* ---------- 导出 / 应用 ---------- */
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }
  function doExport() {
    const { text, links } = EX.html(S, { rootName: null });
    download('bookmarks-final.html', text);
    toast(t('export_done', { n: links }));
  }
  function exportHtml() {
    if (!preflightDone) {
      const c = PF.counts(S);
      if (c.warn || c.err) { preflightDone = true; showPreflight(); toast(t('btn_preflight')); return; }
    }
    doExport();
  }
  function doApply() {
    if (MODE !== 'chrome') return toast('⚠');
    const d = DF.compute(S);
    if (d.unsupported) return toast('⚠ snapshot');
    if (!d.ops.length) return toast('·');
    const s = d.summary;
    confirmBox(t('btn_apply'),
      `+${s.createFolders} folder / +${s.createItems} item / ✎${s.renames} / ⇄${s.moves} / −${s.removeItems} item / −${s.removeFolders} folder = ${s.total} ops.
       ${MODE === 'chrome' ? '（会同步到其他设备）' : ''}`,
      async () => {
        const m = shell(t('btn_apply'), `<div class="bar"><i id="ab"></i></div><div class="note mono" id="at"></div>`,
          `<button class="btn ghost" data-x disabled>${esc(t('stop'))}</button>`);
        m.querySelector('[data-x]').onclick = () => closeModal();
        try {
          const res = await BMO.ChromeAdapter.apply(S, (done, total) => {
            m.querySelector('#ab').style.width = (done / total * 100).toFixed(1) + '%';
            m.querySelector('#at').textContent = `${done}/${total}`;
          });
          closeModal(); render();
          if (res.errors.length) toast(`⚠ ${res.errors.length}`, '详情', () => {
            shell('errors', `<pre class="note" style="white-space:pre-wrap">${esc(res.errors.slice(0, 30).map(e => e.op + ': ' + e.message).join('\n'))}</pre>`,
              `<button class="btn ghost" data-x>${esc(t('close'))}</button>`).querySelector('[data-x]').onclick = closeModal;
          });
          else toast(t('applied', { f: res.summary.createFolders, m: res.summary.moves, d: res.summary.removeItems + res.summary.removeFolders }));
        } catch (e) { closeModal(); toast('⚠ ' + e.message); }
      });
  }

  /* ---------- 帮助 ---------- */
  function showHelp() {
    const m = shell(t('btn_help'), `
      <div class="help-sec">${esc(t('btn_apply'))} / ${esc(t('btn_export'))}</div>
      <ol class="help-list">
        <li>${MODE === 'chrome' ? '改动只存在草稿里，点「应用到 Chrome」才会真正写回浏览器；写回前会自动备份。' : '先导出书签 HTML 再导入本工具；整理完导出定稿 HTML，再导回浏览器（追加，不覆盖）。'}</li>
        <li>删除进回收站，可恢复；<kbd>⌘Z</kbd> 最多 200 步。</li>
        <li>搜索默认全局；勾选「仅当前分类」限定范围。</li>
        <li>点整列勾选区可连续多选；<kbd>⌘</kbd> 点选加减，<kbd>⇧</kbd> 范围，<kbd>⌘A</kbd> 全选。</li>
        <li>拖行到左侧分类=移动；拖分类到上/下边缘=排序，中间=成为子分类。</li>
        <li>左侧分类树：点分类行即可选中并展开/收起它的子级（▸/▾）；顶部有分类筛选框和 ⊞/⊟ 全部展开折叠，状态会记住。</li>
        <li>✦ 打开自动归类建议（域名聚类 / 规则表 / 结构整理），全部可撤销。</li>
      </ol>
      <div class="help-sec">数据与隐私</div>
      <ol class="help-list">
        <li>全程本地处理，不上传；唯一联网的是「检测失效链接」。</li>
        <li>${MODE === 'chrome' ? '扩展需要 bookmarks（读写书签）、storage（草稿与备份）、history（使用度，可选拒绝）。' : '进度存在浏览器本地存储，换设备请用「保存进度」导出 JSON。'}</li>
      </ol>`,
      `<button class="btn primary" data-x>OK</button>`);
    m.querySelector('[data-x]').onclick = closeModal;
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    $('#q').oninput = e => { query = e.target.value; renderList(); };
    $('#tree-q').oninput = e => { treeQuery = e.target.value; renderTree(); };
    $('#btn-expand-all').onclick = expandAll;
    $('#btn-collapse-all').onclick = collapseAll;
    $('#inc-sub').onchange = e => { S.ui = Object.assign({}, S.ui, { includeSub: e.target.checked }); persist(); render(); };
    $('#search-here').onchange = e => { S.ui = Object.assign({}, S.ui, { searchHere: e.target.checked }); persist(); render(); };
    $('#btn-sort').onclick = () => {
      const order = ['default', 'name', 'added', 'used', 'folder'];
      sortMode = order[(order.indexOf(sortMode) + 1) % order.length]; renderSortLabel(); renderList();
    };
    $('#btn-check').onclick = openChecker;
    $('#btn-preflight').onclick = () => { preflightDone = true; showPreflight(); };
    $('#btn-export').onclick = exportHtml;
    if ($('#btn-apply')) $('#btn-apply').onclick = doApply;
    $('#btn-move').onclick = () => openMove([...selected], [...selectedFolders]);
    $('#btn-home').onclick = () => goHome([...selected]);
    $('#btn-del').onclick = () => deleteMixed([...selected], [...selectedFolders]);
    $('#btn-unsel').onclick = () => { selected.clear(); selectedFolders.clear(); updateSelectionUI(); };
    $('#btn-clear-sel').onclick = () => { selected.clear(); selectedFolders.clear(); updateSelectionUI(); $('#q').focus(); };
    $('#btn-new-top').onclick = () => promptText(t('new_category'), '', v => {
      if (!v) return; snapshot(); M.createFolder(S, v, null); persist(); render(); toast('+', t('undo'), undo);
    });
    $('#btn-classify').onclick = openClassify;
    $('#btn-help').onclick = showHelp;
    $('#btn-lang').onclick = () => {
      BMO.i18n.set(BMO.i18n.get() === 'zh' ? 'en' : 'zh');
      applyStaticLabels(); render();
    };
    $('#btn-export-json').onclick = () => { download('bookmark-progress.json', EX.json(S), 'application/json'); toast('JSON ↓'); };
    $('#btn-import-json').onclick = () => $('#file-json').click();
    $('#file-json').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try { adopt(BMO.FileAdapter.fromJson(String(r.result)).state, true); toast('JSON ↑'); }
        catch (err) { toast('⚠ ' + err.message); }
      };
      r.readAsText(f); e.target.value = '';
    };
    bindColumnResize(); bindResizer(); bindKeys();
  }

  function bindKeys() {
    document.addEventListener('keydown', e => {
      const editing = document.activeElement && (document.activeElement.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName));
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); exportHtml(); return; }
      if (editing || !S) return;
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault(); visibleItems().forEach(i => selected.add(i.id));
        if (curFolder !== '__all__' && curFolder !== '__trash__') subFolders(curFolder).forEach(f => selectedFolders.add(f.id));
        updateSelectionUI(); return;
      }
      if (e.key === '/') { e.preventDefault(); $('#q').focus(); return; }
      if (e.key === 'Escape') { if ($('#modal-root').innerHTML) closeModal(); else { selected.clear(); selectedFolders.clear(); updateSelectionUI(); } return; }
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectionSize()) { e.preventDefault(); deleteMixed([...selected], [...selectedFolders]); }
    });
  }

  function bindColumnResize() {
    const list = $('#list');
    list.addEventListener('mousedown', e => {
      const h = e.target.closest('.col-resize'); if (!h) return;
      e.preventDefault(); e.stopPropagation();
      const key = h.dataset.col;
      const col = list.querySelector(`col[data-col="${key}"]`);
      const th = h.closest('th');
      const startX = e.clientX, startW = th.getBoundingClientRect().width;
      let w = Math.round(startW);
      document.body.classList.add('col-resizing');
      const move = ev => {
        w = Math.max(56, Math.min(1200, Math.round(startW + ev.clientX - startX)));
        if (col) col.style.width = w + 'px';
        if (key !== 'nm') {
          const nmCol = list.querySelector('col[data-col="nm"]');
          if (nmCol) {
            const avail = list.clientWidth || 800;
            const others = Array.prototype.slice.call(list.querySelectorAll('col')).filter(c => c.dataset.col !== 'nm')
              .reduce((a, c) => a + (parseFloat(c.style.width) || colW(c.dataset.col) || 0), 0);
            const savedNm = (S.ui.cols && S.ui.cols.nm) || 0;
            nmCol.style.width = (avail - others) < 140 ? '140px' : (savedNm ? savedNm + 'px' : '');
          }
        }
      };
      const up = () => {
        window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
        document.body.classList.remove('col-resizing');
        S.ui = Object.assign({}, S.ui, { cols: Object.assign({}, S.ui.cols, { [key]: w }) });
        persist();
      };
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    });
    list.addEventListener('dblclick', e => {
      const h = e.target.closest('.col-resize'); if (!h) return;
      const key = h.dataset.col;
      const cols = Object.assign({}, S.ui.cols); delete cols[key];
      S.ui = Object.assign({}, S.ui, { cols });
      const col = list.querySelector(`col[data-col="${key}"]`); if (col) col.style.width = '';
      persist(); toast('↺');
    });
    let lastKey = activeCols().map(c => c.k).join(',');
    window.addEventListener('resize', () => {
      const k = activeCols().map(c => c.k).join(',');
      if (k !== lastKey) { lastKey = k; if (S) renderList(); }
    });
  }

  function bindResizer() {
    const rz = $('#resizer'), a = $('#aside'); if (!rz) return;
    let dragging = false;
    rz.onmousedown = e => { dragging = true; document.body.classList.add('resizing'); e.preventDefault(); };
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const w = Math.min(560, Math.max(180, Math.round(e.clientX)));
      a.style.width = w + 'px'; a.style.flexBasis = w + 'px';
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return; dragging = false; document.body.classList.remove('resizing');
      S.ui = Object.assign({}, S.ui, { aside: parseInt(a.style.width, 10) || 268 }); persist();
    });
    rz.ondblclick = () => { S.ui = Object.assign({}, S.ui, { aside: 268 }); applyUiPrefs(); persist(); };
  }

  /* ---------- 语言与静态文案 ---------- */
  function applyStaticLabels() {
    $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    $('#title').textContent = t('app_title');
    $('#q').placeholder = t('search_ph');
    $('#btn-lang').textContent = BMO.i18n.get() === 'zh' ? 'EN' : '中文';
    $('#btn-help').textContent = t('btn_help');
    $('#btn-import-json').textContent = t('btn_import_progress');
    $('#btn-export-json').textContent = t('btn_save_progress');
    $('#btn-preflight').textContent = t('btn_preflight');
    $('#btn-export').textContent = t('btn_export');
    if ($('#btn-apply')) $('#btn-apply').textContent = t('btn_apply');
    $('#btn-check').textContent = t('check_links');
    $('#btn-new-top').textContent = t('new_category');
    $('#btn-move').textContent = t('move_to');
    $('#btn-home').textContent = t('go_home');
    $('#btn-del').textContent = t('del');
    $('#btn-unsel').textContent = t('cancel_sel');
    $('#foot-hint').textContent = MODE === 'chrome' ? t('btn_apply') : t('btn_export');
    $('#tree-q').placeholder = t('tree_ph');
    $('#btn-expand-all').title = t('expand_all');
    $('#btn-collapse-all').title = t('collapse_all');
    renderSortLabel();
  }

  /* ---------- 装载 ---------- */
  function adopt(state, keepHistory) {
    if (!keepHistory) { history = []; future = []; }
    S = state;
    S.ui = Object.assign({ aside: 268, cols: {} }, S.ui || {});
    if (!Array.isArray(S.ui.collapsed)) {
      // 首次进入：默认折叠所有含子级的分类，只露出顶层，避免几十行平铺
      S.ui.collapsed = S.folders.filter(f => M.subFolders(S, f.id).length).map(f => f.id);
    }
    S.rules = S.rules || []; rules = S.rules;
    selected.clear(); selectedFolders.clear(); curFolder = '__all__'; query = ''; activeTag = ''; treeQuery = '';
    $('#q').value = ''; $('#tree-q').value = '';
    $('#guide').classList.add('hide'); $('#topbar').classList.remove('hide'); $('#app').classList.remove('hide');
    applyStaticLabels(); render();
  }

  async function loadFromHtmlText(text) {
    const { state, warnings } = BMO.FileAdapter.fromHtml(text);
    adopt(state);
    (warnings || []).forEach(w => toast(w));
    toast(`${live().length} ↑`);
  }

  async function boot() {
    bind(); applyStaticLabels();
    MODE = (BMO.ChromeAdapter.available() && !/[?&]mode=file/.test(location.search)) ? 'chrome' : 'file';
    AD = MODE === 'chrome' ? BMO.ChromeAdapter : BMO.FileAdapter;
    if ($('#btn-apply')) $('#btn-apply').classList.toggle('hide', MODE !== 'chrome');

    if (MODE === 'file') {
      const draft = BMO.FileAdapter.hasDraft();
      $('#g-resume').disabled = !draft;
      $('#g-pick').onclick = async () => {
        try { const f = await BMO.FileAdapter.pick('.html,.htm,text/html'); await loadFromHtmlText(f.text); }
        catch (e) { if (e.message !== '未选择文件') toast('⚠ ' + e.message); }
      };
      $('#g-resume').onclick = () => { const d = BMO.FileAdapter.loadDraft(); if (d) adopt(d.state, true); };
      $('#g-demo').onclick = () => {
        if (!window.BMO_DEMO_HTML) return toast('⚠ demo');
        loadFromHtmlText(window.BMO_DEMO_HTML);
      };
      // ?demo=1 直接载入演示数据（用于截图、预览和 CI 产物）
      if (/[?&]demo=1/.test(location.search)) { $('#g-demo').click(); return; }
      $('#guide').classList.remove('hide');
      return;
    }

    // 扩展模式：先显示"正在读取"，失败就把原因摊开，绝不伪装成需要文件导入
    $('#g-steps').classList.add('hide');
    $('#g-normal').classList.add('hide');
    $('#g-note').textContent = t('g_loading');
    $('#guide').classList.remove('hide');
    try {
      const { state, warnings } = await BMO.ChromeAdapter.load();
      const draft = await BMO.ChromeAdapter.loadDraft();
      adopt(state);
      (warnings || []).forEach(w => toast(w));
      if (draft && draft.items && draft.items.length && JSON.stringify(draft.items.map(i => [i.folder, i.name])) !== JSON.stringify(state.items.map(i => [i.folder, i.name]))) {
        confirmBox(t('g_resume'), `${draft.items.length}`, () => adopt(draft, true));
      }
    } catch (e) {
      $('#g-note').textContent = '';
      $('#g-error').classList.remove('hide');
      $('#g-errmsg').textContent = (e && (e.message || e)) || String(e);
      $('#g-retry').onclick = () => { $('#g-error').classList.add('hide'); boot(); };
      $('#g-fallback').onclick = () => {
        MODE = 'file'; AD = BMO.FileAdapter;
        $('#g-error').classList.add('hide');
        $('#g-steps').classList.remove('hide');
        $('#g-normal').classList.remove('hide');
        $('#btn-apply').classList.add('hide');
        BMO.UI.toast(t('btn_export'));
        const draft = BMO.FileAdapter.hasDraft();
        $('#g-resume').disabled = !draft;
        $('#g-pick').onclick = async () => { const f = await BMO.FileAdapter.pick('.html,.htm,text/html'); await loadFromHtmlText(f.text); };
        $('#g-resume').onclick = () => { const d = BMO.FileAdapter.loadDraft(); if (d) adopt(d.state, true); };
        $('#g-demo').onclick = () => loadFromHtmlText(window.BMO_DEMO_HTML || '');
      };
    }
  }

  BMO.UI = { get state() { return S; }, boot, render, adopt, loadFromHtmlText, MODE: () => MODE, toast, shell, closeModal };

  function toast(msg, actLabel, act) {
    const el = document.createElement('div');
    el.className = 'toast'; el.innerHTML = `<span>${esc(msg)}</span>`;
    if (actLabel) {
      const b = document.createElement('button'); b.textContent = actLabel;
      b.onclick = () => { act && act(); el.remove(); }; el.appendChild(b);
    }
    $('#toast').appendChild(el);
    setTimeout(() => el.remove(), actLabel ? 6000 : 2600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
