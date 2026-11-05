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
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-window') toggleActiveTab();
});
