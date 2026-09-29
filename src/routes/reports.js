const express = require('express');
const { query } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

function formatDate(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

function formatDateTime(value) {
  return value ? new Date(value).toISOString().replace('T', ' ').slice(0, 19) : '';
}

function getDateRange(range, startDate, endDate) {
  if (startDate && endDate) {
    return [startDate, endDate];
  }
  const now = new Date();
  switch (range) {
    case 'today': return [now.toISOString().slice(0, 10), now.toISOString().slice(0, 10)];
    case 'yesterday': { const d = new Date(now); d.setDate(d.getDate() - 1); const ds = d.toISOString().slice(0, 10); return [ds, ds]; }
    case 'this_week': { const d = new Date(now); const day = d.getDay(); const monday = new Date(d); monday.setDate(d.getDate() - day + 1); return [monday.toISOString().slice(0, 10), now.toISOString().slice(0, 10)]; }
    case 'this_month': return [new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), now.toISOString().slice(0, 10)];
    case 'this_year': return [new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10), now.toISOString().slice(0, 10)];
    default: return [null, null];
  }
}

router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { type, range, start_date, end_date } = req.query;
    const [sd, ed] = getDateRange(range, start_date, end_date);
    const params = sd && ed ? [sd, ed] : [];

    switch (type) {
      case 'sales': {
        let sql = `SELECT s.id, s.invoice_number, s.sale_date, c.name as customer_name, s.grand_total, s.paid_amount, s.due_amount, s.payment_status, s.status, u.name as cashier_name
          FROM sales s JOIN customers c ON s.customer_id = c.id LEFT JOIN users u ON s.cashier_id = u.id WHERE s.status = 'completed'`;
        sql += ` ${sd && ed ? 'AND s.sale_date BETWEEN $1 AND $2' : ''} ORDER BY s.sale_date DESC`;
        const result = await query(sql, params);
        return res.json({ columns: ['Invoice', 'Customer', 'Date', 'Total', 'Paid', 'Due', 'Payment', 'Status', 'Cashier'], rows: result.rows.map(r => [r.invoice_number, r.customer_name, formatDate(r.sale_date), r.grand_total, r.paid_amount, r.due_amount, r.payment_status, r.status, r.cashier_name]) });
      }
      case 'purchases': {
        const result = await query(`
          SELECT p.id, p.purchase_number, p.purchase_date, s.name as supplier_name, p.grand_total, p.paid_amount, p.due_amount, p.status, p.payment_status
          FROM purchases p JOIN suppliers s ON p.supplier_id = s.id
          WHERE p.status = 'received' ${sd && ed ? 'AND p.purchase_date BETWEEN $1 AND $2' : ''} ORDER BY p.purchase_date DESC`, params);
        return res.json({ columns: ['Number', 'Supplier', 'Date', 'Total', 'Paid', 'Due', 'Status', 'Payment'], rows: result.rows.map(r => [r.purchase_number, r.supplier_name, formatDate(r.purchase_date), r.grand_total, r.paid_amount, r.due_amount, r.status, r.payment_status]) });
      }
      case 'profit_loss': {
        const salesRes = await query(`SELECT COALESCE(SUM(subtotal - discount_amount),0) as net_sales, COALESCE(SUM(tax_amount),0) as tax, COALESCE(SUM(delivery_charge),0) as delivery FROM sales WHERE status = 'completed' ${sd && ed ? 'AND sale_date BETWEEN $1 AND $2' : ''}`, params);
        const cogsRes = await query(`SELECT COALESCE(SUM(si.unit_cost * si.quantity),0) as cogs FROM sale_items si JOIN sales s ON si.sale_id = s.id WHERE s.status = 'completed' ${sd && ed ? 'AND s.sale_date BETWEEN $1 AND $2' : ''}`, params);
        const expRes = await query(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE 1=1 ${sd && ed ? 'AND expense_date BETWEEN $1 AND $2' : ''}`, params);
        const srRes = await query(`SELECT COALESCE(SUM(total_refund),0) as total FROM sale_returns WHERE 1=1 ${sd && ed ? 'AND return_date BETWEEN $1 AND $2' : ''}`, params);
        const prRes = await query(`SELECT COALESCE(SUM(total_amount),0) as total FROM purchase_returns WHERE 1=1 ${sd && ed ? 'AND return_date BETWEEN $1 AND $2' : ''}`, params);
        const netSales = parseFloat(salesRes.rows[0].net_sales);
        const cogs = parseFloat(cogsRes.rows[0].cogs);
        const expenses = parseFloat(expRes.rows[0].total);
        const srTotal = parseFloat(srRes.rows[0].total);
        const prTotal = parseFloat(prRes.rows[0].total);
        const grossProfit = netSales - cogs - srTotal + prTotal;
        const netProfit = grossProfit - expenses;
        return res.json({ columns: ['Metric', 'Amount'], rows: [
          ['Net Sales Revenue', netSales], ['Cost of Goods Sold', -cogs], ['Sales Returns', -srTotal], ['Purchase Returns', prTotal],
          ['Gross Profit', grossProfit], ['Business Expenses', -expenses], ['Net Profit', netProfit]
        ], summary: { netSales, cogs, grossProfit, expenses, netProfit } });
      }
      case 'expenses': {
        const result = await query(`
          SELECT e.expense_number, ec.name as category, e.amount, e.expense_date, e.payment_method, e.description, u.name as created_by
          FROM expenses e LEFT JOIN expense_categories ec ON e.category_id = ec.id
          LEFT JOIN users u ON e.created_by = u.id WHERE 1=1 ${sd && ed ? 'AND e.expense_date BETWEEN $1 AND $2' : ''} ORDER BY e.expense_date DESC`, params);
        return res.json({ columns: ['Number', 'Category', 'Amount', 'Date', 'Method', 'Description', 'Created By'], rows: result.rows.map(r => [r.expense_number, r.category || '-', r.amount, formatDate(r.expense_date), r.payment_method, r.description, r.created_by]) });
      }
      case 'inventory': {
        const result = await query(`
          SELECT p.name, p.sku, p.current_stock, p.min_stock_level, p.unit, p.purchase_price, (p.current_stock * p.purchase_price) as stock_value, c.name as category
          FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.archived = FALSE ORDER BY p.name`);
        return res.json({ columns: ['Product', 'SKU', 'Category', 'Stock', 'Min Level', 'Unit', 'Cost', 'Stock Value'], rows: result.rows.map(r => [r.name, r.sku, r.category || '-', r.current_stock, r.min_stock_level, r.unit, r.purchase_price, r.stock_value]) });
      }
      case 'stock_movements': {
        const result = await query(`
          SELECT sm.created_at, p.name as product_name, sm.movement_type, sm.quantity, sm.previous_stock, sm.new_stock, sm.notes, u.name as user_name
          FROM stock_movements sm LEFT JOIN products p ON sm.product_id = p.id LEFT JOIN users u ON sm.user_id = u.id
          WHERE 1=1 ${sd && ed ? 'AND sm.created_at::date BETWEEN $1 AND $2' : ''} ORDER BY sm.created_at DESC LIMIT 500`, params);
        return res.json({ columns: ['Date', 'Product', 'Type', 'Qty', 'Prev', 'New', 'Notes', 'User'], rows: result.rows.map(r => [formatDateTime(r.created_at), r.product_name, r.movement_type, r.quantity, r.previous_stock, r.new_stock, r.notes, r.user_name]) });
      }
      case 'low_stock': {
        const result = await query(`SELECT name, sku, current_stock, min_stock_level, unit FROM products WHERE archived = FALSE AND current_stock > 0 AND current_stock <= min_stock_level ORDER BY current_stock ASC`);
        return res.json({ columns: ['Product', 'SKU', 'Current Stock', 'Min Level', 'Unit'], rows: result.rows.map(r => [r.name, r.sku, r.current_stock, r.min_stock_level, r.unit]) });
      }
      case 'out_of_stock': {
        const result = await query(`SELECT name, sku, unit FROM products WHERE archived = FALSE AND current_stock <= 0 ORDER BY name`);
        return res.json({ columns: ['Product', 'SKU', 'Unit'], rows: result.rows.map(r => [r.name, r.sku, r.unit]) });
      }
      case 'customer_due': {
        const result = await query(`SELECT s.invoice_number, c.name as customer_name, s.sale_date, s.grand_total, s.paid_amount, s.due_amount FROM sales s JOIN customers c ON s.customer_id = c.id WHERE s.status = 'completed' AND s.due_amount > 0 ORDER BY s.sale_date DESC`);
        return res.json({ columns: ['Invoice', 'Customer', 'Date', 'Total', 'Paid', 'Due'], rows: result.rows.map(r => [r.invoice_number, r.customer_name, formatDate(r.sale_date), r.grand_total, r.paid_amount, r.due_amount]) });
      }
      case 'supplier_due': {
        const result = await query(`SELECT p.purchase_number, s.name as supplier_name, p.purchase_date, p.grand_total, p.paid_amount, p.due_amount FROM purchases p JOIN suppliers s ON p.supplier_id = s.id WHERE p.status = 'received' AND p.due_amount > 0 ORDER BY p.purchase_date DESC`);
        return res.json({ columns: ['Number', 'Supplier', 'Date', 'Total', 'Paid', 'Due'], rows: result.rows.map(r => [r.purchase_number, r.supplier_name, formatDate(r.purchase_date), r.grand_total, r.paid_amount, r.due_amount]) });
      }
      case 'top_products': {
        const result = await query(`
          SELECT p.name, p.sku, SUM(si.quantity) as qty_sold, SUM(si.line_total) as revenue, SUM((si.unit_price - si.unit_cost) * si.quantity - si.item_discount) as profit
          FROM sale_items si JOIN products p ON si.product_id = p.id JOIN sales s ON si.sale_id = s.id
          WHERE s.status = 'completed' ${sd && ed ? 'AND s.sale_date BETWEEN $1 AND $2' : ''}
          GROUP BY p.name, p.sku ORDER BY qty_sold DESC LIMIT 20`, params);
        return res.json({ columns: ['Product', 'SKU', 'Qty Sold', 'Revenue', 'Profit'], rows: result.rows.map(r => [r.name, r.sku, r.qty_sold, r.revenue, r.profit]) });
      }
      case 'payments': {
        const result = await query(`
          SELECT pm.payment_number, pm.party_type, pm.amount, pm.payment_method, pm.payment_date, pm.reference
          FROM payments pm WHERE 1=1 ${sd && ed ? 'AND pm.payment_date BETWEEN $1 AND $2' : ''} ORDER BY pm.payment_date DESC`, params);
        return res.json({ columns: ['Number', 'Type', 'Amount', 'Method', 'Date', 'Reference'], rows: result.rows.map(r => [r.payment_number, r.party_type, r.amount, r.payment_method, formatDate(r.payment_date), r.reference]) });
      }
      default: return res.status(400).json({ error: 'Unknown report type' });
    }
  } catch (err) { next(err); }
});

module.exports = router;
