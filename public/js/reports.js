(function () {
  let currentData = null;

  document.getElementById('date-range').addEventListener('change', function() {
    const isCustom = this.value === 'custom';
    document.getElementById('start-date-wrap').style.display = isCustom ? 'block' : 'none';
    document.getElementById('end-date-wrap').style.display = isCustom ? 'block' : 'none';
  });

  document.getElementById('generate-btn').addEventListener('click', async () => {
    const type = document.getElementById('report-type').value;
    const range = document.getElementById('date-range').value;
    const startDate = document.getElementById('start_date').value;
    const endDate = document.getElementById('end_date').value;
    const params = new URLSearchParams({ type });
    if (range === 'custom') { params.set('start_date', startDate); params.set('end_date', endDate); }
    else { params.set('range', range); }

    try {
      const data = await api('/reports?' + params.toString());
      currentData = data;
      const titleSelect = document.getElementById('report-type');
      document.getElementById('report-title').textContent = titleSelect.options[titleSelect.selectedIndex].text;

      const header = document.getElementById('report-header');
      const body = document.getElementById('report-body');
      header.innerHTML = data.columns.map(c => `<th>${escapeHtml(c)}</th>`).join('');

      if (data.rows.length === 0) { body.innerHTML = '<tr><td colspan="' + data.columns.length + '" class="empty-state"><p>No data found for this report</p></td></tr>'; return; }

      body.innerHTML = data.rows.map(row => '<tr>' + row.map((cell, i) => {
        const colName = data.columns[i];
        if (colName === 'Total' || colName === 'Paid' || colName === 'Due' || colName === 'Amount' || colName === 'Revenue' || colName === 'Profit' || colName === 'Cost' || colName === 'Stock Value' || colName === 'Net Sales Revenue' || colName === 'Cost of Goods Sold' || colName === 'Gross Profit' || colName === 'Net Profit' || colName === 'Business Expenses' || colName === 'Sales Returns' || colName === 'Purchase Returns') {
          return `<td>${formatMoney(cell)}</td>`;
        }
        return `<td>${escapeHtml(String(cell == null ? '-' : cell))}</td>`;
      }).join('') + '</tr>').join('');
    } catch (err) { toast(err.message, 'error'); }
  });

  document.getElementById('csv-btn').addEventListener('click', () => {
    if (!currentData || !currentData.rows.length) { toast('No data to export', 'warning'); return; }
    const rows = [currentData.columns, ...currentData.rows];
    const filename = document.getElementById('report-type').value + '_' + new Date().toISOString().slice(0, 10) + '.csv';
    downloadCSV(filename, rows);
  });

  document.getElementById('generate-btn').click();
})();
