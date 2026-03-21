import type { SpeedBumpClearedMessage } from '../../shared/messages.js';

export {};

const params = new URLSearchParams(window.location.search);
const targetUrl = params.get('url');
const delay = parseInt(params.get('delay') || '10', 10);
const domain = params.get('domain') || 'this site';

const messageEl = document.getElementById('message');
const countdownEl = document.getElementById('countdown');
const proceedBtn = document.getElementById('proceed') as HTMLButtonElement | null;

if (messageEl) {
  messageEl.textContent = `Taking a moment before visiting ${domain}...`;
}

let remaining = delay;

function updateCountdown() {
  if (countdownEl) {
    countdownEl.textContent = String(remaining);
  }
  if (remaining <= 0 && proceedBtn) {
    proceedBtn.disabled = false;
  } else {
    remaining--;
    setTimeout(updateCountdown, 1000);
  }
}

updateCountdown();

if (proceedBtn && targetUrl) {
  proceedBtn.addEventListener('click', () => {
    // Signal the service worker to grant a clearance token by domain, then navigate
    const msg: SpeedBumpClearedMessage = {
      type: 'speed-bump-cleared',
      domain,
    };
    chrome.runtime.sendMessage(msg, () => {
      window.location.href = targetUrl;
    });
  });
}
