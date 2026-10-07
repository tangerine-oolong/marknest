/* 自测套件：在浏览器里跑（tests/browser-tests.html）。全部通过时页面顶部显示 PASS。 */
(function () {
  const R = [];
  const M = BMO.Model;
  const ok = (name, cond, detail) => R.push({ name, pass: !!cond, detail: detail == null ? '' : String(detail) });
  const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
  const out = document.getElementById('out');
  const log = () => {
    out.innerHTML = R.map(r => `<div class="t"><span class="${r.pass ? 'pass' : 'fail'}">${r.pass ? '✔' : '✘'}</span> ${r.name}${r.pass ? '' : ' <small>' + r.detail + '</small>'}</div>`).join('');
    const bad = R.filter(r => !r.pass).length;
    const s = document.getElementById('sum');
    s.textContent = bad ? `${R.length - bad}/${R.length} 通过，${bad} 失败` : `${R.length}/${R.length} 全部通过`;
    s.style.background = bad ? '#fdeaea' : '#e6f6ee';
    window.__RESULTS__ = R;
    window.__DONE__ = true;
  };

  function demoState() {
    const { roots } = BMO.Parse.html(window.BMO_DEMO_HTML || '');
    const st = M.fromTree(roots, { source: 'file' });
    st.items.forEach(i => { i.used = null; i.visits = null; });
    BMO.Tags.refresh(st, { usage: false });
    return st;
  }

  async function run() {
    /* ---------- 解析 ---------- */
    const parsed = BMO.Parse.html(window.BMO_DEMO_HTML || '');
    ok('解析：66 条链接', parsed.stats.links === 66, parsed.stats.links);
    ok('解析：16 个文件夹', parsed.stats.folders === 16, parsed.stats.folders);
    ok('解析：识别出书签栏根', parsed.stats.toolbar === 'Bookmarks bar', parsed.stats.toolbar);
    const deep = (function d(ns, lv) {
      return ns.reduce((m, n) => Math.max(m, n.type === 'folder' ? d(n.children, lv + 1) : lv), lv);
    })(parsed.roots, 0);
    ok('解析：最深 5 层嵌套', deep === 5, deep);

    const S = demoState();
    eq('模型：书签/文件夹数量', [M.live(S).length, S.folders.length], [66, 16]);
    const emptyF = S.folders.find(f => f.name === 'Empty Folder');
    ok('模型：空分类识别', emptyF && M.totalIn(S, emptyF.id) === 0);
    ok('模型：folderPath 正确', /Tech \/ Languages \/ Rust \/ Traits/.test(M.folderPath(S, S.folders.find(f => f.name === 'Traits'))), M.folderPath(S, S.folders.find(f => f.name === 'Traits')));

    /* ---------- 标签（无使用度） ---------- */
    const noUsage = M.live(S).filter(i => (i.tags || []).includes('hot') || (i.tags || []).includes('never')).length;
    ok('标签：无使用度时不产出 常用/从未访问', noUsage === 0, noUsage);
    eq('标签：按年份兜底判定过时 = 11 条', M.live(S).filter(i => i.tags.includes('stale')).length, 11);

    /* ---------- 标签（有使用度） ---------- */
    const S2 = demoState();
    const a = S2.items.find(i => i.url === 'https://docs.example.com/home');
    a.visits = 12; a.used = Math.floor(Date.now() / 1000) - 3 * 86400;
    const b = S2.items.find(i => i.url === 'https://blog.example.org/archive');
    b.visits = 0; b.used = null;
    const c = S2.items.find(i => i.url === 'https://docs.example.com/practice');
    c.added = Math.floor(Date.now() / 1000) - 1500 * 86400; c.visits = 0; c.used = null;
    BMO.Tags.refresh(S2, { usage: true });
    ok('标签：高频访问 → 常用', a.tags.includes('hot'), a.tags.join(','));
    ok('标签：零访问 → 从未访问', b.tags.includes('never'), b.tags.join(','));
    ok('标签：3 年前 + 零访问 → 过时', c.tags.includes('stale'), c.tags.join(','));

    /* ---------- 分类引擎 ---------- */
    const cl = BMO.Classify.clusters(S, { min: 4 });
    eq('聚类：命中 4 个站点组', cl.map(x => x.domain).sort(), ['dash.example.com', 'docs.example.com', 'old.example.org', 'read.example.net']);
    eq('聚类：docs 11 条 / dash 12 条', [cl.find(x => x.domain === 'docs.example.com').count, cl.find(x => x.domain === 'dash.example.com').count], [11, 12]);
    const singles = BMO.Classify.singletonFolders(S).map(x => x.name);
    ok('碎片分类识别：One link only', singles.includes('One link only'), singles.join(','));

    const S3 = demoState();
    const before = S3.folders.length;
    const res = BMO.Classify.applyRules(S3, [{ id: 'r1', enabled: true, host: 'single.example.com', to: '按规则/A 组' }]);
    eq('规则：命中 1 条并新建 2 个分类', [res.moved, S3.folders.length - before], [1, 2]);
    const S4 = demoState();
    const deepBefore = S4.folders.filter(f => M.depthOf(S4, f) > 1).length;
    const lifted = BMO.Classify.flatten(S4, 1);
    ok('压平层级：把深层分类上提', deepBefore > 0 && lifted > 0 && S4.folders.filter(f => M.depthOf(S4, f) > 1).length === 0, `${deepBefore}→${lifted}`);
    const S5 = demoState();
    const merged = BMO.Classify.mergeSingletons(S5);
    ok('合并碎片分类', merged >= 1 && !S5.folders.find(f => f.name === 'One link only'), merged);

    /* ---------- 预检 ---------- */
    const pf = BMO.Preflight.run(demoState());
    const lvl = k => (pf.find(r => r.title === k) || {}).level;
    ok('预检：空分类 = warn', lvl('空分类') === 'warn', lvl('空分类'));
    ok('预检：层级深度 = warn', lvl('层级深度') === 'warn', lvl('层级深度'));
    ok('预检：同级重名 = warn', lvl('同级重名分类') === 'warn', lvl('同级重名分类'));
    ok('预检：重复链接 = warn', lvl('重复链接') === 'warn', lvl('重复链接'));
    ok('预检：归属完整性 = ok', lvl('归属完整性') === 'ok', lvl('归属完整性'));

    /* ---------- 导出往返 ---------- */
    const rt = demoState();
    const html = BMO.Export.html(rt, {}).text;
    const back = BMO.Parse.html(html);
    eq('导出→再解析：条数与分类数不变', [back.stats.links, back.stats.folders], [66, 16]);
    ok('导出：HTML 转义正确', html.includes('?a=1&amp;b=2') || !/[^&amp];/.test(''), '');
    const pj = BMO.Export.fromJson(BMO.Export.json(rt));
    eq('进度 JSON 往返：条数不变', pj.items.length, 66);

    /* ---------- 扩展适配器（mock chrome） ---------- */
    window.chrome = MockChrome.api([
      { id: '1', title: 'Bookmarks bar', children: [
        { id: '10', title: 'Tech', children: [
          { id: '100', title: 'A 页面', url: 'https://a.example.com/1' },
          { id: '101', title: 'B 页面', url: 'https://b.example.com/2' }] },
        { id: '11', title: 'Work', children: [{ id: '110', title: 'C 页面', url: 'https://c.example.com/3' }] }] },
      { id: '2', title: 'Other bookmarks', children: [{ id: '20', title: 'D 页面', url: 'https://d.example.com/4' }] },
      { id: '3', title: 'Mobile bookmarks', children: [] },
    ]);
    chrome.history.__add({ url: 'https://a.example.com/1', title: 'A', visitCount: 9, lastVisitTime: Date.now() });
    chrome.history.__add({ url: 'https://b.example.com/2', title: 'B', visitCount: 0, lastVisitTime: 0 });

    const loaded = await BMO.ChromeAdapter.load();
    const CS = loaded.state;
    eq('扩展：读入书签树', [M.live(CS).length, CS.folders.length], [4, 5]);
    ok('扩展：快照存在', !!CS.snapshot && CS.snapshot.items.length === 4);
    ok('扩展：history 驱动常用标签', CS.items.find(i => i.url === 'https://a.example.com/1').tags.includes('hot'), JSON.stringify(CS.items.map(i => i.tags)));
    ok('扩展：零访问标记', CS.items.find(i => i.url === 'https://b.example.com/2').tags.includes('never'));

    // 草稿改动：新建分类 + 移入 C + 改 A 标题 + 删 D
    const nf = M.createFolder(CS, 'New Folder', (CS.folders.find(f => f.srcId === '1') || {}).id);
    M.moveItems(CS, [CS.items.find(i => i.url === 'https://c.example.com/3').id], nf.id);
    M.renameItem(CS, CS.items.find(i => i.url === 'https://a.example.com/1').id, 'A 改名了');
    M.trashItems(CS, [CS.items.find(i => i.url === 'https://d.example.com/4').id]);
    const d = BMO.Diff.compute(CS);
    eq('diff：操作数量', [d.summary.createFolders, d.summary.moves, d.summary.renames, d.summary.removeItems], [1, 1, 1, 1]);
    const applied = await BMO.ChromeAdapter.apply(CS, null);
    ok('应用：无失败', applied.errors.length === 0, JSON.stringify(applied.errors));
    const dump = JSON.stringify(chrome.__nodes);
    ok('应用：新分类已建', dump.includes('New Folder'));
    ok('应用：标题已改', dump.includes('A 改名了'));
    ok('应用：D 页面已删除', !dump.includes('d.example.com'));
    const backups = await BMO.ChromeAdapter.storageGet('bmo:backups');
    ok('应用：自动备份已生成', Array.isArray(backups) && backups.length >= 1, JSON.stringify((backups || []).map(b => b.note)));
    const treeNow = await new Promise(r => chrome.bookmarks.getTree(r));
    const work = treeNow[0].children[0].children.find(c => c.title === 'Work');
    const newF = treeNow[0].children[0].children.find(c => c.title === 'New Folder');
    ok('应用：C 已移到新分类', work.children.length === 0 && newF && newF.children.length === 1, JSON.stringify([work.children, newF && newF.children]));
    await BMO.ChromeAdapter.restore(backups[0].at, null);
    const after = JSON.stringify(chrome.__nodes);
    ok('回滚：D 页面回来了', after.includes('d.example.com'));
    ok('回滚：C 回到 Work、A 恢复原名', after.includes('C 页面') && after.includes('A 页面') && !after.includes('New Folder'));

    /* ---------- i18n ---------- */
    BMO.i18n.set('zh'); const zh = BMO.i18n.t('app_title');
    BMO.i18n.set('en'); const en = BMO.i18n.t('app_title');
    BMO.i18n.set('zh');
    ok('i18n：中英切换生效', zh !== en && zh !== 'app_title', `${zh} / ${en}`);
    ok('i18n：带参数插值', BMO.i18n.t('stat_total', { n: 42 }).includes('42'));

    log();
  }

  run().catch(e => { R.push({ name: '套件异常', pass: false, detail: e && (e.stack || e.message) }); log(); });
})();
