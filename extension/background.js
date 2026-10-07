/* 扩展入口：点击工具栏图标 → 打开（或聚焦）整理台页面 */
const PAGE = 'ui/index.html';

chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL(PAGE) });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId != null) await chrome.windows.update(tabs[0].windowId, { focused: true });
    return;
  }
  chrome.tabs.create({ url: PAGE });
});
