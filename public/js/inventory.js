(async function () {
  let adjustModal = null;
  let invPage = 1, movPage = 1;
  const limit = 20;

  async function loadInventory(page = 1) {
    invPage = page;
    const search = document.getElementById('search').value;
    const status = document.getElementById('filter-status').value;
    const params = new URLSearchParams({ page, limit });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    try {
      const res = await api('/inventory?' + params.toString());
      const tbody = document.getElementById('inv-body');
      if (res.data.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fas fa-warehouse"></i><p>No products found</p></td></tr>'; document.getElementById('pagination').innerHTML = ''; return; }
      tbody.innerHTML = res.data.map(p => {
        const st = getStockStatus(p.current_stock, p.min_stock_level);
        return `<tr>
          <td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.sku)}</td><td>${escapeHtml(p.category_name || '-')}</td>
          <td>${p.current_stock} ${escapeHtml(p.unit || '')}</td><td>${p.min_stock_level}</td>
          <td>${formatMoney(p.stock_value)}</td><td><span class="badge ${st.class}">${st.label}</span></td>
        </tr>`;
      }).join('');
      renderPagination(document.getElementById('pagination'), res.total, res.page, res.limit, loadInventory);
    } catch (err) { toast(err.message, 'error'); }
  }

  async function loadMovements(page = 1) {
    movPage = page;
    const mtype = document.getElementById('movement-filter').value;
    const params = new URLSearchParams({ page, limit });
    if (mtype) params.set('movement_type', mtype);
    try {
      const res = await api('/inventory/movements?' + params.toString());
      const tbody = document.getElementById('mov-body');
      if (res.data.length === 0) { tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><i class="fas fa-exchange-alt"></i><p>No movements found</p></td></tr>'; document.getElementById('mov-pagination').innerHTML = ''; return; }
      tbody.innerHTML = res.data.map(m => `<tr>
        <td>${formatDateTime(m.created_at)}</td><td>${escapeHtml(m.product_name || '-')}</td><td>${escapeHtml(m.product_sku || '')}</td>
        <td><span class="badge badge-info">${m.movement_type}</span></td>
        <td style="color:${parseFloat(m.quantity) > 0 ? 'green' : 'red'}">${parseFloat(m.quantity) > 0 ? '+' : ''}${m.quantity}</td>
        <td>${m.previous_stock}</td><td>${m.new_stock}</td>
        <td>${escapeHtml(m.notes || '-')}</td><td>${escapeHtml(m.user_name || '-')}</td>
      </tr>`).join('');
      renderPagination(document.getElementById('mov-pagination'), res.total, res.page, res.limit, loadMovements);
    } catch (err) { toast(err.message, 'error'); }
  }

  document.getElementById('adjust-btn').addEventListener('click', async () => {
    try {
      const products = await api('/products/all');
      document.getElementById('adj-product').innerHTML = products.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sku)}) - Stock: ${p.current_stock}</option>`).join('');
    } catch (err) { toast(err.message, 'error'); return; }
    document.getElementById('adjust-form').reset();
    adjustModal.show();
  });

  document.getElementById('adj-save').addEventListener('click', async () => {
    const payload = {
      product_id: parseInt(document.getElementById('adj-product').value, 10),
      reason: document.getElementById('adj-reason').value,
      quantity_change: parseFloat(document.getElementById('adj-qty').value),
      notes: document.getElementById('adj-notes').value
    };
    if (!payload.product_id || !payload.reason || !payload.quantity_change) { toast('All fields are required', 'error'); return; }
    try {
      await api('/inventory/adjust', { method: 'POST', body: JSON.stringify(payload) });
      toast('Stock adjusted successfully', 'success');
      adjustModal.hide();
      loadInventory(invPage);
    } catch (err) { toast(err.message, 'error'); }
  });

  document.getElementById('search-btn').addEventListener('click', () => loadInventory(1));
  document.getElementById('search').addEventListener('keypress', e => { if (e.key === 'Enter') loadInventory(1); });
  document.getElementById('movement-filter').addEventListener('change', () => loadMovements(1));

  adjustModal = new bootstrap.Modal(document.getElementById('adjust-modal'));
  loadInventory(1);
  loadMovements(1);
})();
