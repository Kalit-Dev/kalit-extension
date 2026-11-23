// Background service worker minimal: toolbar ikonkasi side panel'ni ochadi.
// Qurilma ulanishi side panel'da yashaydi (Web Serial service worker'da ishonchli emas).

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
