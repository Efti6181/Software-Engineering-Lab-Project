(async function () {
  function syncChartTheme() {
    if (typeof Chart === 'undefined') return;
    const dark = getTheme() === 'dark';
    const label = dark ? '#d0d9e6' : '#475569';
    const grid = dark ? 'rgba(168,182,202,.18)' : 'rgba(71,85,105,.12)';
    Chart.defaults.color = label;
    Chart.defaults.borderColor = grid;
    Object.values(Chart.instances).forEach(chart => {
      if (chart.options.plugins?.legend) {
        chart.options.plugins.legend.labels = { ...chart.options.plugins.legend.labels, color: label };
      }
      for (const axis of Object.values(chart.options.scales || {})) {
        axis.ticks = { ...axis.ticks, color: label };
        axis.grid = { ...axis.grid, color: grid };
      }
      chart.update('none');
    });
  }
  syncChartTheme();
  document.addEventListener('themechange', syncChartTheme);

  try {
    const stats = await api('/dashboard');
    document.getElementById('today-sales').textContent = formatMoney(stats.todaySales);
    document.getElementById('today-paid').textContent = 'Paid: ' + formatMoney(stats.todayPaid);
    document.getElementById('month-sales').textContent = formatMoney(stats.monthSales);
    document.getElementById('month-paid').textContent = 'Paid: ' + formatMoney(stats.monthPaid);
    document.getElementById('total-purchases').textContent = formatMoney(stats.totalPurchases);
    document.getElementById('gross-profit').textContent = formatMoney(stats.grossProfit);
    document.getElementById('net-profit').textContent = 'Net: ' + formatMoney(stats.netProfit);
    document.getElementById('expenses').textContent = formatMoney(stats.expenses);
    document.getElementById('total-products').textContent = stats.totalProducts;
    document.getElementById('inventory-value').textContent = formatMoney(stats.inventoryValue);
    document.getElementById('total-customers').textContent = stats.totalCustomers;
    document.getElementById('total-suppliers').textContent = stats.totalSuppliers;
    document.getElementById('stock-alerts').textContent = stats.lowStock + ' / ' + stats.outOfStock;
    document.getElementById('customer-due').textContent = formatMoney(stats.customerDue);
    document.getElementById('supplier-due').textContent = formatMoney(stats.supplierDue);
  } catch (err) { toast('Failed to load stats: ' + err.message, 'error'); }

  try {
    const charts = await api('/dashboard/charts');
    renderSalesPurchaseChart(charts);
    renderExpenseChart(charts);
    renderMonthlyChart(charts);
    renderTopProductsChart(charts);
  } catch (err) { console.error('Chart error:', err); }

  try {
    const act = await api('/dashboard/recent-activity');
    renderRecentSales(act.recentSales);
    renderLowStock(act.lowStockProducts);
    renderRecentLogs(act.recentLogs);
  } catch (err) { console.error('Activity error:', err); }

  function renderSalesPurchaseChart(data) {
    const ctx = document.getElementById('chart-sales-purchase');
    if (!ctx) return;
    const labels = data.salesTrend.map(d => d.date);
    const salesData = data.salesTrend.map(d => d.total);
    const purchasesByDate = new Map(data.purchaseTrend.map(d => [d.date, d.total]));
    const purchaseData = labels.map(day => purchasesByDate.get(day) ?? 0);
    new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [
        { label: 'Net Sales', data: salesData, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', tension: 0.3, fill: true },
        { label: 'Net Purchases', data: purchaseData, borderColor: '#ea580c', backgroundColor: 'rgba(234,88,12,0.1)', tension: 0.3, fill: true },
      ] },
      options: { responsive: true, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } }
    });
  }

  function renderExpenseChart(data) {
    const ctx = document.getElementById('chart-expenses');
    if (!ctx) return;
    const labels = data.expenseBreakdown.map(d => d.name);
    const amounts = data.expenseBreakdown.map(d => d.total);
    const colors = ['#2563eb','#16a34a','#ea580c','#dc2626','#0891b2','#f59e0b'];
    new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: amounts, backgroundColor: colors }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
  }

  function renderMonthlyChart(data) {
    const ctx = document.getElementById('chart-monthly');
    if (!ctx) return;
    new Chart(ctx, {
      type: 'bar',
      data: { labels: data.monthlyRevenue.map(d => d.month), datasets: [{ label: 'Revenue', data: data.monthlyRevenue.map(d => d.total), backgroundColor: '#2563eb', borderRadius: 6 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }

  function renderTopProductsChart(data) {
    const ctx = document.getElementById('chart-top-products');
    if (!ctx) return;
    new Chart(ctx, {
      type: 'bar',
      data: { labels: data.topProducts.map(d => `${d.name} (${d.sku})`), datasets: [{ label: 'Net Qty Sold', data: data.topProducts.map(d => d.qty), backgroundColor: '#16a34a', borderRadius: 6 }] },
      options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
    });
  }

  function renderRecentSales(sales) {
    const tbody = document.querySelector('#recent-sales-table tbody');
    if (!sales || sales.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No recent sales</td></tr>'; return; }
    tbody.innerHTML = sales.map(s => `<tr>
      <td><a href="/invoice.html?id=${s.id}">${escapeHtml(s.invoice_number)}</a></td>
      <td>${escapeHtml(s.customer_name)}</td>
      <td>${formatDate(s.sale_date)}</td>
      <td>${formatMoney(s.grand_total)}</td>
      <td><span class="badge badge-${s.payment_status === 'paid' ? 'success' : s.payment_status === 'partial' ? 'warning' : 'danger'}">${s.payment_status}</span></td>
    </tr>`).join('');
  }

  function renderLowStock(products) {
    const tbody = document.querySelector('#low-stock-table tbody');
    if (!products || products.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No low stock items</td></tr>'; return; }
    tbody.innerHTML = products.map(p => `<tr>
      <td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.sku)}</td>
      <td>${p.current_stock} ${escapeHtml(p.unit || '')}</td><td>${p.min_stock_level}</td>
    </tr>`).join('');
  }

  function renderRecentLogs(logs) {
    const tbody = document.querySelector('#recent-logs-table tbody');
    if (!logs || logs.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No recent activity</td></tr>'; return; }
    tbody.innerHTML = logs.map(l => `<tr>
      <td>${escapeHtml(l.user_name || '-')}</td><td>${escapeHtml(l.action)}</td><td>${escapeHtml(l.module)}</td>
      <td>${escapeHtml(l.description || '')}</td><td>${formatDateTime(l.created_at)}</td>
    </tr>`).join('');
  }
})();
