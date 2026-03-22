import type { SpeedBumpClearedMessage } from '../../shared/messages.js';

export {};

const params = new URLSearchParams(window.location.search);
const targetUrl = params.get('url');
const delay = parseInt(params.get('delay') || '10', 10);
const domain = params.get('domain') || 'this site';

const messageEl = document.getElementById('message');
const countdownEl = document.getElementById('countdown');
const proceedBtn = document.getElementById('proceed') as HTMLButtonElement | null;

if (!targetUrl) {
  // No target URL - show error, leave proceed button disabled
  if (messageEl) {
    messageEl.textContent = 'Something went wrong - no target URL was provided.';
  }
  if (countdownEl) {
    countdownEl.style.display = 'none';
  }
} else {
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

  if (proceedBtn) {
    proceedBtn.addEventListener('click', () => {
      const msg: SpeedBumpClearedMessage = {
        type: 'speed-bump-cleared',
        domain,
      };
      chrome.runtime.sendMessage(msg, () => {
        window.location.href = targetUrl;
      });
    });
  }
}
