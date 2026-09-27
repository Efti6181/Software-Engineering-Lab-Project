(async function () {
  let modal = null;
  const tbody = document.getElementById('data-body');

  async function loadBrands() {
    const search = document.getElementById('search').value;
    const status = document.getElementById('filter-status').value;
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      const data = await api('/brands?' + params.toString());
      if (data.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fas fa-copyright"></i><p>No brands found</p></td></tr>'; return; }
      tbody.innerHTML = data.map(b => `<tr>
        <td>${b.id}</td><td>${escapeHtml(b.name)}</td><td>${escapeHtml(b.description || '-')}</td>
        <td>${b.product_count || 0}</td>
        <td><span class="badge badge-${b.status === 'active' ? 'success' : 'secondary'}">${b.status}</span></td>
        <td>${formatDate(b.created_at)}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary me-1" onclick="editBrand(${b.id})"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteBrand(${b.id}, '${escapeHtml(b.name)}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`).join('');
    } catch (err) { toast(err.message, 'error'); }
  }

  window.editBrand = async (id) => {
    try {
      const data = await api('/brands/' + id);
      document.getElementById('edit-id').value = data.id;
      document.getElementById('name').value = data.name;
      document.getElementById('description').value = data.description || '';
      document.getElementById('status').value = data.status;
      document.getElementById('modal-title').textContent = 'Edit Brand';
      modal.show();
    } catch (err) { toast(err.message, 'error'); }
  };

  window.deleteBrand = async (id, name) => {
    if (!confirmDialog(`Delete brand "${name}"?`)) return;
    try { await api('/brands/' + id, { method: 'DELETE' }); toast('Brand deleted', 'success'); loadBrands(); }
    catch (err) { toast(err.message, 'error'); }
  };

  document.getElementById('add-btn').addEventListener('click', () => {
    document.getElementById('brand-form').reset();
    document.getElementById('edit-id').value = '';
    document.getElementById('modal-title').textContent = 'Add Brand';
    modal.show();
  });

  document.getElementById('save-btn').addEventListener('click', async () => {
    const id = document.getElementById('edit-id').value;
    const payload = { name: document.getElementById('name').value, description: document.getElementById('description').value, status: document.getElementById('status').value };
    if (!payload.name) { toast('Name is required', 'error'); return; }
    try {
      if (id) { await api('/brands/' + id, { method: 'PUT', body: JSON.stringify(payload) }); toast('Brand updated', 'success'); }
      else { await api('/brands', { method: 'POST', body: JSON.stringify(payload) }); toast('Brand created', 'success'); }
      modal.hide(); loadBrands();
    } catch (err) { toast(err.message, 'error'); }
  });

  document.getElementById('search-btn').addEventListener('click', loadBrands);
  document.getElementById('search').addEventListener('keypress', e => { if (e.key === 'Enter') loadBrands(); });
  modal = new bootstrap.Modal(document.getElementById('form-modal'));
  loadBrands();
})();
