/* BMO core: i18n —— 轻量字典，按浏览器语言自动选中/英，可在界面切换。 */
window.BMO = window.BMO || {};

BMO.i18n = (function () {
  const DICT = {
    zh: {
      app_title: 'Marknest 书签整理台', tagline: '先看清，再动手',
      stat_total: '共 {n} 条', stat_folders: '{n} 个分类', stat_trash: '回收站 {n}', stat_moved: '你调整过 {n}', stat_stale: '过时 {n}', stat_dead: '疑似失效 {n}',
      search_ph: '全局搜索：名称 / 网址 / 原路径', search_here: '仅当前分类',
      inc_sub: '包含子分类', sort: '排序', clear_sel: '清除选择',
      btn_help: '帮助', btn_reset: '重置', btn_import_progress: '导入进度', btn_save_progress: '保存进度',
      btn_preflight: '导入前预检', btn_export: '导出书签 HTML', btn_apply: '应用到 Chrome',
      all_bookmarks: '全部书签', trash: '回收站', uncategorized: '未归类', top_level: '顶层',
      col_name: '名称', col_tags: '标签', col_domain: '域名', col_loc: '所在位置', col_added: '添加', col_used: '最后使用',
      never: '从未', empty: '—',
      tag_hot: '常用', tag_recent: '近期新增', tag_never: '从未访问', tag_stale: '过时', tag_old3: '3 年以上', tag_old5: '5 年以上',
      tag_dead: '疑似失效', tag_timeout: '超时', tag_insecure: 'http 未测',
      sel_items: '已选 {n} 条书签', sel_folders: ' + {n} 个分类', sel_hint: '拖拽任意选中行到分类即可一起移动',
      move_to: '移动到…', go_home: '归位到主题', del: '删除', cancel_sel: '取消选择',
      new_category: '＋ 新建分类', new_sub: '新建子分类', rename: '重命名', move_folder: '整体移动分类', del_folder: '删除分类',
      scope_only: '仅本层', scope_with_sub: '含子分类', global_search: '全局搜索 “{q}”', across_folders: ' · 跨 {n} 个分类',
      classify: '分类建议', classify_title: '自动归类（都是建议，不自动执行）',
      strat_keep: '保留原结构（默认）', strat_domain: '按域名聚类', strat_rules: '自定义规则',
      apply: '应用', apply_all: '全部应用', dismiss: '忽略', dry_run: '预览',
      rule_host: '域名包含', rule_title: '标题包含', rule_path: '原路径包含', rule_before: '添加早于', rule_to: '归到',
      preflight: '导入前预检', pf_ok: '全部通过，可以导出/应用。', pf_issues: '发现 {n} 项需要你确认（不一定要改）：',
      pf_orphan: '归属完整性', pf_empty: '空分类', pf_dupname: '同级重名分类', pf_depth: '层级深度',
      pf_longname: '书签名长度', pf_foldernames: '分类命名', pf_dupurl: '重复链接', pf_trash: '回收站',
      pf_home: '可继续归位', pf_progress: '清理进度', pf_tops: '顶层分类数量',
      fix: '一键处理', close: '关闭', cancel: '取消', confirm: '确定',
      select_filtered: '选中当前筛选结果',
      undo: '撤销', redo: '重做', del: '删除', tagline: '先看清，再动手',
      search_here: '仅当前分类',
      g_loading: '正在读取你的书签…',
      g1: '导出浏览器书签为 HTML（Chrome：按 ⌥⌘B 打开书签管理器 → 右上角 ⋮ → 导出书签）',
      g2: '把那个 HTML 文件选进来，全程本地解析，不上传',
      g3: '整理满意后导出定稿 HTML，再导回浏览器；导回是追加，不会覆盖现有书签',
      g_pick: '选择书签 HTML 文件', g_demo: '载入演示数据', g_resume: '恢复上次进度',
      g_privacy: '本工具不联网、不上传任何书签数据；「检测失效链接」是唯一会主动访问网址的功能，需要你明确点击才会开始。',
      err_title: '扩展读取书签失败',
      err_hint: '常见原因：扩展文件被重新构建过（到 chrome://extensions 点该扩展卡片上的 ↻ 重新加载）、权限未生效（看卡片有没有红色「错误」），或这个页面不是从扩展图标打开的（地址栏应以 chrome-extension:// 开头）。',
      g_retry: '重试读取书签', g_fallback: '改用文件导入',
      tree_ph: '筛选分类…', expand_all: '展开全部', collapse_all: '折叠全部', no_match: '没有匹配的分类',
      check_links: '检测失效链接', checking: '检测中…', stop: '停止', restart: '重新检测', done: '完成', stopped: '已停止',
      export_done: '已导出 {n} 条书签', applied: '已应用：新建 {f} 个分类、移动 {m} 条、删除 {d} 条',
    },
    en: {
      app_title: 'Marknest', tagline: 'See it clearly, then act',
      stat_total: '{n} bookmarks', stat_folders: '{n} folders', stat_trash: 'Trash {n}', stat_moved: '{n} changed', stat_stale: '{n} stale', stat_dead: '{n} unreachable',
      search_ph: 'Search all: title / URL / original path', search_here: 'This folder only',
      inc_sub: 'Include subfolders', sort: 'Sort', clear_sel: 'Clear selection',
      btn_help: 'Help', btn_reset: 'Reset', btn_import_progress: 'Load progress', btn_save_progress: 'Save progress',
      btn_preflight: 'Pre-flight check', btn_export: 'Export HTML', btn_apply: 'Apply to Chrome',
      all_bookmarks: 'All bookmarks', trash: 'Trash', uncategorized: 'Uncategorized', top_level: 'Top level',
      col_name: 'Title', col_tags: 'Tags', col_domain: 'Domain', col_loc: 'Location', col_added: 'Added', col_used: 'Last used',
      never: 'never', empty: '—',
      tag_hot: 'Frequent', tag_recent: 'New', tag_never: 'Never visited', tag_stale: 'Stale', tag_old3: '3y+', tag_old5: '5y+',
      tag_dead: 'Unreachable', tag_timeout: 'Timeout', tag_insecure: 'http (skipped)',
      sel_items: '{n} bookmarks selected', sel_folders: ' + {n} folders', sel_hint: 'Drag any selected row onto a folder to move them together',
      move_to: 'Move to…', go_home: 'Return to topic', del: 'Delete', cancel_sel: 'Deselect',
      new_category: '+ New folder', new_sub: 'New subfolder', rename: 'Rename', move_folder: 'Move folder', del_folder: 'Delete folder',
      scope_only: 'this level only', scope_with_sub: 'incl. subfolders', global_search: 'Search “{q}”', across_folders: ' · across {n} folders',
      classify: 'Suggestions', classify_title: 'Auto-categorize (suggestions only)',
      strat_keep: 'Keep my structure (default)', strat_domain: 'Cluster by domain', strat_rules: 'Custom rules',
      apply: 'Apply', apply_all: 'Apply all', dismiss: 'Dismiss', dry_run: 'Preview',
      rule_host: 'domain contains', rule_title: 'title contains', rule_path: 'path contains', rule_before: 'added before', rule_to: 'move to',
      preflight: 'Pre-flight check', pf_ok: 'All clear — ready to export/apply.', pf_issues: '{n} item(s) to review (not necessarily to fix):',
      pf_orphan: 'Integrity', pf_empty: 'Empty folders', pf_dupname: 'Duplicate folder names', pf_depth: 'Nesting depth',
      pf_longname: 'Long titles', pf_foldernames: 'Folder naming', pf_dupurl: 'Duplicate URLs', pf_trash: 'Trash',
      pf_home: 'Can still be re-filed', pf_progress: 'Cleanup progress', pf_tops: 'Top-level folders',
      fix: 'Fix', close: 'Close', cancel: 'Cancel', confirm: 'OK',
      select_filtered: 'Select filtered results',
      undo: 'Undo', redo: 'Redo', del: 'Delete', tagline: 'See it clearly, then act',
      search_here: 'This folder only',
      g_loading: 'Reading your bookmarks…',
      g1: 'Export your bookmarks to HTML (Chrome: ⌥⌘B to open the Bookmark Manager → ⋮ at top right → Export bookmarks)',
      g2: 'Pick that HTML file here. Everything is parsed locally, nothing is uploaded',
      g3: 'When you are happy, export the final HTML and import it back. Import appends — it never overwrites your bookmarks',
      g_pick: 'Choose bookmarks HTML', g_demo: 'Load demo data', g_resume: 'Resume last session',
      g_privacy: 'No network, no uploads. The only feature that visits URLs is "Check links", and it runs only when you click it.',
      err_title: 'The extension could not read your bookmarks',
      err_hint: 'Common causes: the extension folder was rebuilt (click ↻ Reload on its card in chrome://extensions), permissions did not apply (look for a red Errors button on the card), or this page was not opened from the extension icon (the address should start with chrome-extension://).',
      g_retry: 'Retry reading bookmarks', g_fallback: 'Use file import instead',
      tree_ph: 'Filter folders…', expand_all: 'Expand all', collapse_all: 'Collapse all', no_match: 'No matching folder',
      check_links: 'Check links', checking: 'Checking…', stop: 'Stop', restart: 'Re-check', done: 'done', stopped: 'stopped',
      export_done: 'Exported {n} bookmarks', applied: 'Applied: {f} folders created, {m} moved, {d} deleted',
    },
  };

  let lang = (navigator.language || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en';

  function t(key, params) {
    const table = DICT[lang] || DICT.zh;
    let s = table[key] != null ? table[key] : (DICT.zh[key] != null ? DICT.zh[key] : key);
    if (params) for (const k in params) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
    return s;
  }
  function set(l) { lang = DICT[l] ? l : 'zh'; }
  const get = () => lang;
  const langs = () => Object.keys(DICT);

  return { t, set, get, langs };
})();
