(async function () {
  const user = auth.getUser();
  if (!user) return;
  const initials = (user.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  document.getElementById('profile-avatar').textContent = initials;
  document.getElementById('profile-name').textContent = user.name;
  document.getElementById('profile-email').textContent = user.email;
  document.getElementById('profile-role').textContent = user.role;

  document.getElementById('change-pw-btn').addEventListener('click', async () => {
    const curr = document.getElementById('current_password').value;
    const next = document.getElementById('new_password').value;
    const conf = document.getElementById('confirm_password').value;
    if (!curr || !next || !conf) { toast('All fields are required', 'error'); return; }
    if (next.length < 6) { toast('New password must be at least 6 characters', 'error'); return; }
    if (next !== conf) { toast('Passwords do not match', 'error'); return; }
    try {
      await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password: curr, new_password: next }) });
      toast('Password changed successfully', 'success');
      document.getElementById('pw-form').reset();
    } catch (err) { toast(err.message, 'error'); }
  });
})();
