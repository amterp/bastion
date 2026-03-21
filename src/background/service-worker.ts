// Bastion service worker - entry point for background logic
console.log('Bastion service worker initialized');

chrome.runtime.onInstalled.addListener(() => {
  console.log('Bastion extension installed');
});
