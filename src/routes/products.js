const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { query, withTransaction } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { checkLowStock } = require('../utils/notifications');

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '../../uploads');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `product-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, category_id, brand_id, status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    let where = `WHERE 1=1`;
    const params = [];
    if (search) { params.push(`%${search}%`); where += ` AND (p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.barcode ILIKE $${params.length})`; }
    if (category_id) { params.push(category_id); where += ` AND p.category_id = $${params.length}`; }
    if (brand_id) { params.push(brand_id); where += ` AND p.brand_id = $${params.length}`; }
    if (status) { params.push(status); where += ` AND p.status = $${params.length}`; }
    if (req.query.archived === 'true') { where += ` AND p.archived = TRUE`; } else { where += ` AND p.archived = FALSE`; }

    const countResult = await query(`SELECT COUNT(*) as total FROM products p ${where}`, params);
    const total = parseInt(countResult.rows[0].total, 10);

    const dataParams = [...params, limit, offset];
    const result = await query(`
      SELECT p.*, c.name as category_name, b.name as brand_name, s.name as supplier_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN suppliers s ON p.preferred_supplier_id = s.id
      ${where} ORDER BY p.created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    res.json({ data: result.rows, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) { next(err); }
});

router.get('/all', authenticate, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT p.id, p.name, p.sku, p.barcode, p.selling_price, p.current_stock, p.min_stock_level, p.unit, p.status, p.purchase_price
      FROM products p WHERE p.archived = FALSE AND p.status = 'active' ORDER BY p.name`);
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT p.*, c.name as category_name, b.name as brand_name, s.name as supplier_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN suppliers s ON p.preferred_supplier_id = s.id
      WHERE p.id = $1`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name, sku, barcode, category_id, brand_id, description, purchase_price, selling_price, current_stock, min_stock_level, unit, preferred_supplier_id, image_url, status } = req.body;
    if (!name || !sku) return res.status(400).json({ error: 'Product name and SKU are required' });

    const existing = await query(`SELECT id FROM products WHERE sku = $1`, [sku.trim()]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'SKU already exists' });
    if (barcode) {
      const barcodeCheck = await query(`SELECT id FROM products WHERE barcode = $1`, [barcode.trim()]);
      if (barcodeCheck.rows.length > 0) return res.status(400).json({ error: 'Barcode already exists' });
    }

    const result = await withTransaction(async (client) => {
      const insertResult = await client.query(
        `INSERT INTO products (name, sku, barcode, category_id, brand_id, description, purchase_price, selling_price, current_stock, min_stock_level, unit, preferred_supplier_id, image_url, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
        [name.trim(), sku.trim(), barcode?.trim() || null, category_id || null, brand_id || null, description || null,
         parseFloat(purchase_price) || 0, parseFloat(selling_price) || 0, parseFloat(current_stock) || 0,
         parseInt(min_stock_level, 10) || 5, unit || 'pcs', preferred_supplier_id || null, image_url || null, status || 'active']
      );
      const product = insertResult.rows[0];
      if (parseFloat(current_stock) > 0) {
        await client.query(
          `INSERT INTO stock_movements (product_id, movement_type, quantity, previous_stock, new_stock, ref_type, notes, user_id)
           VALUES ($1, 'opening_stock', $2, 0, $3, 'opening_stock', 'Opening stock on product creation', $4)`,
          [product.id, parseFloat(current_stock), parseFloat(current_stock), req.user.id]
        );
      }
      return product;
    });
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'create', module: 'products', entity_id: result.id, description: `Created product: ${name}`, ip_address: req.ip });
    res.status(201).json(result);
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name, sku, barcode, category_id, brand_id, description, purchase_price, selling_price, min_stock_level, unit, preferred_supplier_id, image_url, status } = req.body;
    const id = req.params.id;
    if (sku) {
      const skuCheck = await query(`SELECT id FROM products WHERE sku = $1 AND id != $2`, [sku.trim(), id]);
      if (skuCheck.rows.length > 0) return res.status(400).json({ error: 'SKU already exists' });
    }
    if (barcode) {
      const bcCheck = await query(`SELECT id FROM products WHERE barcode = $1 AND id != $2`, [barcode.trim(), id]);
      if (bcCheck.rows.length > 0) return res.status(400).json({ error: 'Barcode already exists' });
    }
    const result = await query(
      `UPDATE products SET
        name = COALESCE($1, name), sku = COALESCE($2, sku), barcode = COALESCE($3, barcode),
        category_id = COALESCE($4, category_id), brand_id = $5, description = COALESCE($6, description),
        purchase_price = COALESCE($7, purchase_price), selling_price = COALESCE($8, selling_price),
        min_stock_level = COALESCE($9, min_stock_level), unit = COALESCE($10, unit),
        preferred_supplier_id = $11, image_url = COALESCE($12, image_url), status = COALESCE($13, status)
       WHERE id = $14 RETURNING *`,
      [name?.trim(), sku?.trim(), barcode?.trim() || null, category_id || null, brand_id || null, description,
       parseFloat(purchase_price), parseFloat(selling_price), parseInt(min_stock_level, 10), unit, preferred_supplier_id || null, image_url, status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'update', module: 'products', entity_id: id, description: `Updated product: ${name || ''}`, ip_address: req.ip });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const id = req.params.id;
    const refCheck = await query(`SELECT COUNT(*) as cnt FROM sale_items WHERE product_id = $1`, [id]);
    if (parseInt(refCheck.rows[0].cnt, 10) > 0) {
      await query(`UPDATE products SET archived = TRUE, status = 'inactive' WHERE id = $1`, [id]);
      await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'archive', module: 'products', entity_id: id, description: `Archived product (has sales references)`, ip_address: req.ip });
      return res.json({ message: 'Product archived (has sales references)' });
    }
    await query(`DELETE FROM products WHERE id = $1`, [id]);
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'delete', module: 'products', entity_id: id, description: `Deleted product`, ip_address: req.ip });
    res.json({ message: 'Product deleted' });
  } catch (err) { next(err); }
});

router.post('/:id/upload', authenticate, authorize('admin'), upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const imageUrl = `/uploads/${req.file.filename}`;
    await query(`UPDATE products SET image_url = $1 WHERE id = $2`, [imageUrl, req.params.id]);
    res.json({ image_url: imageUrl });
  } catch (err) { next(err); }
});

module.exports = router;
