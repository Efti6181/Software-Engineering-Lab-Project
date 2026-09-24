require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

// Every team package owns its own routes and pages. Mount each route only when
// its files have been added, so the core starts before the later pushes.
const modules = [
  ['auth', 'auth'], ['users', 'users'], ['dashboard', 'dashboard'],
  ['categories', 'categories'], ['brands', 'brands'], ['products', 'products'],
  ['inventory', 'inventory'], ['suppliers', 'suppliers'], ['purchases', 'purchases'],
  ['customers', 'customers'], ['sales', 'sales'], ['returns', 'returns'],
  ['expenses', 'expenses'], ['payments', 'payments'], ['reports', 'reports'],
  ['notifications', 'notifications'], ['settings', 'settings'],
  ['audit-logs', 'auditLogs']
];

const { errorHandler } = require('./src/middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

const availablePages = [];
for (const [slug, file] of modules) {
  const routePath = path.join(__dirname, 'src', 'routes', `${file}.js`);
  if (!fs.existsSync(routePath)) continue;
  app.use(`/api/${slug}`, require(routePath));
  if (fs.existsSync(path.join(__dirname, 'public', `${slug}.html`))) {
    availablePages.push(slug);
  }
}

app.get('/api/modules', (req, res) => res.json({ pages: availablePages }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Business Inventory System running on http://localhost:${PORT}`);
});
