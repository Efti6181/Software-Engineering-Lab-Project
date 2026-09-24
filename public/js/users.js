(async function () {
  let modal = null;
  const tbody = document.getElementById('data-body');

  async function loadUsers() {
    const search = document.getElementById('search').value;
    const role = document.getElementById('filter-role').value;
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (role) params.set('role', role);
    try {
      const data = await api('/users?' + params.toString());
      if (data.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="fas fa-user-shield"></i><p>No users found</p></td></tr>'; return; }
      tbody.innerHTML = data.map(u => `<tr>
        <td>${u.id}</td><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.phone || '-')}</td>
        <td><span class="badge badge-${u.role === 'admin' ? 'danger' : 'secondary'}" style="text-transform:capitalize">${u.role}</span></td>
        <td><span class="badge badge-${u.status === 'active' ? 'success' : 'secondary'}">${u.status}</span></td>
        <td>${formatDateTime(u.last_login_at)}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary me-1" onclick="editUser(${u.id})"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${u.id}, '${escapeHtml(u.name)}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`).join('');
    } catch (err) { toast(err.message, 'error'); }
  }

  window.editUser = async (id) => {
    try {
      const u = await api('/users/' + id);
      document.getElementById('edit-id').value = u.id;
      document.getElementById('name').value = u.name;
      document.getElementById('email').value = u.email;
      document.getElementById('phone').value = u.phone || '';
      document.getElementById('password').value = '';
      document.getElementById('pw-hint').textContent = '(leave blank to keep current)';
      document.getElementById('role').value = u.role;
      document.getElementById('status').value = u.status;
      document.getElementById('modal-title').textContent = 'Edit User';
      modal.show();
    } catch (err) { toast(err.message, 'error'); }
  };

  window.deleteUser = async (id, name) => {
    if (!confirmDialog(`Delete user "${name}"?`)) return;
    try { await api('/users/' + id, { method: 'DELETE' }); toast('User deleted', 'success'); loadUsers(); }
    catch (err) { toast(err.message, 'error'); }
  };

  document.getElementById('add-btn').addEventListener('click', () => {
    document.getElementById('user-form').reset();
    document.getElementById('edit-id').value = '';
    document.getElementById('pw-hint').textContent = '*';
    document.getElementById('modal-title').textContent = 'Add User';
    modal.show();
  });

  document.getElementById('save-btn').addEventListener('click', async () => {
    const id = document.getElementById('edit-id').value;
    const payload = {
      name: document.getElementById('name').value,
      email: document.getElementById('email').value,
      phone: document.getElementById('phone').value,
      role: document.getElementById('role').value,
      status: document.getElementById('status').value
    };
    const pw = document.getElementById('password').value;
    if (pw) payload.password = pw;
    if (!payload.name || !payload.email) { toast('Name and email are required', 'error'); return; }
    if (!id && !pw) { toast('Password is required for new users', 'error'); return; }
    try {
      if (id) { await api('/users/' + id, { method: 'PUT', body: JSON.stringify(payload) }); toast('User updated', 'success'); }
      else { await api('/users', { method: 'POST', body: JSON.stringify(payload) }); toast('User created', 'success'); }
      modal.hide(); loadUsers();
    } catch (err) { toast(err.message, 'error'); }
  });

  document.getElementById('search-btn').addEventListener('click', loadUsers);
  document.getElementById('search').addEventListener('keypress', e => { if (e.key === 'Enter') loadUsers(); });

  modal = new bootstrap.Modal(document.getElementById('form-modal'));
  loadUsers();
})();
