(async function () {
  let modal = null;
  let currentPage = 1;
  let showArchived = false;
  const limit = 20;
  const tbody = document.getElementById('data-body');

  async function loadDropdowns() {
    const [cats, brands, suppliers] = await Promise.all([api('/categories'), api('/brands'), api('/suppliers')]);
    const catSel = document.getElementById('category_id');
    catSel.innerHTML = '<option value="">None</option>' + cats.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    document.getElementById('filter-category').innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    const brandSel = document.getElementById('brand_id');
    brandSel.innerHTML = '<option value="">None</option>' + brands.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
    document.getElementById('filter-brand').innerHTML = '<option value="">All Brands</option>' + brands.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
    document.getElementById('preferred_supplier_id').innerHTML = '<option value="">None</option>' + suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  }

  async function loadProducts(page = 1) {
    currentPage = page;
    const search = document.getElementById('search').value;
    const cat = document.getElementById('filter-category').value;
    const brand = document.getElementById('filter-brand').value;
    const status = document.getElementById('filter-status').value;
    const params = new URLSearchParams({ page, limit, archived: showArchived });
    if (search) params.set('search', search);
    if (cat) params.set('category_id', cat);
    if (brand) params.set('brand_id', brand);
    if (status) params.set('status', status);
    try {
      const res = await api('/products?' + params.toString());
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><i class="fas fa-box"></i><p>No products found</p></td></tr>';
        document.getElementById('pagination').innerHTML = '';
        return;
      }
      tbody.innerHTML = res.data.map(p => {
        const stockStatus = getStockStatus(p.current_stock, p.min_stock_level);
        const img = p.image_url ? `<img src="${p.image_url}" style="width:36px;height:36px;border-radius:6px;object-fit:cover">` : '<div style="width:36px;height:36px;border-radius:6px;background:var(--bg-body);display:flex;align-items:center;justify-content:center"><i class="fas fa-box" style="color:var(--text-muted)"></i></div>';
        return `<tr>
          <td>${img}</td>
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(p.sku)}</td>
          <td>${escapeHtml(p.category_name || '-')}</td>
          <td>${escapeHtml(p.brand_name || '-')}</td>
          <td>${formatMoney(p.purchase_price)}</td>
          <td>${formatMoney(p.selling_price)}</td>
          <td>${p.current_stock} ${escapeHtml(p.unit || '')} <span class="badge ${stockStatus.class}">${stockStatus.label}</span></td>
          <td><span class="badge badge-${p.status === 'active' ? 'success' : 'secondary'}">${p.status}</span></td>
          <td>
            <button class="btn btn-sm btn-outline-primary me-1" onclick="editProduct(${p.id})"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteProduct(${p.id}, '${escapeHtml(p.name)}')"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`;
      }).join('');
      renderPagination(document.getElementById('pagination'), res.total, res.page, res.limit, loadProducts);
    } catch (err) { toast(err.message, 'error'); }
  }

  window.editProduct = async (id) => {
    try {
      const data = await api('/products/' + id);
      document.getElementById('edit-id').value = data.id;
      document.getElementById('name').value = data.name;
      document.getElementById('sku').value = data.sku;
      document.getElementById('barcode').value = data.barcode || '';
      document.getElementById('category_id').value = data.category_id || '';
      document.getElementById('brand_id').value = data.brand_id || '';
      document.getElementById('preferred_supplier_id').value = data.preferred_supplier_id || '';
      document.getElementById('purchase_price').value = data.purchase_price;
      document.getElementById('selling_price').value = data.selling_price;
      document.getElementById('current_stock').value = data.current_stock;
      document.getElementById('min_stock_level').value = data.min_stock_level;
      document.getElementById('unit').value = data.unit;
      document.getElementById('status').value = data.status;
      document.getElementById('image_url').value = data.image_url || '';
      document.getElementById('description').value = data.description || '';
      document.getElementById('current_stock').disabled = true;
      document.getElementById('modal-title').textContent = 'Edit Product';
      modal.show();
    } catch (err) { toast(err.message, 'error'); }
  };

  window.deleteProduct = async (id, name) => {
    if (!confirmDialog(`Delete product "${name}"? Products with sales history will be archived instead.`)) return;
    try { await api('/products/' + id, { method: 'DELETE' }); toast('Product deleted/archived', 'success'); loadProducts(currentPage); }
    catch (err) { toast(err.message, 'error'); }
  };

  document.getElementById('add-btn').addEventListener('click', () => {
    document.getElementById('product-form').reset();
    document.getElementById('edit-id').value = '';
    document.getElementById('current_stock').disabled = false;
    document.getElementById('modal-title').textContent = 'Add Product';
    modal.show();
  });

  document.getElementById('save-btn').addEventListener('click', async () => {
    const id = document.getElementById('edit-id').value;
    const payload = {
      name: document.getElementById('name').value,
      sku: document.getElementById('sku').value,
      barcode: document.getElementById('barcode').value,
      category_id: document.getElementById('category_id').value || null,
      brand_id: document.getElementById('brand_id').value || null,
      preferred_supplier_id: document.getElementById('preferred_supplier_id').value || null,
      purchase_price: parseFloat(document.getElementById('purchase_price').value),
      selling_price: parseFloat(document.getElementById('selling_price').value),
      current_stock: parseFloat(document.getElementById('current_stock').value) || 0,
      min_stock_level: parseInt(document.getElementById('min_stock_level').value, 10),
      unit: document.getElementById('unit').value,
      status: document.getElementById('status').value,
      image_url: document.getElementById('image_url').value,
      description: document.getElementById('description').value
    };
    if (!payload.name || !payload.sku) { toast('Name and SKU are required', 'error'); return; }
    try {
      if (id) {
        delete payload.current_stock;
        await api('/products/' + id, { method: 'PUT', body: JSON.stringify(payload) });
        toast('Product updated', 'success');
      } else {
        await api('/products', { method: 'POST', body: JSON.stringify(payload) });
        toast('Product created', 'success');
      }
      modal.hide(); loadProducts(currentPage);
    } catch (err) { toast(err.message, 'error'); }
  });

  document.getElementById('search-btn').addEventListener('click', () => loadProducts(1));
  document.getElementById('search').addEventListener('keypress', e => { if (e.key === 'Enter') loadProducts(1); });
  document.getElementById('archived-btn').addEventListener('click', () => {
    showArchived = !showArchived;
    document.getElementById('archived-btn').classList.toggle('btn-primary', showArchived);
    document.getElementById('archived-btn').classList.toggle('btn-outline-secondary', !showArchived);
    loadProducts(1);
  });

  try { await loadDropdowns(); } catch (e) { console.error(e); }
  modal = new bootstrap.Modal(document.getElementById('form-modal'));
  loadProducts(1);
})();
