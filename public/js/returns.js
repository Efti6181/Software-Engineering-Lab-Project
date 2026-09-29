(async function () {
  let srModal = null, prModal = null, viewSrModal = null;
  let srPage = 1, prPage = 1;
  const limit = 20;

  async function loadSaleReturns(page = 1) {
    srPage = page;
    try {
      const res = await api('/returns/sales?page=' + page + '&limit=' + limit);
      const tbody = document.getElementById('sr-body');
      if (res.data.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fas fa-undo"></i><p>No sale returns</p></td></tr>'; document.getElementById('sr-pagination').innerHTML = ''; return; }
      tbody.innerHTML = res.data.map(r => `<tr>
        <td>${r.return_number}</td><td>${r.invoice_number}</td><td>${escapeHtml(r.customer_name)}</td>
        <td>${formatDate(r.return_date)}</td><td>${formatMoney(r.total_refund)}</td>
        <td>${r.restock ? '<span class="badge badge-success">Yes</span>' : '<span class="badge badge-secondary">No</span>'}</td>
        <td><button class="btn btn-sm btn-outline-info" onclick="viewSr(${r.id})"><i class="fas fa-eye"></i></button></td>
      </tr>`).join('');
      renderPagination(document.getElementById('sr-pagination'), res.total, res.page, res.limit, loadSaleReturns);
    } catch (err) { toast(err.message, 'error'); }
  }

  async function loadPurchaseReturns(page = 1) {
    prPage = page;
    try {
      const res = await api('/returns/purchases?page=' + page + '&limit=' + limit);
      const tbody = document.getElementById('pr-body');
      if (res.data.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="fas fa-undo"></i><p>No purchase returns</p></td></tr>'; document.getElementById('pr-pagination').innerHTML = ''; return; }
      tbody.innerHTML = res.data.map(r => `<tr>
        <td>${r.return_number}</td><td>${r.purchase_number}</td><td>${escapeHtml(r.supplier_name)}</td>
        <td>${formatDate(r.return_date)}</td><td>${formatMoney(r.total_amount)}</td>
        <td><span class="badge badge-info">Processed</span></td>
      </tr>`).join('');
      renderPagination(document.getElementById('pr-pagination'), res.total, res.page, res.limit, loadPurchaseReturns);
    } catch (err) { toast(err.message, 'error'); }
  }

  window.viewSr = async (id) => {
    try {
      const r = await api('/returns/sales/' + id);
      document.getElementById('view-sr-body').innerHTML = `
        <div class="mb-3"><strong>${r.return_number}</strong><br>Invoice: ${r.invoice_number}<br>Customer: ${escapeHtml(r.customer_name)}<br>Date: ${formatDate(r.return_date)}<br>Refund: ${formatMoney(r.total_refund)}</div>
        <table class="data-table"><thead><tr><th>Product</th><th>Qty</th><th>Refund</th><th>Reason</th></tr></thead><tbody>
        ${r.items.map(i => `<tr><td>${escapeHtml(i.product_name)}</td><td>${i.quantity}</td><td>${formatMoney(i.refund_amount)}</td><td>${escapeHtml(i.reason || '-')}</td></tr>`).join('')}
        </tbody></table>`;
      viewSrModal.show();
    } catch (err) { toast(err.message, 'error'); }
  };

  // Sale return form
  document.getElementById('sr-sale-id').addEventListener('change', async function() {
    const saleId = this.value.trim();
    if (!saleId) return;
    try {
      const sale = await api('/sales/' + saleId);
      const container = document.getElementById('sr-items-container');
      container.innerHTML = '<h6>Return Items</h6>' + sale.items.map(i => `<div class="row g-2 mb-2 align-items-end">
        <div class="col-md-5"><label class="form-label small">${escapeHtml(i.product_name)} (sold: ${i.quantity})</label></div>
        <div class="col-md-2"><input type="number" class="form-control form-control-sm sr-qty" data-item-id="${i.id}" data-product-id="${i.product_id}" placeholder="Qty" min="0" max="${i.quantity}"></div>
        <div class="col-md-3"><input type="number" step="0.01" class="form-control form-control-sm sr-refund" data-item-id="${i.id}" placeholder="Refund Amount" value="0"></div>
        <div class="col-md-2"><input type="text" class="form-control form-control-sm sr-reason-item" data-item-id="${i.id}" placeholder="Reason"></div>
      </div>`).join('');
    } catch (err) { toast('Sale not found: ' + err.message, 'error'); }
  });

  document.getElementById('sr-save').addEventListener('click', async () => {
    const saleId = document.getElementById('sr-sale-id').value.trim();
    if (!saleId) { toast('Sale ID is required', 'error'); return; }
    const items = [];
    document.querySelectorAll('.sr-qty').forEach(q => {
      const qty = parseFloat(q.value);
      if (qty > 0) {
        const itemId = q.dataset.itemId;
        const productId = q.dataset.productId;
        const refund = document.querySelector(`.sr-refund[data-item-id="${itemId}"]`).value || 0;
        const reason = document.querySelector(`.sr-reason-item[data-item-id="${itemId}"]`).value || '';
        items.push({ sale_item_id: parseInt(itemId, 10), product_id: parseInt(productId, 10), quantity: qty, refund_amount: parseFloat(refund), reason });
      }
    });
    if (items.length === 0) { toast('No items to return', 'error'); return; }
    try {
      await api('/returns/sales', { method: 'POST', body: JSON.stringify({ sale_id: parseInt(saleId, 10), items, reason: document.getElementById('sr-reason').value, restock: document.getElementById('sr-restock').checked }) });
      toast('Sale return processed', 'success');
      srModal.hide();
      loadSaleReturns(srPage);
    } catch (err) { toast(err.message, 'error'); }
  });

  // Purchase return form
  document.getElementById('pr-purchase-id').addEventListener('change', async function() {
    const purId = this.value.trim();
    if (!purId) return;
    try {
      const pur = await api('/purchases/' + purId);
      const container = document.getElementById('pr-items-container');
      container.innerHTML = '<h6>Return Items</h6>' + pur.items.map(i => `<div class="row g-2 mb-2 align-items-end">
        <div class="col-md-5"><label class="form-label small">${escapeHtml(i.product_name)} (purchased: ${i.quantity})</label></div>
        <div class="col-md-2"><input type="number" class="form-control form-control-sm pr-qty" data-item-id="${i.id}" data-product-id="${i.product_id}" placeholder="Qty" min="0" max="${i.quantity}"></div>
        <div class="col-md-3"><input type="number" step="0.01" class="form-control form-control-sm pr-refund" data-item-id="${i.id}" placeholder="Refund Amount" value="0"></div>
        <div class="col-md-2"><input type="text" class="form-control form-control-sm pr-reason-item" data-item-id="${i.id}" placeholder="Reason"></div>
      </div>`).join('');
    } catch (err) { toast('Purchase not found: ' + err.message, 'error'); }
  });

  document.getElementById('pr-save').addEventListener('click', async () => {
    const purId = document.getElementById('pr-purchase-id').value.trim();
    if (!purId) { toast('Purchase ID is required', 'error'); return; }
    const items = [];
    document.querySelectorAll('.pr-qty').forEach(q => {
      const qty = parseFloat(q.value);
      if (qty > 0) {
        const itemId = q.dataset.itemId;
        const productId = q.dataset.productId;
        const refund = document.querySelector(`.pr-refund[data-item-id="${itemId}"]`).value || 0;
        const reason = document.querySelector(`.pr-reason-item[data-item-id="${itemId}"]`).value || '';
        items.push({ purchase_item_id: parseInt(itemId, 10), product_id: parseInt(productId, 10), quantity: qty, refund_amount: parseFloat(refund), reason });
      }
    });
    if (items.length === 0) { toast('No items to return', 'error'); return; }
    try {
      await api('/returns/purchases', { method: 'POST', body: JSON.stringify({ purchase_id: parseInt(purId, 10), items, reason: document.getElementById('pr-reason').value }) });
      toast('Purchase return processed', 'success');
      prModal.hide();
      loadPurchaseReturns(prPage);
    } catch (err) { toast(err.message, 'error'); }
  });

  srModal = new bootstrap.Modal(document.getElementById('sr-modal'));
  prModal = new bootstrap.Modal(document.getElementById('pr-modal'));
  viewSrModal = new bootstrap.Modal(document.getElementById('view-sr-modal'));
  loadSaleReturns(1);
  loadPurchaseReturns(1);
})();
