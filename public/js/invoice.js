(async function () {
  const id = getQueryParam('id');
  if (!id) { document.getElementById('invoice-content').innerHTML = '<p class="text-center text-danger">No invoice ID provided</p>'; return; }

  try {
    const [sale, settings] = await Promise.all([api('/sales/' + id), api('/settings')]);
    const s = settings.settings || {};
    const inv = sale;
    const bName = s.business_name || 'My Business';
    const bAddr = s.address || '';
    const bPhone = s.phone || '';
    const bEmail = s.email || '';
    const footer = s.invoice_footer || '';

    document.getElementById('invoice-content').innerHTML = `
      <div class="invoice-header">
        <div>
          <h3>${escapeHtml(bName)}</h3>
          <p style="margin:0;color:#555">${escapeHtml(bAddr)}<br>${escapeHtml(bPhone)} ${bEmail ? ' | ' + escapeHtml(bEmail) : ''}</p>
        </div>
        <div class="text-end">
          <h4>INVOICE</h4>
          <p style="margin:0"><strong>${escapeHtml(inv.invoice_number)}</strong></p>
          <p style="margin:0">${formatDate(inv.sale_date)}</p>
          <p style="margin:0">Status: <span class="badge badge-${inv.status === 'completed' ? 'success' : 'warning'}">${inv.status}</span></p>
        </div>
      </div>
      <div class="row mb-3">
        <div class="col-6">
          <strong>Bill To:</strong><br>
          ${escapeHtml(inv.customer_name)}<br>
          ${escapeHtml(inv.customer_phone || '')}<br>
          ${escapeHtml(inv.customer_address || '')}
        </div>
        <div class="col-6 text-end">
          <strong>Cashier:</strong> ${escapeHtml(inv.cashier_name || '-')}<br>
          <strong>Payment Method:</strong> ${inv.payment_method || '-'}<br>
          <strong>Payment Status:</strong> <span class="badge badge-${inv.payment_status === 'paid' ? 'success' : inv.payment_status === 'partial' ? 'warning' : 'danger'}">${inv.payment_status}</span>
        </div>
      </div>
      <table class="invoice-table">
        <thead><tr><th>#</th><th>Product</th><th>Qty</th><th>Unit Price</th><th>Discount</th><th>Total</th></tr></thead>
        <tbody>
          ${inv.items.map((i, n) => `<tr>
            <td>${n + 1}</td><td>${escapeHtml(i.product_name)}</td><td>${i.quantity} ${escapeHtml(i.unit || '')}</td>
            <td>${formatMoney(i.unit_price)}</td><td>${formatMoney(i.item_discount)}</td><td>${formatMoney(i.line_total)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="row mt-3">
        <div class="col-6">${footer ? `<p style="color:#666;font-size:13px">${escapeHtml(footer)}</p>` : ''}</div>
        <div class="col-6">
          <table class="table table-sm" style="margin:0">
            <tr><td>Subtotal:</td><td class="text-end">${formatMoney(inv.subtotal)}</td></tr>
            <tr><td>Discount:</td><td class="text-end">${formatMoney(inv.discount_amount)}</td></tr>
            <tr><td>Tax:</td><td class="text-end">${formatMoney(inv.tax_amount)}</td></tr>
            <tr><td>Delivery:</td><td class="text-end">${formatMoney(inv.delivery_charge)}</td></tr>
            <tr style="border-top:2px solid #333"><td><strong>Grand Total:</strong></td><td class="text-end"><strong>${formatMoney(inv.grand_total)}</strong></td></tr>
            <tr><td>Paid:</td><td class="text-end">${formatMoney(inv.paid_amount)}</td></tr>
            <tr><td><strong>Due:</strong></td><td class="text-end"><strong style="color:#dc2626">${formatMoney(inv.due_amount)}</strong></td></tr>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    document.getElementById('invoice-content').innerHTML = `<p class="text-center text-danger">Failed to load invoice: ${escapeHtml(err.message)}</p>`;
  }
})();
