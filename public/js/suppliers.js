(async function () {
  let modal = null, viewModal = null;
  const tbody = document.getElementById('data-body');

  async function loadSuppliers() {
    const search = document.getElementById('search').value;
    const status = document.getElementById('filter-status').value;
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    try {
      const data = await api('/suppliers?' + params.toString());
      if (data.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fas fa-truck"></i><p>No suppliers found</p></td></tr>'; return; }
      tbody.innerHTML = data.map(s => `<tr>
        <td>${s.id}</td><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.company_name || '-')}</td>
        <td>${escapeHtml(s.phone || '-')}</td><td>${escapeHtml(s.email || '-')}</td>
        <td><span class="badge badge-${s.status === 'active' ? 'success' : 'secondary'}">${s.status}</span></td>
        <td>
          <button class="btn btn-sm btn-outline-info me-1" onclick="viewSupplier(${s.id})"><i class="fas fa-eye"></i></button>
          <button class="btn btn-sm btn-outline-primary me-1" onclick="editSupplier(${s.id})"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteSupplier(${s.id}, '${escapeHtml(s.name)}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`).join('');
    } catch (err) { toast(err.message, 'error'); }
  }

  window.viewSupplier = async (id) => {
    try {
      const s = await api('/suppliers/' + id);
      document.getElementById('view-body').innerHTML = `
        <div class="row mb-3">
          <div class="col-md-6"><strong>${escapeHtml(s.name)}</strong><br>${escapeHtml(s.company_name || '')}<br>${escapeHtml(s.phone || '-')}<br>${escapeHtml(s.email || '-')}</div>
          <div class="col-md-6 text-end">
            <div class="stat-card mb-2"><div class="stat-icon blue"><i class="fas fa-shopping-cart"></i></div><div class="stat-info"><div class="stat-label">Total Purchases</div><div class="stat-value" style="font-size:16px">${formatMoney(s.totals.total_purchases)}</div></div></div>
            <div class="stat-card mb-2"><div class="stat-icon green"><i class="fas fa-check-circle"></i></div><div class="stat-info"><div class="stat-label">Total Paid</div><div class="stat-value" style="font-size:16px">${formatMoney(s.totals.total_paid)}</div></div></div>
            <div class="stat-card"><div class="stat-icon red"><i class="fas fa-hand-holding-usd"></i></div><div class="stat-info"><div class="stat-label">Outstanding Due</div><div class="stat-value" style="font-size:16px">${formatMoney(s.totals.total_due)}</div></div></div>
          </div>
        </div>
        <h6>Purchase History</h6>
        <table class="data-table"><thead><tr><th>Number</th><th>Date</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th></tr></thead><tbody>
        ${s.purchases.map(p => `<tr><td>${p.purchase_number}</td><td>${formatDate(p.purchase_date)}</td><td>${formatMoney(p.grand_total)}</td><td>${formatMoney(p.paid_amount)}</td><td>${formatMoney(p.due_amount)}</td><td><span class="badge badge-${p.status === 'received' ? 'success' : 'secondary'}">${p.status}</span></td></tr>`).join('') || '<tr><td colspan="6" class="text-center text-muted">No purchases</td></tr>'}
        </tbody></table>`;
      viewModal.show();
    } catch (err) { toast(err.message, 'error'); }
  };

  window.editSupplier = async (id) => {
    try {
      const s = await api('/suppliers/' + id);
      document.getElementById('edit-id').value = s.id;
      document.getElementById('name').value = s.name;
      document.getElementById('company_name').value = s.company_name || '';
      document.getElementById('phone').value = s.phone || '';
      document.getElementById('email').value = s.email || '';
      document.getElementById('address').value = s.address || '';
      document.getElementById('notes').value = s.notes || '';
      document.getElementById('status').value = s.status;
      document.getElementById('modal-title').textContent = 'Edit Supplier';
      modal.show();
    } catch (err) { toast(err.message, 'error'); }
  };

  window.deleteSupplier = async (id, name) => {
    if (!confirmDialog(`Delete supplier "${name}"?`)) return;
    try { await api('/suppliers/' + id, { method: 'DELETE' }); toast('Supplier deleted', 'success'); loadSuppliers(); }
    catch (err) { toast(err.message, 'error'); }
  };

  document.getElementById('add-btn').addEventListener('click', () => {
    document.getElementById('supplier-form').reset();
    document.getElementById('edit-id').value = '';
    document.getElementById('modal-title').textContent = 'Add Supplier';
    modal.show();
  });

  document.getElementById('save-btn').addEventListener('click', async () => {
    const id = document.getElementById('edit-id').value;
    const payload = {
      name: document.getElementById('name').value, company_name: document.getElementById('company_name').value,
      phone: document.getElementById('phone').value, email: document.getElementById('email').value,
      address: document.getElementById('address').value, notes: document.getElementById('notes').value,
      status: document.getElementById('status').value
    };
    if (!payload.name) { toast('Name is required', 'error'); return; }
    try {
      if (id) { await api('/suppliers/' + id, { method: 'PUT', body: JSON.stringify(payload) }); toast('Supplier updated', 'success'); }
      else { await api('/suppliers', { method: 'POST', body: JSON.stringify(payload) }); toast('Supplier created', 'success'); }
      modal.hide(); loadSuppliers();
    } catch (err) { toast(err.message, 'error'); }
  });

  document.getElementById('search-btn').addEventListener('click', loadSuppliers);
  document.getElementById('search').addEventListener('keypress', e => { if (e.key === 'Enter') loadSuppliers(); });

  modal = new bootstrap.Modal(document.getElementById('form-modal'));
  viewModal = new bootstrap.Modal(document.getElementById('view-modal'));
  loadSuppliers();
})();
