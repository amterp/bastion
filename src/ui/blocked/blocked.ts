// Blocked page - reads query params to display reason and reset info (Phase 3)
export {};

const params = new URLSearchParams(window.location.search);
const reasonEl = document.getElementById('reason');
const resetEl = document.getElementById('reset-info');

if (reasonEl) {
  reasonEl.textContent = params.get('reason') || 'This site has been blocked by Bastion.';
}

if (resetEl) {
  const resetsAt = params.get('resetsAt');
  if (resetsAt) {
    const resetDate = new Date(parseInt(resetsAt, 10));
    resetEl.textContent = `Access resets at ${resetDate.toLocaleTimeString()}`;
  }
}
