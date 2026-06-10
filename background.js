chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ darkMode: 'off' });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url && !tab.url.startsWith('chrome://')) {
    chrome.storage.sync.get(['darkMode'], (result) => {
      const mode = result.darkMode || 'off';
      if (mode !== 'off') {
        chrome.scripting.executeScript({
          target: { tabId },
          func: (m) => {
            if (window.__smartDarkMode) window.__smartDarkMode.applyEarly(m);
          },
          args: [mode],
          world: 'MAIN'
        }).catch(() => {});
      }
    });
  }
});
