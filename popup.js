const buttons = document.querySelectorAll('.mode-btn');

function setActive(mode) {
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

chrome.storage.sync.get(['darkMode'], ({ darkMode = 'off' }) => {
  setActive(darkMode);
});

buttons.forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    chrome.storage.sync.set({ darkMode: mode }, () => {
      setActive(mode);
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab?.id || tab.url?.startsWith('chrome://')) return;
        chrome.tabs.sendMessage(tab.id, { type: 'SET_MODE', mode }).catch(() => {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          }).then(() => {
            chrome.tabs.sendMessage(tab.id, { type: 'SET_MODE', mode }).catch(() => {});
          }).catch(() => {});
        });
      });
    });
  });
});
