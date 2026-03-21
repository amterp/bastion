import type { ActivateBypassMessage } from '../../shared/messages.js';

export {};

const params = new URLSearchParams(window.location.search);
const reasonEl = document.getElementById('reason');
const resetEl = document.getElementById('reset-info');
const bypassSection = document.getElementById('bypass-section');

// Display reason
if (reasonEl) {
  reasonEl.textContent = params.get('reason') || 'This site has been blocked by Bastion.';
}

// Display reset countdown
const resetsAtStr = params.get('resetsAt');
if (resetEl && resetsAtStr) {
  const resetsAt = parseInt(resetsAtStr, 10);

  function updateResetCountdown() {
    const remaining = resetsAt - Date.now();
    if (remaining <= 0) {
      resetEl!.textContent = 'Access should be available now. Try refreshing.';
      return;
    }
    const minutes = Math.ceil(remaining / 60_000);
    const resetTime = new Date(resetsAt).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    resetEl!.textContent = `Access resets in ~${minutes}m (at ${resetTime})`;
    setTimeout(updateResetCountdown, 10_000);
  }

  updateResetCountdown();
}

// Bypass section
const bypassAllowed = params.get('bypassAllowed') === 'true';
const bypassRemaining = parseInt(params.get('bypassRemaining') || '0', 10);
const bypassDuration = parseInt(params.get('bypassDuration') || '5', 10);
const domain = params.get('domain') || '';
const controlType = params.get('controlType') || '';
const originalUrl = params.get('originalUrl') || '';

if (bypassSection && bypassAllowed && bypassRemaining > 0) {
  const info = document.createElement('p');
  info.className = 'bypass-info';
  info.textContent = `${bypassRemaining} bypass${bypassRemaining !== 1 ? 'es' : ''} remaining (${bypassDuration}m each)`;

  const btn = document.createElement('button');
  btn.id = 'bypass-btn';
  btn.textContent = `Use bypass (${bypassDuration}m)`;
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = 'Activating...';
    const msg: ActivateBypassMessage = {
      type: 'activate-bypass',
      domain,
      controlType: controlType as ActivateBypassMessage['controlType'],
      durationMinutes: bypassDuration,
    };
    chrome.runtime.sendMessage(msg, () => {
      // Navigate to the original URL if we have it, otherwise go back
      if (originalUrl) {
        window.location.href = originalUrl;
      } else {
        history.back();
      }
    });
  });

  bypassSection.appendChild(info);
  bypassSection.appendChild(btn);
} else if (bypassSection && params.has('bypassAllowed')) {
  const info = document.createElement('p');
  info.className = 'bypass-info bypass-exhausted';
  info.textContent = 'No bypasses remaining.';
  bypassSection.appendChild(info);
}
