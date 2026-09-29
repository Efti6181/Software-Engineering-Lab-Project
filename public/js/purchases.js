(async function () {
  let modal = null, viewModal = null;
  let currentPage = 1;
  const limit = 20;
  let products = [];
  const tbody = document.getElementById('data-body');

  async function loadSuppliers() {
    const suppliers = await api('/suppliers');
    document.getElementById('supplier_id').innerHTML = '<option value="">Select Supplier</option>' + suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  }

  async function loadProducts() {
    products = await api('/products/all');
  }

  async function loadPurchases(page = 1) {
    currentPage = page;
    const search = document.getElementById('search').value;
    const status = document.getElementById('filter-status').value;
    const params = new URLSearchParams({ page, limit });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    try {
      const res = await api('/purchases?' + params.toString());
      if (res.data.length === 0) { tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><i class="fas fa-shopping-cart"></i><p>No purchases found</p></td></tr>'; document.getElementById('pagination').innerHTML = ''; return; }
      tbody.innerHTML = res.data.map(p => `<tr>
        <td>${p.purchase_number}</td><td>${escapeHtml(p.supplier_name)}</td><td>${formatDate(p.purchase_date)}</td>
        <td>${formatMoney(p.grand_total)}</td><td>${formatMoney(p.paid_amount)}</td><td>${formatMoney(p.due_amount)}</td>
        <td><span class="badge badge-${p.status === 'received' ? 'success' : p.status === 'cancelled' ? 'danger' : p.status === 'ordered' ? 'info' : 'secondary'}">${p.status}</span></td>
        <td><span class="badge badge-${p.payment_status === 'paid' ? 'success' : p.payment_status === 'partial' ? 'warning' : 'danger'}">${p.payment_status}</span></td>
        <td>
          <button class="btn btn-sm btn-outline-info me-1" onclick="viewPurchase(${p.id})"><i class="fas fa-eye"></i></button>
          ${p.status === 'draft' || p.status === 'ordered' ? `<button class="btn btn-sm btn-outline-success me-1" onclick="receivePurchase(${p.id})" title="Receive"><i class="fas fa-check"></i></button>` : ''}
          ${p.status === 'draft' || p.status === 'ordered' ? `<button class="btn btn-sm btn-outline-danger" onclick="cancelPurchase(${p.id})" title="Cancel"><i class="fas fa-times"></i></button>` : ''}
        </td>
      </tr>`).join('');
      renderPagination(document.getElementById('pagination'), res.total, res.page, res.limit, loadPurchases);
    } catch (err) { toast(err.message, 'error'); }
  }

  window.viewPurchase = async (id) => {
    try {
      const p = await api('/purchases/' + id);
      document.getElementById('view-body').innerHTML = `
        <div class="row mb-3">
          <div class="col-md-6"><strong>${p.purchase_number}</strong><br>Supplier: ${escapeHtml(p.supplier_name)}<br>Date: ${formatDate(p.purchase_date)}<br>Status: <span class="badge badge-${p.status === 'received' ? 'success' : 'secondary'}">${p.status}</span></div>
          <div class="col-md-6 text-end">Subtotal: ${formatMoney(p.subtotal)}<br>Discount: ${formatMoney(p.discount_amount)}<br>Tax: ${formatMoney(p.tax_amount)}<br>Additional: ${formatMoney(p.additional_cost)}<br><strong>Grand Total: ${formatMoney(p.grand_total)}</strong><br>Paid: ${formatMoney(p.paid_amount)}<br>Due: ${formatMoney(p.due_amount)}</div>
        </div>
        <table class="data-table"><thead><tr><th>Product</th><th>Qty</th><th>Unit Cost</th><th>Discount</th><th>Total</th></tr></thead><tbody>
        ${p.items.map(i => `<tr><td>${escapeHtml(i.product_name)}</td><td>${i.quantity}</td><td>${formatMoney(i.unit_cost)}</td><td>${formatMoney(i.item_discount)}</td><td>${formatMoney(i.line_total)}</td></tr>`).join('')}
        </tbody></table>`;
      viewModal.show();
    } catch (err) { toast(err.message, 'error'); }
  };

  window.receivePurchase = async (id) => {
    if (!confirmDialog('Receive this purchase? Stock will be updated.')) return;
    try { await api('/purchases/' + id + '/receive', { method: 'POST' }); toast('Purchase received, stock updated', 'success'); loadPurchases(currentPage); }
    catch (err) { toast(err.message, 'error'); }
  };

  window.cancelPurchase = async (id) => {
    if (!confirmDialog('Cancel this purchase?')) return;
    try { await api('/purchases/' + id + '/cancel', { method: 'POST' }); toast('Purchase cancelled', 'success'); loadPurchases(currentPage); }
    catch (err) { toast(err.message, 'error'); }
  };

  function addItemRow() {
    const row = document.createElement('tr');
    row.innerHTML = `<td><select class="form-select form-select-sm item-product">${products.map(p => `<option value="${p.id}" data-cost="${p.purchase_price}">${escapeHtml(p.name)} (${escapeHtml(p.sku)})</option>`).join('')}</select></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm item-qty" value="1"></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm item-cost" value="0"></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm item-discount" value="0"></td>
      <td class="item-total">৳0</td>
      <td><button class="btn btn-sm btn-outline-danger" onclick="this.closest('tr').remove(); calcTotals();"><i class="fas fa-times"></i></button></td>`;
    document.getElementById('items-body').appendChild(row);
    row.querySelector('.item-product').addEventListener('change', function() { row.querySelector('.item-cost').value = this.selectedOptions[0].dataset.cost || 0; calcTotals(); });
    row.querySelectorAll('input').forEach(i => i.addEventListener('input', calcTotals));
    calcTotals();
  }

  function calcTotals() {
    let subtotal = 0;
    document.querySelectorAll('#items-body tr').forEach(row => {
      const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
      const cost = parseFloat(row.querySelector('.item-cost').value) || 0;
      const disc = parseFloat(row.querySelector('.item-discount').value) || 0;
      const lt = qty * cost - disc;
      row.querySelector('.item-total').textContent = formatMoney(lt);
      subtotal += lt;
    });
    const disc = parseFloat(document.getElementById('discount_amount').value) || 0;
    const tax = parseFloat(document.getElementById('tax_amount').value) || 0;
    const add = parseFloat(document.getElementById('additional_cost').value) || 0;
    const grand = subtotal - disc + tax + add;
    const paid = parseFloat(document.getElementById('paid_amount').value) || 0;
    const due = grand - paid;
    document.getElementById('calc-subtotal').textContent = formatMoney(subtotal);
    document.getElementById('calc-discount').textContent = formatMoney(disc);
    document.getElementById('calc-tax').textContent = formatMoney(tax);
    document.getElementById('calc-additional').textContent = formatMoney(add);
    document.getElementById('calc-grand').textContent = formatMoney(grand);
    document.getElementById('calc-paid').textContent = formatMoney(paid);
    document.getElementById('calc-due').textContent = formatMoney(due);
  }

  document.getElementById('add-btn').addEventListener('click', () => {
    document.getElementById('items-body').innerHTML = '';
    document.getElementById('purchase_date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('discount_amount').value = 0;
    document.getElementById('tax_amount').value = 0;
    document.getElementById('additional_cost').value = 0;
    document.getElementById('paid_amount').value = 0;
    document.getElementById('notes').value = '';
    addItemRow();
    calcTotals();
    modal.show();
  });

  document.getElementById('add-item-btn').addEventListener('click', addItemRow);

  ['discount_amount', 'tax_amount', 'additional_cost', 'paid_amount'].forEach(id => {
    document.getElementById(id).addEventListener('input', calcTotals);
  });

  document.getElementById('save-btn').addEventListener('click', async () => {
    const items = [];
    document.querySelectorAll('#items-body tr').forEach(row => {
      items.push({
        product_id: parseInt(row.querySelector('.item-product').value, 10),
        quantity: parseFloat(row.querySelector('.item-qty').value) || 0,
        unit_cost: parseFloat(row.querySelector('.item-cost').value) || 0,
        item_discount: parseFloat(row.querySelector('.item-discount').value) || 0
      });
    });
    if (!document.getElementById('supplier_id').value) { toast('Supplier is required', 'error'); return; }
    if (items.length === 0) { toast('At least one item is required', 'error'); return; }
    const payload = {
      supplier_id: parseInt(document.getElementById('supplier_id').value, 10),
      purchase_date: document.getElementById('purchase_date').value,
      status: document.getElementById('status').value,
      paid_amount: parseFloat(document.getElementById('paid_amount').value) || 0,
      payment_method: document.getElementById('payment_method').value,
      discount_amount: parseFloat(document.getElementById('discount_amount').value) || 0,
      tax_amount: parseFloat(document.getElementById('tax_amount').value) || 0,
      additional_cost: parseFloat(document.getElementById('additional_cost').value) || 0,
      notes: document.getElementById('notes').value,
      items
    };
    try {
      await api('/purchases', { method: 'POST', body: JSON.stringify(payload) });
      toast('Purchase created', 'success');
      modal.hide(); loadPurchases(currentPage);
    } catch (err) { toast(err.message, 'error'); }
  });

  document.getElementById('search-btn').addEventListener('click', () => loadPurchases(1));
  document.getElementById('search').addEventListener('keypress', e => { if (e.key === 'Enter') loadPurchases(1); });

  try { await loadSuppliers(); await loadProducts(); } catch (e) { console.error(e); }
  modal = new bootstrap.Modal(document.getElementById('form-modal'));
  viewModal = new bootstrap.Modal(document.getElementById('view-modal'));
  loadPurchases(1);
})();
