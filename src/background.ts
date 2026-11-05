/**
 * Service worker: the toolbar button and the keyboard shortcut. Both ask the
 * active tab's content script to show or hide the window. The content script
 * ignores the message on pages that aren't YouTube Music.
 */
const TOGGLE = 'llamatubemusic:toggle';

function toggleActiveTab(): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const id = tabs[0]?.id;
    if (id === undefined) return;
    // Reading lastError stops Chrome logging an "unchecked" error on tabs
    // without the content script.
    chrome.tabs.sendMessage(id, { type: TOGGLE }, () => void chrome.runtime.lastError);
  });
}

chrome.action.onClicked.addListener(toggleActiveTab);

// Reads and sets the YTM tab's browser window state. The content script asks with
// want: 'toggle' | 'fullscreen' | 'normal' | 'state'. It gets back the state before and after.
chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  const m = msg as { type?: string; want?: string } | null;
  if (m?.type !== 'llamatubemusic:window') return false;
  const windowId = sender.tab?.windowId;
  if (windowId === undefined) {
    sendResponse({ before: null, after: null });
    return false;
  }
  void (async () => {
    try {
      const before = (await chrome.windows.get(windowId)).state ?? null;
      if (m.want === 'state') {
        sendResponse({ before, after: before });
        return;
      }
      const want = m.want === 'toggle' ? (before === 'fullscreen' ? 'normal' : 'fullscreen') : m.want;
      const updated = await chrome.windows.update(windowId, {
        state: want as chrome.windows.WindowState,
      });
      sendResponse({ before, after: updated.state ?? null });
    } catch {
      sendResponse({ before: null, after: null });
    }
  })();
  return true; // the response is sent asynchronously
});
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-window') toggleActiveTab();
});
