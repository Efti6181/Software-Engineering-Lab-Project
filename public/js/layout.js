// Shared sidebar + navbar loader for all authenticated pages
(function () {
  const user = auth.getUser();
  if (!user || !['admin', 'staff'].includes(user.role)) { auth.clear(); window.location.href = '/login.html'; return; }

  const navItems = [
    { href: '/dashboard.html', icon: 'gauge', label: 'Dashboard', roles: ['admin', 'staff'] },
    { href: '/pos.html', icon: 'cash-register', label: 'POS', roles: ['admin', 'staff'] },
    { href: '/sales.html', icon: 'receipt', label: 'Sales', roles: ['admin', 'staff'] },
    { href: '/purchases.html', icon: 'shopping-cart', label: 'Purchases', roles: ['admin'] },
    { href: '/products.html', icon: 'box', label: 'Products', roles: ['admin', 'staff'] },
    { href: '/inventory.html', icon: 'warehouse', label: 'Inventory', roles: ['admin'] },
    { href: '/categories.html', icon: 'tags', label: 'Categories', roles: ['admin'] },
    { href: '/brands.html', icon: 'copyright', label: 'Brands', roles: ['admin'] },
    { href: '/customers.html', icon: 'users', label: 'Customers', roles: ['admin', 'staff'] },
    { href: '/suppliers.html', icon: 'truck', label: 'Suppliers', roles: ['admin'] },
    { href: '/expenses.html', icon: 'wallet', label: 'Expenses', roles: ['admin'] },
    { href: '/returns.html', icon: 'undo', label: 'Returns', roles: ['admin'] },
    { href: '/payments.html', icon: 'credit-card', label: 'Payments & Dues', roles: ['admin'] },
    { href: '/reports.html', icon: 'chart-bar', label: 'Reports', roles: ['admin'] },
    { href: '/users.html', icon: 'user-shield', label: 'Users', roles: ['admin'] },
    { href: '/audit-logs.html', icon: 'clipboard-list', label: 'Audit Logs', roles: ['admin'] },
    { href: '/settings.html', icon: 'gear', label: 'Settings', roles: ['admin'] },
  ];

  const currentPath = window.location.pathname;
  const currentItem = navItems.find(item => item.href === currentPath);
  if (currentItem && !currentItem.roles.includes(user.role)) {
    window.location.replace('/dashboard.html');
    return;
  }
  function renderNav(pages) {
    return navItems
    .filter(item => item.roles.includes(user.role) && pages.includes(item.href.slice(1, -5)))
    .map(item => {
      const active = currentPath === item.href ? 'active' : '';
      return `<a href="${item.href}" class="${active}"><i class="fas fa-${item.icon}"></i><span class="nav-label">${item.label}</span></a>`;
    }).join('');
  }
  const navHtml = renderNav(['dashboard', 'users', 'settings']);

  const initials = (user.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const sidebarHtml = `
    <div class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <div class="sidebar-brand-icon"><i class="fas fa-cubes"></i></div>
        <span class="sidebar-brand-text" id="sidebar-business-name">My Business</span>
      </div>
      <nav class="sidebar-nav">${navHtml}</nav>
    </div>`;

  const pageTitle = navItems.find(i => i.href === currentPath)?.label || 'Dashboard';

  const navbarHtml = `
    <div class="navbar">
      <button class="toggle-btn" id="toggle-sidebar"><i class="fas fa-bars"></i></button>
      <h1 class="page-title">${pageTitle}</h1>
      <div class="navbar-right ms-auto">
        <button class="btn btn-sm btn-outline-secondary" id="theme-toggle" title="Toggle theme"><i class="fas fa-moon"></i></button>
        <div class="notif-badge">
          <button class="btn btn-sm btn-outline-secondary position-relative" id="notif-btn" title="Notifications" style="display:none">
            <i class="fas fa-bell"></i>
            <span class="badge-count" id="notif-count" style="display:none">0</span>
          </button>
        </div>
        <div class="profile-dropdown" id="profile-dropdown">
          <button class="profile-btn" id="profile-btn">
            <div class="profile-avatar">${initials}</div>
            <span class="d-none d-md-inline">${escapeHtml(user.name)}</span>
            <i class="fas fa-chevron-down" style="font-size:11px"></i>
          </button>
          <div class="profile-menu">
            <div style="padding:8px 12px;border-bottom:1px solid var(--border-color);margin-bottom:4px">
              <div style="font-weight:600">${escapeHtml(user.name)}</div>
              <div style="font-size:12px;color:var(--text-muted)">${escapeHtml(user.email)}</div>
              <span class="badge badge-info mt-1" style="text-transform:capitalize">${user.role}</span>
            </div>
            <a href="/profile.html"><i class="fas fa-user"></i> My Profile</a>
            <button id="logout-btn"><i class="fas fa-sign-out-alt"></i> Logout</button>
          </div>
        </div>
      </div>
    </div>`;

  const layout = document.getElementById('app-layout');
  if (layout) {
    layout.innerHTML = sidebarHtml + `<div class="main-area">${navbarHtml}<div class="content" id="page-content"></div></div>`;
    const pageContent = document.getElementById('page-content');
    const customContent = document.getElementById('page-custom');
    if (customContent && pageContent) {
      pageContent.innerHTML = customContent.innerHTML;
      customContent.remove();
    }
  }

  api('/modules').then(({ pages }) => {
    const nav = document.querySelector('.sidebar-nav');
    if (nav) nav.innerHTML = renderNav(pages);
    if (pages.includes('notifications')) {
      document.getElementById('notif-btn').style.display = '';
      loadNotifCount();
      setInterval(loadNotifCount, 60000);
    }
  }).catch(() => {});

  // Toggle sidebar
  document.getElementById('toggle-sidebar')?.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle('mobile-open');
    } else {
      sidebar.classList.toggle('collapsed');
    }
  });

  // Profile dropdown
  const pd = document.getElementById('profile-dropdown');
  document.getElementById('profile-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    pd.classList.toggle('open');
  });
  document.addEventListener('click', () => pd?.classList.remove('open'));

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try { await api('/auth/me', { method: 'DELETE' }); } catch {}
    auth.clear();
    window.location.href = '/login.html';
  });

  // Theme toggle
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = getTheme();
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    document.querySelector('#theme-toggle i').className = next === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  });
  applyTheme(getTheme());
  document.querySelector('#theme-toggle i').className = getTheme() === 'dark' ? 'fas fa-sun' : 'fas fa-moon';

  // Load business name
  api('/settings').then(s => {
    const el = document.getElementById('sidebar-business-name');
    if (el && s.settings?.business_name) el.textContent = s.settings.business_name;
  }).catch(() => {});

  // Load notification count
  async function loadNotifCount() {
    try {
      const data = await api('/notifications/unread-count');
      const badge = document.getElementById('notif-count');
      if (badge) {
        const count = data.count || 0;
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = count > 0 ? 'inline-block' : 'none';
      }
    } catch {}
  }
  document.getElementById('notif-btn')?.addEventListener('click', () => { window.location.href = '/notifications.html'; });
})();
