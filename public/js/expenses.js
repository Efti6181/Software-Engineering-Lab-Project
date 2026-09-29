(async function () {
  let modal = null;
  let currentPage = 1;
  const limit = 20;
  const tbody = document.getElementById('data-body');

  async function loadCategories() {
    const cats = await api('/expenses/categories');
    document.getElementById('category_id').innerHTML = '<option value="">None</option>' + cats.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    document.getElementById('filter-category').innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  }

  async function loadExpenses(page = 1) {
    currentPage = page;
    const search = document.getElementById('search').value;
    const cat = document.getElementById('filter-category').value;
    const params = new URLSearchParams({ page, limit });
    if (search) params.set('search', search);
    if (cat) params.set('category_id', cat);
    try {
      const res = await api('/expenses?' + params.toString());
      if (res.data.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="fas fa-wallet"></i><p>No expenses found</p></td></tr>'; document.getElementById('pagination').innerHTML = ''; return; }
      tbody.innerHTML = res.data.map(e => `<tr>
        <td>${e.expense_number}</td><td>${escapeHtml(e.category_name || '-')}</td><td>${formatMoney(e.amount)}</td>
        <td>${formatDate(e.expense_date)}</td><td>${e.payment_method}</td><td>${escapeHtml(e.description || '-')}</td>
        <td>${escapeHtml(e.created_by_name || '-')}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary me-1" onclick="editExpense(${e.id})"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteExpense(${e.id})"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`).join('');
      renderPagination(document.getElementById('pagination'), res.total, res.page, res.limit, loadExpenses);
    } catch (err) { toast(err.message, 'error'); }
  }

  window.editExpense = async (id) => {
    try {
      const e = await api('/expenses/' + id + '/edit');
      document.getElementById('edit-id').value = e.id;
      document.getElementById('category_id').value = e.category_id || '';
      document.getElementById('amount').value = e.amount;
      document.getElementById('expense_date').value = e.expense_date;
      document.getElementById('payment_method').value = e.payment_method;
      document.getElementById('description').value = e.description || '';
      document.getElementById('modal-title').textContent = 'Edit Expense';
      modal.show();
    } catch { toast('Cannot edit expense', 'error'); }
  };

  window.deleteExpense = async (id) => {
    if (!confirmDialog('Delete this expense?')) return;
    try { await api('/expenses/' + id, { method: 'DELETE' }); toast('Expense deleted', 'success'); loadExpenses(currentPage); }
    catch (err) { toast(err.message, 'error'); }
  };

  document.getElementById('add-btn').addEventListener('click', () => {
    document.getElementById('expense-form').reset();
    document.getElementById('edit-id').value = '';
    document.getElementById('expense_date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('modal-title').textContent = 'Add Expense';
    modal.show();
  });

  document.getElementById('save-btn').addEventListener('click', async () => {
    const id = document.getElementById('edit-id').value;
    const payload = {
      category_id: document.getElementById('category_id').value || null,
      amount: parseFloat(document.getElementById('amount').value),
      expense_date: document.getElementById('expense_date').value,
      payment_method: document.getElementById('payment_method').value,
      description: document.getElementById('description').value
    };
    if (!payload.amount || payload.amount <= 0) { toast('Amount is required', 'error'); return; }
    try {
      if (id) { await api('/expenses/' + id, { method: 'PUT', body: JSON.stringify(payload) }); toast('Expense updated', 'success'); }
      else { await api('/expenses', { method: 'POST', body: JSON.stringify(payload) }); toast('Expense created', 'success'); }
      modal.hide(); loadExpenses(currentPage);
    } catch (err) { toast(err.message, 'error'); }
  });

  document.getElementById('search-btn').addEventListener('click', () => loadExpenses(1));
  document.getElementById('search').addEventListener('keypress', e => { if (e.key === 'Enter') loadExpenses(1); });

  try { await loadCategories(); } catch (e) { console.error(e); }
  modal = new bootstrap.Modal(document.getElementById('form-modal'));
  loadExpenses(1);
})();
