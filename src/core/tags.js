/* BMO core: tags —— 标签体系。能力自适应：有使用度数据就出「常用/从未访问/过时」，
   没有（例如只拿到浏览器导出的 HTML）就退化成按添加年份的「N 年以上未整理」。 */
window.BMO = window.BMO || {};

BMO.Tags = (function () {
  const DAY = 86400;
  const KEYS = ['hot', 'recent', 'never', 'stale', 'old3', 'old5', 'dead', 'timeout', 'insecure'];

  /** 这批数据里有没有"使用度"信息（扩展版有，导出的 HTML 没有） */
  function hasUsage(items) {
    return items.some(i => (i.visits != null && i.visits > 0) || i.used);
  }

  function compute(item, ctx) {
    const now = ctx.now, out = [];
    const added = item.added, used = item.used, visits = item.visits;
    if (added && added > now - 365 * DAY) out.push('recent');
    if (ctx.usage) {
      const v = visits == null ? 0 : visits;
      if (v >= (ctx.hotVisits || 5) || (used && used > now - (ctx.hotDays || 90) * DAY)) out.push('hot');
      if (v === 0) out.push('never');
      const old = added && added < now - 3 * 365 * DAY;
      const untouched = v === 0 || (used && used < now - 2 * 365 * DAY);
      if (old && untouched) out.push('stale');
    }
    if (added && added < now - 3 * 365 * DAY) out.push('old3');
    if (added && added < now - 5 * 365 * DAY) out.push('old5');
    if (!ctx.usage && added && added < now - 5 * 365 * DAY) out.push('stale');  // 无使用度时的兜底口径
    if (item.check === 'fail') out.push('dead');
    if (item.check === 'timeout') out.push('timeout');
    if (item.check === 'http') out.push('insecure');
    return out;
  }

  function refresh(state, ctx) {
    const usage = ctx.usage === undefined ? hasUsage(state.items) : ctx.usage;
    const c = Object.assign({ now: Math.floor(Date.now() / 1000), usage }, ctx);
    state.items.forEach(i => { i.tags = compute(i, c); });
    state.capabilities = { usage, checker: true };
    return usage;
  }

  return { KEYS, compute, refresh, hasUsage, DAY };
})();
