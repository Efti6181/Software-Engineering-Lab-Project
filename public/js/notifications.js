(async function () {
  async function loadNotifications() {
    try {
      const res = await api('/notifications?limit=50');
      const container = document.getElementById('notif-container');
      if (res.data.length === 0) { container.innerHTML = '<div class="empty-state"><i class="fas fa-bell-slash"></i><p>No notifications</p></div>'; return; }
      const iconMap = { low_stock: 'exclamation-triangle', out_of_stock: 'times-circle', adjustment: 'sliders-h', large_due: 'hand-holding-usd', supplier_due: 'truck', info: 'info-circle' };
      container.innerHTML = res.data.map(n => `<div class="d-flex align-items-start gap-3 py-3 ${n.is_read ? '' : 'bg-light'}" style="border-bottom:1px solid var(--border-color);border-radius:8px;padding:12px;margin-bottom:4px">
        <div class="stat-icon ${n.type === 'out_of_stock' ? 'red' : n.type === 'low_stock' ? 'orange' : 'blue'}" style="width:40px;height:40px;font-size:16px"><i class="fas fa-${iconMap[n.type] || 'bell'}"></i></div>
        <div style="flex:1">
          <div style="font-weight:${n.is_read ? '400' : '600'}">${escapeHtml(n.title)}</div>
          <div style="font-size:13px;color:var(--text-muted)">${escapeHtml(n.message || '')}</div>
          <div style="font-size:12px;color:var(--text-muted)">${formatDateTime(n.created_at)}</div>
        </div>
        ${!n.is_read ? `<button class="btn btn-sm btn-outline-secondary" onclick="markRead(${n.id})"><i class="fas fa-check"></i></button>` : ''}
      </div>`).join('');
    } catch (err) { toast(err.message, 'error'); }
  }

  window.markRead = async (id) => {
    try { await api('/notifications/' + id + '/read', { method: 'PUT' }); loadNotifications(); }
    catch (err) { toast(err.message, 'error'); }
  };

  document.getElementById('read-all-btn').addEventListener('click', async () => {
    try { await api('/notifications/read-all', { method: 'PUT' }); toast('All marked as read', 'success'); loadNotifications(); }
    catch (err) { toast(err.message, 'error'); }
  });

  loadNotifications();
})();
