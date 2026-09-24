(async function () {
  async function loadSettings() {
    try {
      const data = await api('/settings');
      const s = data.settings || {};
      document.getElementById('business_name').value = s.business_name || '';
      document.getElementById('logo_url').value = s.logo_url || '';
      document.getElementById('phone').value = s.phone || '';
      document.getElementById('email').value = s.email || '';
      document.getElementById('address').value = s.address || '';
      document.getElementById('currency_symbol').value = s.currency_symbol || '৳';
      document.getElementById('currency_code').value = s.currency_code || 'BDT';
      document.getElementById('default_tax_percent').value = s.default_tax_percent || 0;
      document.getElementById('invoice_prefix').value = s.invoice_prefix || 'INV';
      document.getElementById('invoice_footer').value = s.invoice_footer || '';
      document.getElementById('default_low_stock_level').value = s.default_low_stock_level || 5;
      document.getElementById('allow_negative_stock').value = String(s.allow_negative_stock || false);
    } catch (err) { toast(err.message, 'error'); }
  }

  document.getElementById('save-btn').addEventListener('click', async () => {
    const payload = {
      business_name: document.getElementById('business_name').value,
      logo_url: document.getElementById('logo_url').value,
      phone: document.getElementById('phone').value,
      email: document.getElementById('email').value,
      address: document.getElementById('address').value,
      currency_symbol: document.getElementById('currency_symbol').value,
      currency_code: document.getElementById('currency_code').value,
      default_tax_percent: parseFloat(document.getElementById('default_tax_percent').value),
      invoice_prefix: document.getElementById('invoice_prefix').value,
      invoice_footer: document.getElementById('invoice_footer').value,
      default_low_stock_level: parseInt(document.getElementById('default_low_stock_level').value, 10),
      allow_negative_stock: document.getElementById('allow_negative_stock').value === 'true'
    };
    try {
      await api('/settings', { method: 'PUT', body: JSON.stringify(payload) });
      toast('Settings saved', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });

  loadSettings();
})();
