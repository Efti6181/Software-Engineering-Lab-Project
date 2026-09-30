(async function () {
  let currentPage = 1;
  const limit = 25;
  const tbody = document.getElementById('data-body');

  async function loadLogs(page = 1) {
    currentPage = page;
    const search = document.getElementById('search').value;
    const mod = document.getElementById('filter-module').value;
    const params = new URLSearchParams({ page, limit });
    if (search) params.set('search', search);
    if (mod) params.set('module', mod);
    try {
      const res = await api('/audit-logs?' + params.toString());
      if (res.data.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="fas fa-clipboard-list"></i><p>No audit logs found</p></td></tr>'; document.getElementById('pagination').innerHTML = ''; return; }
      tbody.innerHTML = res.data.map(l => `<tr>
        <td>${formatDateTime(l.created_at)}</td><td>${escapeHtml(l.user_name || '-')}</td>
        <td><span class="badge badge-info">${escapeHtml(l.action)}</span></td><td>${escapeHtml(l.module)}</td>
        <td>${escapeHtml(l.description || '-')}</td><td>${escapeHtml(l.ip_address || '-')}</td>
      </tr>`).join('');
      renderPagination(document.getElementById('pagination'), res.total, res.page, res.limit, loadLogs);
    } catch (err) { toast(err.message, 'error'); }
  }

  document.getElementById('search-btn').addEventListener('click', () => loadLogs(1));
  document.getElementById('search').addEventListener('keypress', e => { if (e.key === 'Enter') loadLogs(1); });
  document.getElementById('filter-module').addEventListener('change', () => loadLogs(1));

  loadLogs(1);
})();
