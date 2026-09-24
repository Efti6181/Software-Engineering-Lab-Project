// Shared utilities for the Business Inventory System frontend

const API_BASE = '/api';
const TOKEN_KEY = 'bis_token';
const USER_KEY = 'bis_user';

const auth = {
  getToken() { return localStorage.getItem(TOKEN_KEY); },
  getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } },
  setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  isLoggedIn() { return !!this.getToken(); },
  requireAuth() {
    if (!this.isLoggedIn()) { window.location.href = '/login.html'; return false; }
    return true;
  },
  requireRole(...roles) {
    const user = this.getUser();
    if (!user) { window.location.href = '/login.html'; return false; }
    if (roles.length && !roles.includes(user.role)) {
      window.location.href = '/dashboard.html';
      return false;
    }
    return true;
  }
};

async function api(path, options = {}) {
  const token = auth.getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok) {
      const msg = data.error || data.message || `Request failed (${res.status})`;
      if (res.status === 401) {
        auth.clear();
        window.location.href = '/login.html';
        return;
      }
      throw new Error(msg);
    }
    return data;
  } catch (err) {
    if (err.message === 'Failed to fetch') throw new Error('Cannot connect to server. Is the backend running?');
    throw err;
  }
}

function formatMoney(amount) {
  const num = parseFloat(amount) || 0;
  return '৳' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getStockStatus(stock, minLevel) {
  if (stock <= 0) return { label: 'Out of Stock', class: 'badge-danger' };
  if (stock <= minLevel) return { label: 'Low Stock', class: 'badge-warning' };
  return { label: 'In Stock', class: 'badge-success' };
}

function toast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast-msg ${type}`;
  const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle';
  el.innerHTML = `<i class="fas fa-${icon}"></i><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3500);
}

function showLoading(show = true) {
  let overlay = document.querySelector('.loading-overlay');
  if (show && !overlay) {
    overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(overlay);
  } else if (!show && overlay) {
    overlay.remove();
  }
}

function confirmDialog(message) {
  return window.confirm(message);
}

function debounce(fn, delay = 400) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(cell => {
    const s = String(cell == null ? '' : cell);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function renderPagination(container, total, page, limit, onPage) {
  const pages = Math.ceil(total / limit);
  if (pages <= 1) { container.innerHTML = ''; return; }
  let html = '<nav><ul class="pagination pagination-sm">';
  if (page > 1) html += `<li class="page-item"><a class="page-link" href="#" data-page="${page - 1}">&laquo;</a></li>`;
  for (let i = 1; i <= pages; i++) {
    if (Math.abs(i - page) < 3 || i === 1 || i === pages) {
      html += `<li class="page-item ${i === page ? 'active' : ''}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
    } else if (Math.abs(i - page) === 3) {
      html += '<li class="page-item disabled"><span class="page-link">...</span></li>';
    }
  }
  if (page < pages) html += `<li class="page-item"><a class="page-link" href="#" data-page="${page + 1}">&raquo;</a></li>`;
  html += '</ul></nav>';
  container.innerHTML = html;
  container.querySelectorAll('a[data-page]').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); onPage(parseInt(a.dataset.page, 10)); });
  });
}

function getTheme() { return localStorage.getItem('bis_theme') || 'light'; }
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('bis_theme', theme);
  document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}
