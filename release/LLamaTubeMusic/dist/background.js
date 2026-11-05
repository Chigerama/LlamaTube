"use strict";
(() => {
  // src/background.ts
  var TOGGLE = "llamatubemusic:toggle";
  function toggleActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const id = tabs[0]?.id;
      if (id === void 0) return;
      chrome.tabs.sendMessage(id, { type: TOGGLE }, () => void chrome.runtime.lastError);
    });
  }
  chrome.action.onClicked.addListener(toggleActiveTab);
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const m = msg;
    if (m?.type !== "llamatubemusic:window") return false;
    const windowId = sender.tab?.windowId;
    if (windowId === void 0) {
      sendResponse({ before: null, after: null });
      return false;
    }
    void (async () => {
      try {
        const before = (await chrome.windows.get(windowId)).state ?? null;
        if (m.want === "state") {
          sendResponse({ before, after: before });
          return;
        }
        const want = m.want === "toggle" ? before === "fullscreen" ? "normal" : "fullscreen" : m.want;
        const updated = await chrome.windows.update(windowId, {
          state: want
        });
        sendResponse({ before, after: updated.state ?? null });
      } catch {
        sendResponse({ before: null, after: null });
      }
    })();
    return true;
  });
  chrome.commands.onCommand.addListener((command) => {
    if (command === "toggle-window") toggleActiveTab();
  });
})();
