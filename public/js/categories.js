(async function () {
  let modal = null;
  const tbody = document.getElementById('data-body');

  async function loadCategories() {
    const search = document.getElementById('search').value;
    const status = document.getElementById('filter-status').value;
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      const data = await api('/categories?' + params.toString());
      if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fas fa-tags"></i><p>No categories found</p></td></tr>';
        return;
      }
      tbody.innerHTML = data.map(c => `<tr>
        <td>${c.id}</td>
        <td>${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.description || '-')}</td>
        <td>${c.product_count || 0}</td>
        <td><span class="badge badge-${c.status === 'active' ? 'success' : 'secondary'}">${c.status}</span></td>
        <td>${formatDate(c.created_at)}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary me-1" onclick="editCategory(${c.id})"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteCategory(${c.id}, '${escapeHtml(c.name)}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`).join('');
    } catch (err) { toast(err.message, 'error'); }
  }

  window.editCategory = async (id) => {
    try {
      const data = await api('/categories/' + id);
      document.getElementById('edit-id').value = data.id;
      document.getElementById('name').value = data.name;
      document.getElementById('description').value = data.description || '';
      document.getElementById('status').value = data.status;
      document.getElementById('modal-title').textContent = 'Edit Category';
      modal.show();
    } catch (err) { toast(err.message, 'error'); }
  };

  window.deleteCategory = async (id, name) => {
    if (!confirmDialog(`Delete category "${name}"? This cannot be undone.`)) return;
    try {
      await api('/categories/' + id, { method: 'DELETE' });
      toast('Category deleted', 'success');
      loadCategories();
    } catch (err) { toast(err.message, 'error'); }
  };

  document.getElementById('add-btn').addEventListener('click', () => {
    document.getElementById('category-form').reset();
    document.getElementById('edit-id').value = '';
    document.getElementById('modal-title').textContent = 'Add Category';
    modal.show();
  });

  document.getElementById('save-btn').addEventListener('click', async () => {
    const id = document.getElementById('edit-id').value;
    const payload = {
      name: document.getElementById('name').value,
      description: document.getElementById('description').value,
      status: document.getElementById('status').value
    };
    if (!payload.name) { toast('Name is required', 'error'); return; }
    try {
      if (id) {
        await api('/categories/' + id, { method: 'PUT', body: JSON.stringify(payload) });
        toast('Category updated', 'success');
      } else {
        await api('/categories', { method: 'POST', body: JSON.stringify(payload) });
        toast('Category created', 'success');
      }
      modal.hide();
      loadCategories();
    } catch (err) { toast(err.message, 'error'); }
  });

  document.getElementById('search-btn').addEventListener('click', loadCategories);
  document.getElementById('search').addEventListener('keypress', e => { if (e.key === 'Enter') loadCategories(); });

  modal = new bootstrap.Modal(document.getElementById('form-modal'));
  loadCategories();
})();
