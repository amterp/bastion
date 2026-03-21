export {};

const GRAYSCALE_STYLE_ID = 'bastion-grayscale';

/** Apply grayscale filter to the page */
function applyGrayscale(): void {
  if (document.getElementById(GRAYSCALE_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = GRAYSCALE_STYLE_ID;
  style.textContent = 'html { filter: grayscale(100%) !important; }';
  document.head.appendChild(style);
}

/** Remove grayscale filter */
function removeGrayscale(): void {
  const style = document.getElementById(GRAYSCALE_STYLE_ID);
  if (style) style.remove();
}

/** Ask the service worker whether degradation should be applied */
function checkDegradation(): void {
  chrome.runtime.sendMessage(
    { type: 'check-degradation', url: window.location.href },
    (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.degrade && response.effect === 'grayscale') {
        applyGrayscale();
      } else {
        removeGrayscale();
      }
    },
  );
}

// Check on load
checkDegradation();

// Re-check periodically (handles time-on-site triggers that activate mid-session)
setInterval(checkDegradation, 30_000);

// Listen for push updates from the service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'apply-degradation' && message.effect === 'grayscale') {
    applyGrayscale();
  } else if (message.type === 'remove-degradation') {
    removeGrayscale();
  }
});
