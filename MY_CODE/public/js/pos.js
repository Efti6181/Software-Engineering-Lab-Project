(async function () {
  let products = [];
  let cart = [];
  let customers = [];
  let submitting = false;

  async function loadProducts() {
    try {
      products = await api('/products/all');
      renderProducts();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function loadCustomers() {
    try {
      customers = await api('/customers');
      document.getElementById('customer_id').innerHTML = customers.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.is_walk_in ? '' : ' - ' + escapeHtml(c.phone || '')}</option>`).join('');
    } catch (err) { toast(err.message, 'error'); }
  }

  function renderProducts(filter = '') {
    const grid = document.getElementById('product-grid');
    const filtered = filter ? products.filter(p =>
      p.name.toLowerCase().includes(filter.toLowerCase()) ||
      p.sku.toLowerCase().includes(filter.toLowerCase()) ||
      (p.barcode || '').toLowerCase().includes(filter.toLowerCase())
    ) : products;
    if (filtered.length === 0) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-box-open"></i><p>No products found</p></div>'; return; }
    grid.innerHTML = filtered.map(p => {
      const st = getStockStatus(p.current_stock, p.min_stock_level || 5);
      return `<div class="pos-product-card" onclick="addToCart(${p.id})" ${p.current_stock <= 0 ? 'style="opacity:0.5"' : ''}>
        <div class="prod-name">${escapeHtml(p.name)}</div>
        <div class="prod-price">${formatMoney(p.selling_price)}</div>
        <div class="prod-stock">${st.label} (${p.current_stock})</div>
      </div>`;
    }).join('');
  }

  window.addToCart = (productId) => {
    const product = products.find(p => p.id === productId);
    if (!product || product.current_stock <= 0) { toast('Product out of stock', 'warning'); return; }
    const existing = cart.find(c => c.product_id === productId);
    if (existing) {
      if (existing.quantity >= product.current_stock) { toast('Cannot add more than available stock', 'warning'); return; }
      existing.quantity += 1;
    } else {
      cart.push({ product_id: productId, name: product.name, sku: product.sku, quantity: 1, unit_price: parseFloat(product.selling_price), item_discount: 0, max_stock: product.current_stock });
    }
    renderCart();
  };

  function renderCart() {
    const container = document.getElementById('cart-items');
    if (cart.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-cart-plus"></i><p>Cart is empty</p></div>';
      document.getElementById('checkout-btn').disabled = true;
      calcTotals();
      return;
    }
    document.getElementById('checkout-btn').disabled = false;
    container.innerHTML = cart.map((item, i) => `<div class="cart-item">
      <div style="flex:1">
        <div style="font-weight:600;font-size:13px">${escapeHtml(item.name)}</div>
        <div style="font-size:12px;color:var(--text-muted)">${formatMoney(item.unit_price)} each</div>
      </div>
      <input type="number" class="form-control form-control-sm cart-qty" style="width:60px" value="${item.quantity}" min="1" max="${item.max_stock}" onchange="updateQty(${i}, this.value)">
      <div style="width:80px;text-align:right;font-weight:600">${formatMoney(item.quantity * item.unit_price - item.item_discount)}</div>
      <button class="btn btn-sm btn-outline-danger" onclick="removeFromCart(${i})"><i class="fas fa-times"></i></button>
    </div>`).join('');
    calcTotals();
  }

  window.updateQty = (index, val) => {
    const qty = parseFloat(val) || 1;
    if (qty > cart[index].max_stock) { toast('Cannot exceed available stock', 'warning'); cart[index].quantity = cart[index].max_stock; }
    else cart[index].quantity = qty;
    renderCart();
  };

  window.removeFromCart = (index) => { cart.splice(index, 1); renderCart(); };

  function calcTotals() {
    const subtotal = cart.reduce((s, i) => s + (i.quantity * i.unit_price - i.item_discount), 0);
    const disc = parseFloat(document.getElementById('discount_amount').value) || 0;
    const tax = parseFloat(document.getElementById('tax_amount').value) || 0;
    const del = parseFloat(document.getElementById('delivery_charge').value) || 0;
    const grand = subtotal - disc + tax + del;
    const paid = parseFloat(document.getElementById('paid_amount').value) || 0;
    const due = grand - paid;
    document.getElementById('cart-subtotal').textContent = formatMoney(subtotal);
    document.getElementById('cart-discount').textContent = formatMoney(disc);
    document.getElementById('cart-tax').textContent = formatMoney(tax);
    document.getElementById('cart-delivery').textContent = formatMoney(del);
    document.getElementById('cart-grand').textContent = formatMoney(grand);
    document.getElementById('cart-paid').textContent = formatMoney(paid);
    document.getElementById('cart-due').textContent = formatMoney(due);
  }

  ['discount_amount', 'tax_amount', 'delivery_charge', 'paid_amount'].forEach(id => {
    document.getElementById(id).addEventListener('input', calcTotals);
  });

  document.getElementById('product-search').addEventListener('input', debounce((event) => {
    renderProducts(event.target.value.trim());
  }, 300));

  document.getElementById('checkout-btn').addEventListener('click', async () => {
    if (submitting) return;
    if (cart.length === 0) { toast('Cart is empty', 'warning'); return; }
    submitting = true;
    const btn = document.getElementById('checkout-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Processing...';
    const payload = {
      customer_id: parseInt(document.getElementById('customer_id').value, 10),
      items: cart.map(i => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price, item_discount: i.item_discount })),
      discount_amount: parseFloat(document.getElementById('discount_amount').value) || 0,
      tax_amount: parseFloat(document.getElementById('tax_amount').value) || 0,
      delivery_charge: parseFloat(document.getElementById('delivery_charge').value) || 0,
      paid_amount: parseFloat(document.getElementById('paid_amount').value) || 0,
      payment_method: document.getElementById('payment_method').value
    };
    try {
      const sale = await api('/sales', { method: 'POST', body: JSON.stringify(payload) });
      toast('Sale completed! Invoice: ' + sale.invoice_number, 'success');
      cart = [];
      document.getElementById('discount_amount').value = 0;
      document.getElementById('tax_amount').value = 0;
      document.getElementById('delivery_charge').value = 0;
      document.getElementById('paid_amount').value = 0;
      renderCart();
      loadProducts();
      if (confirmDialog('Sale completed. View invoice?')) window.open('/invoice.html?id=' + sale.id, '_blank');
    } catch (err) { toast(err.message, 'error'); }
    finally {
      submitting = false;
      btn.disabled = cart.length === 0;
      btn.innerHTML = '<i class="fas fa-check-circle"></i> Complete Sale';
    }
  });

  await loadProducts();
  await loadCustomers();
  renderCart();
})();
