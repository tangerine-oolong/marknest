/* BMO core: preflight —— 导出/应用前的体检。每项返回 {level, title, detail, fix?} */
window.BMO = window.BMO || {};

BMO.Preflight = (function () {
  const M = () => BMO.Model;
  const t = (k, p) => BMO.i18n.t(k, p);

  function run(state) {
    const Mo = M();
    const items = Mo.live(state);
    const ids = new Set(state.folders.map(f => f.id));
    const totalIn = id => Mo.totalIn(state, id);
    const out = [];
    const push = (level, title, detail, fix) => out.push({ level, title, detail, fix });

    const orphans = items.filter(i => !ids.has(i.folder));
    push(orphans.length ? 'err' : 'ok', t('pf_orphan'),
      orphans.length ? `${orphans.length} → ${t('uncategorized')}` : `${items.length}`,
      orphans.length ? 'orphans' : null);

    const empties = state.folders.filter(f => totalIn(f.id) === 0);
    push(empties.length ? 'warn' : 'ok', t('pf_empty'),
      empties.length ? `${empties.length}: ${empties.slice(0, 6).map(f => Mo.folderPath(state, f)).join('、')}${empties.length > 6 ? '…' : ''}` : '0',
      empties.length ? 'empties' : null);

    const dup = [];
    for (const f of state.folders) {
      const same = state.folders.filter(x => (x.parent || null) === (f.parent || null) && x.name === f.name);
      const key = (f.parent || 'top') + '|' + f.name;
      if (same.length > 1 && !dup.includes(key)) dup.push(key);
    }
    push(dup.length ? 'warn' : 'ok', t('pf_dupname'), dup.length ? `${dup.length}` : '0');

    const deep = state.folders.filter(f => Mo.depthOf(state, f) > 1);
    push(deep.length ? 'warn' : 'ok', t('pf_depth'),
      deep.length ? `${deep.length}: ${deep.slice(0, 5).map(f => Mo.folderPath(state, f)).join('、')}` : `${Math.max(0, ...state.folders.map(f => Mo.depthOf(state, f))) + 1}`);

    const longNames = items.filter(i => (i.name || '').length > 60);
    push(longNames.length > 40 ? 'warn' : 'ok', t('pf_longname'), `${longNames.length}`);

    const badNames = state.folders.filter(f => /^\s|\s$/.test(f.name) || f.name.length > 24);
    push(badNames.length ? 'warn' : 'ok', t('pf_foldernames'),
      badNames.length ? `${badNames.length}: ${badNames.slice(0, 5).map(f => `「${f.name}」`).join('、')}` : '0');

    const c = {}; items.forEach(i => c[i.url] = (c[i.url] || 0) + 1);
    const dupUrls = Object.values(c).reduce((a, n) => a + (n > 1 ? n - 1 : 0), 0);
    push(dupUrls ? 'warn' : 'ok', t('pf_dupurl'), `${dupUrls}`);

    const trashed = state.items.length - items.length;
    push(trashed ? 'warn' : 'ok', t('pf_trash'), `${trashed}`, trashed ? 'purge' : null);

    const tid = (state.folders.find(f => !f.parent && /常用|frequent|star/i.test(f.name)) || {}).id;
    const misfiled = tid ? items.filter(i => i.home && i.folder === tid && i.home !== tid).length : 0;
    push('ok', t('pf_home'), `${misfiled}`, misfiled ? 'home' : null);

    const stale = items.filter(i => (i.tags || []).includes('stale')).length;
    const dead = items.filter(i => i.check === 'fail').length;
    push('ok', t('pf_progress'),
      `${items.length} / ${stale} (${items.length ? Math.round(stale / items.length * 100) : 0}%) / ${dead}`);

    const tops = Mo.topFolders(state);
    push(tops.length > 10 ? 'warn' : 'ok', t('pf_tops'),
      `${tops.length}: ` + tops.map(f => `${f.name}(${totalIn(f.id)})`).join('、'));

    return out;
  }

  function counts(state) {
    const rows = run(state);
    return { ok: rows.filter(r => r.level === 'ok').length, warn: rows.filter(r => r.level === 'warn').length, err: rows.filter(r => r.level === 'err').length };
  }

  return { run, counts };
})();
