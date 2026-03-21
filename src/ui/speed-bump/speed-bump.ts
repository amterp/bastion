// Speed bump page - countdown timer before granting access (Phase 6)
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
    // Signal the service worker to grant a clearance token, then navigate
    chrome.runtime.sendMessage(
      { type: 'speed-bump-cleared', url: targetUrl },
      () => { window.location.href = targetUrl; },
    );
  });
}
