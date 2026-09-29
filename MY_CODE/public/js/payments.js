(async function () {
  let payModal = null;
  let payPage = 1;
  const limit = 20;

  async function loadDues() {
    try {
      const data = await api('/payments/dues');
      document.getElementById('customer-dues-body').innerHTML = data.customerDues.length === 0
        ? '<tr><td colspan="6" class="text-center text-muted">No customer dues</td></tr>'
        : data.customerDues.map(d => `<tr>
          <td><a href="/invoice.html?id=${d.id}">${d.invoice_number}</a></td><td>${escapeHtml(d.customer_name)}</td>
          <td>${formatMoney(d.grand_total)}</td><td>${formatMoney(d.paid_amount)}</td><td>${formatMoney(d.due_amount)}</td>
          <td><button class="btn btn-sm btn-success" onclick="openPayment('customer', ${d.customer_id}, 'sale', ${d.id}, ${d.due_amount})"><i class="fas fa-money-bill-wave"></i> Pay</button></td>
        </tr>`).join('');
      document.getElementById('supplier-dues-body').innerHTML = data.supplierDues.length === 0
        ? '<tr><td colspan="6" class="text-center text-muted">No supplier dues</td></tr>'
        : data.supplierDues.map(d => `<tr>
          <td>${d.purchase_number}</td><td>${escapeHtml(d.supplier_name)}</td>
          <td>${formatMoney(d.grand_total)}</td><td>${formatMoney(d.paid_amount)}</td><td>${formatMoney(d.due_amount)}</td>
          <td><button class="btn btn-sm btn-success" onclick="openPayment('supplier', ${d.supplier_id}, 'purchase', ${d.id}, ${d.due_amount})"><i class="fas fa-money-bill-wave"></i> Pay</button></td>
        </tr>`).join('');
    } catch (err) { toast(err.message, 'error'); }
  }

  async function loadPayments(page = 1) {
    payPage = page;
    try {
      const res = await api('/payments?page=' + page + '&limit=' + limit);
      const tbody = document.getElementById('payments-body');
      if (res.data.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fas fa-credit-card"></i><p>No payments found</p></td></tr>'; return; }
      tbody.innerHTML = res.data.map(p => `<tr>
        <td>${p.payment_number}</td>
        <td><span class="badge badge-${p.party_type === 'customer' ? 'info' : 'warning'}">${p.party_type}</span></td>
        <td>${p.reference || '-'}</td><td>${formatMoney(p.amount)}</td>
        <td>${p.payment_method}</td><td>${formatDate(p.payment_date)}</td><td>${escapeHtml(p.reference || '-')}</td>
      </tr>`).join('');
      renderPagination(document.getElementById('pagination'), res.total, res.page, res.limit, loadPayments);
    } catch (err) { toast(err.message, 'error'); }
  }

  window.openPayment = (partyType, partyId, refType, refId, maxAmount) => {
    document.getElementById('pay-party-type').value = partyType;
    document.getElementById('pay-party-id').value = partyId;
    document.getElementById('pay-ref-type').value = refType;
    document.getElementById('pay-ref-id').value = refId;
    document.getElementById('pay-amount').value = maxAmount;
    document.getElementById('pay-amount').max = maxAmount;
    document.getElementById('pay-reference').value = '';
    document.getElementById('pay-notes').value = '';
    payModal.show();
  };

  document.getElementById('pay-save').addEventListener('click', async () => {
    const payload = {
      party_type: document.getElementById('pay-party-type').value,
      party_id: parseInt(document.getElementById('pay-party-id').value, 10),
      ref_type: document.getElementById('pay-ref-type').value,
      ref_id: parseInt(document.getElementById('pay-ref-id').value, 10),
      amount: parseFloat(document.getElementById('pay-amount').value),
      payment_method: document.getElementById('pay-method').value,
      reference: document.getElementById('pay-reference').value,
      notes: document.getElementById('pay-notes').value
    };
    if (!payload.amount || payload.amount <= 0) { toast('Amount is required', 'error'); return; }
    try {
      await api('/payments', { method: 'POST', body: JSON.stringify(payload) });
      toast('Payment recorded', 'success');
      payModal.hide();
      loadDues();
      loadPayments(payPage);
    } catch (err) { toast(err.message, 'error'); }
  });

  payModal = new bootstrap.Modal(document.getElementById('pay-modal'));
  loadDues();
  loadPayments(1);
})();
