(async function () {
  let modal = null, viewModal = null;
  const tbody = document.getElementById('data-body');

  async function loadCustomers() {
    const search = document.getElementById('search').value;
    const status = document.getElementById('filter-status').value;
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    try {
      const data = await api('/customers?' + params.toString());
      if (data.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fas fa-users"></i><p>No customers found</p></td></tr>'; return; }
      tbody.innerHTML = data.map(c => `<tr>
        <td>${c.id}</td><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.phone || '-')}</td><td>${escapeHtml(c.email || '-')}</td>
        <td>${c.is_walk_in ? '<span class="badge badge-info">Walk-in</span>' : '<span class="badge badge-secondary">Regular</span>'}</td>
        <td><span class="badge badge-${c.status === 'active' ? 'success' : 'secondary'}">${c.status}</span></td>
        <td>
          <button class="btn btn-sm btn-outline-info me-1" onclick="viewCustomer(${c.id})"><i class="fas fa-eye"></i></button>
          <button class="btn btn-sm btn-outline-primary me-1" onclick="editCustomer(${c.id})" ${c.is_walk_in ? 'disabled' : ''}><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteCustomer(${c.id}, '${escapeHtml(c.name)}')" ${c.is_walk_in ? 'disabled' : ''}><i class="fas fa-trash"></i></button>
        </td>
      </tr>`).join('');
    } catch (err) { toast(err.message, 'error'); }
  }

  window.viewCustomer = async (id) => {
    try {
      const c = await api('/customers/' + id);
      document.getElementById('view-body').innerHTML = `
        <div class="row mb-3">
          <div class="col-md-6"><strong>${escapeHtml(c.name)}</strong><br>${escapeHtml(c.phone || '-')}<br>${escapeHtml(c.email || '-')}<br>${escapeHtml(c.address || '-')}</div>
          <div class="col-md-6 text-end">
            <div class="stat-card mb-2"><div class="stat-icon blue"><i class="fas fa-shopping-bag"></i></div><div class="stat-info"><div class="stat-label">Total Sales</div><div class="stat-value" style="font-size:16px">${formatMoney(c.totals.total_sales)}</div></div></div>
            <div class="stat-card mb-2"><div class="stat-icon green"><i class="fas fa-check-circle"></i></div><div class="stat-info"><div class="stat-label">Total Paid</div><div class="stat-value" style="font-size:16px">${formatMoney(c.totals.total_paid)}</div></div></div>
            <div class="stat-card"><div class="stat-icon red"><i class="fas fa-hand-holding-usd"></i></div><div class="stat-info"><div class="stat-label">Outstanding Due</div><div class="stat-value" style="font-size:16px">${formatMoney(c.totals.total_due)}</div></div></div>
          </div>
        </div>
        <h6>Sales History</h6>
        <table class="data-table"><thead><tr><th>Invoice</th><th>Date</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th></tr></thead><tbody>
        ${c.sales.map(s => `<tr><td><a href="/invoice.html?id=${s.id}">${s.invoice_number}</a></td><td>${formatDate(s.sale_date)}</td><td>${formatMoney(s.grand_total)}</td><td>${formatMoney(s.paid_amount)}</td><td>${formatMoney(s.due_amount)}</td><td><span class="badge badge-${s.payment_status === 'paid' ? 'success' : s.payment_status === 'partial' ? 'warning' : 'danger'}">${s.payment_status}</span></td></tr>`).join('') || '<tr><td colspan="6" class="text-center text-muted">No sales</td></tr>'}
        </tbody></table>`;
      viewModal.show();
    } catch (err) { toast(err.message, 'error'); }
  };

  window.editCustomer = async (id) => {
    try {
      const c = await api('/customers/' + id);
      document.getElementById('edit-id').value = c.id;
      document.getElementById('name').value = c.name;
      document.getElementById('phone').value = c.phone || '';
      document.getElementById('email').value = c.email || '';
      document.getElementById('address').value = c.address || '';
      document.getElementById('notes').value = c.notes || '';
      document.getElementById('status').value = c.status;
      document.getElementById('modal-title').textContent = 'Edit Customer';
      modal.show();
    } catch (err) { toast(err.message, 'error'); }
  };

  window.deleteCustomer = async (id, name) => {
    if (!confirmDialog(`Delete customer "${name}"?`)) return;
    try { await api('/customers/' + id, { method: 'DELETE' }); toast('Customer deleted', 'success'); loadCustomers(); }
    catch (err) { toast(err.message, 'error'); }
  };

  document.getElementById('add-btn').addEventListener('click', () => {
    document.getElementById('customer-form').reset();
    document.getElementById('edit-id').value = '';
    document.getElementById('modal-title').textContent = 'Add Customer';
    modal.show();
  });

  document.getElementById('save-btn').addEventListener('click', async () => {
    const id = document.getElementById('edit-id').value;
    const payload = {
      name: document.getElementById('name').value, phone: document.getElementById('phone').value,
      email: document.getElementById('email').value, address: document.getElementById('address').value,
      notes: document.getElementById('notes').value, status: document.getElementById('status').value
    };
    if (!payload.name) { toast('Name is required', 'error'); return; }
    try {
      if (id) { await api('/customers/' + id, { method: 'PUT', body: JSON.stringify(payload) }); toast('Customer updated', 'success'); }
      else { await api('/customers', { method: 'POST', body: JSON.stringify(payload) }); toast('Customer created', 'success'); }
      modal.hide(); loadCustomers();
    } catch (err) { toast(err.message, 'error'); }
  });

  document.getElementById('search-btn').addEventListener('click', loadCustomers);
  document.getElementById('search').addEventListener('keypress', e => { if (e.key === 'Enter') loadCustomers(); });

  modal = new bootstrap.Modal(document.getElementById('form-modal'));
  viewModal = new bootstrap.Modal(document.getElementById('view-modal'));
  loadCustomers();
})();
