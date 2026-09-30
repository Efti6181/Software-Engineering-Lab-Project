(async function () {
  let viewModal = null;
  let currentPage = 1;
  const limit = 20;
  const tbody = document.getElementById('data-body');

  async function loadSales(page = 1) {
    currentPage = page;
    const search = document.getElementById('search').value;
    const status = document.getElementById('filter-status').value;
    const payment = document.getElementById('filter-payment').value;
    const params = new URLSearchParams({ page, limit });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (payment) params.set('payment_status', payment);
    try {
      const res = await api('/sales?' + params.toString());
      if (res.data.length === 0) { tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><i class="fas fa-receipt"></i><p>No sales found</p></td></tr>'; document.getElementById('pagination').innerHTML = ''; return; }
      tbody.innerHTML = res.data.map(s => `<tr>
        <td><a href="/invoice.html?id=${s.id}">${s.invoice_number}</a></td>
        <td>${escapeHtml(s.customer_name)}</td><td>${formatDate(s.sale_date)}</td>
        <td>${formatMoney(s.grand_total)}</td><td>${formatMoney(s.paid_amount)}</td><td>${formatMoney(s.due_amount)}</td>
        <td><span class="badge badge-${s.payment_status === 'paid' ? 'success' : s.payment_status === 'partial' ? 'warning' : 'danger'}">${s.payment_status}</span></td>
        <td><span class="badge badge-${s.status === 'completed' ? 'success' : s.status === 'voided' ? 'danger' : 'warning'}">${s.status}</span></td>
        <td>${escapeHtml(s.cashier_name || '-')}</td>
        <td>
          <a class="btn btn-sm btn-outline-info me-1" href="/invoice.html?id=${s.id}" target="_blank"><i class="fas fa-file-invoice"></i></a>
          <button class="btn btn-sm btn-outline-primary me-1" onclick="viewSale(${s.id})"><i class="fas fa-eye"></i></button>
          ${s.status === 'completed' ? `<button class="btn btn-sm btn-outline-danger" onclick="voidSale(${s.id}, '${s.invoice_number}')" title="Void"><i class="fas fa-ban"></i></button>` : ''}
        </td>
      </tr>`).join('');
      renderPagination(document.getElementById('pagination'), res.total, res.page, res.limit, loadSales);
    } catch (err) { toast(err.message, 'error'); }
  }

  window.viewSale = async (id) => {
    try {
      const s = await api('/sales/' + id);
      document.getElementById('view-body').innerHTML = `
        <div class="row mb-3">
          <div class="col-md-6"><strong>${s.invoice_number}</strong><br>Customer: ${escapeHtml(s.customer_name)}<br>Date: ${formatDate(s.sale_date)}<br>Cashier: ${escapeHtml(s.cashier_name || '-')}</div>
          <div class="col-md-6 text-end">Subtotal: ${formatMoney(s.subtotal)}<br>Discount: ${formatMoney(s.discount_amount)}<br>Tax: ${formatMoney(s.tax_amount)}<br>Delivery: ${formatMoney(s.delivery_charge)}<br><strong>Grand Total: ${formatMoney(s.grand_total)}</strong><br>Paid: ${formatMoney(s.paid_amount)}<br>Due: ${formatMoney(s.due_amount)}</div>
        </div>
        <table class="data-table"><thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Discount</th><th>Total</th></tr></thead><tbody>
        ${s.items.map(i => `<tr><td>${escapeHtml(i.product_name)}</td><td>${i.quantity}</td><td>${formatMoney(i.unit_price)}</td><td>${formatMoney(i.item_discount)}</td><td>${formatMoney(i.line_total)}</td></tr>`).join('')}
        </tbody></table>`;
      viewModal.show();
    } catch (err) { toast(err.message, 'error'); }
  };

  window.voidSale = async (id, inv) => {
    if (!confirmDialog(`Void sale ${inv}? Stock will be restored.`)) return;
    try { await api('/sales/' + id + '/void', { method: 'POST' }); toast('Sale voided, stock restored', 'success'); loadSales(currentPage); }
    catch (err) { toast(err.message, 'error'); }
  };

  document.getElementById('search-btn').addEventListener('click', () => loadSales(1));
  document.getElementById('search').addEventListener('keypress', e => { if (e.key === 'Enter') loadSales(1); });

  viewModal = new bootstrap.Modal(document.getElementById('view-modal'));
  loadSales(1);
})();
