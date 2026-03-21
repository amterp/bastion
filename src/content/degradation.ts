import type { CheckDegradationMessage, DegradationResponse } from '../shared/messages.js';

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
  const msg: CheckDegradationMessage = {
    type: 'check-degradation',
    url: window.location.href,
  };
  chrome.runtime.sendMessage(msg, (response: DegradationResponse | undefined) => {
    if (chrome.runtime.lastError) return;
    if (response?.degrade && response.effect === 'grayscale') {
      applyGrayscale();
    } else {
      removeGrayscale();
    }
  });
}

// Check on load
checkDegradation();

// Re-check periodically (handles time-on-site triggers that activate mid-session)
setInterval(checkDegradation, 30_000);
