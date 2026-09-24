const express = require('express');
const { query } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const todaySales = await query(`
      SELECT COALESCE(SUM(grand_total),0) as total, COALESCE(SUM(paid_amount),0) as paid
      FROM sales WHERE sale_date = CURRENT_DATE AND status = 'completed'`);
    const monthSales = await query(`
      SELECT COALESCE(SUM(grand_total),0) as total, COALESCE(SUM(paid_amount),0) as paid
      FROM sales WHERE date_trunc('month', sale_date) = date_trunc('month', now()) AND status = 'completed'`);
    const totalPurchases = await query(`
      SELECT COALESCE(SUM(grand_total),0) as total, COALESCE(SUM(paid_amount),0) as paid
      FROM purchases WHERE status = 'received'`);
    const totalExpenses = await query(`SELECT COALESCE(SUM(amount),0) as total FROM expenses`);
    const productStats = await query(`
      SELECT COUNT(*) as total,
        COALESCE(SUM(current_stock * purchase_price),0) as inventory_value,
        COUNT(*) FILTER (WHERE current_stock <= 0 AND archived = FALSE) as out_of_stock,
        COUNT(*) FILTER (WHERE current_stock > 0 AND current_stock <= min_stock_level AND archived = FALSE) as low_stock
      FROM products WHERE archived = FALSE`);
    const customerCount = await query(`SELECT COUNT(*) as total FROM customers WHERE status = 'active' AND is_walk_in = FALSE`);
    const supplierCount = await query(`SELECT COUNT(*) as total FROM suppliers WHERE status = 'active'`);

    // Gross profit: sum of (unit_price - unit_cost) * quantity for completed sales
    const grossProfit = await query(`
      SELECT COALESCE(SUM((si.unit_price - si.unit_cost) * si.quantity - si.item_discount),0) as gross
      FROM sale_items si JOIN sales s ON si.sale_id = s.id
      WHERE s.status = 'completed'`);
    const netProfit = parseFloat(grossProfit.rows[0].gross) - parseFloat(totalExpenses.rows[0].total);

    // Customer due
    const customerDue = await query(`
      SELECT COALESCE(SUM(due_amount),0) as total FROM sales WHERE status = 'completed' AND due_amount > 0`);
    // Supplier due
    const supplierDue = await query(`
      SELECT COALESCE(SUM(due_amount),0) as total FROM purchases WHERE status = 'received' AND due_amount > 0`);

    res.json({
      todaySales: parseFloat(todaySales.rows[0].total),
      todayPaid: parseFloat(todaySales.rows[0].paid),
      monthSales: parseFloat(monthSales.rows[0].total),
      monthPaid: parseFloat(monthSales.rows[0].paid),
      totalPurchases: parseFloat(totalPurchases.rows[0].total),
      grossProfit: parseFloat(grossProfit.rows[0].gross),
      netProfit: netProfit,
      expenses: parseFloat(totalExpenses.rows[0].total),
      totalProducts: parseInt(productStats.rows[0].total, 10),
      inventoryValue: parseFloat(productStats.rows[0].inventory_value),
      totalCustomers: parseInt(customerCount.rows[0].total, 10),
      totalSuppliers: parseInt(supplierCount.rows[0].total, 10),
      lowStock: parseInt(productStats.rows[0].low_stock, 10),
      outOfStock: parseInt(productStats.rows[0].out_of_stock, 10),
      customerDue: parseFloat(customerDue.rows[0].total),
      supplierDue: parseFloat(supplierDue.rows[0].total),
    });
  } catch (err) { next(err); }
});

router.get('/charts', authenticate, async (req, res, next) => {
  try {
    const salesTrend = await query(`
      WITH days AS (
        SELECT generate_series(CURRENT_DATE - 29, CURRENT_DATE, '1 day'::interval)::date AS day
      ), sold AS (
        SELECT sale_date AS day, SUM(grand_total) AS amount
        FROM sales WHERE status IN ('completed', 'returned')
          AND sale_date BETWEEN CURRENT_DATE - 29 AND CURRENT_DATE GROUP BY sale_date
      ), refunded AS (
        SELECT return_date AS day, SUM(total_refund) AS amount
        FROM sale_returns WHERE return_date BETWEEN CURRENT_DATE - 29 AND CURRENT_DATE GROUP BY return_date
      )
      SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
        COALESCE(sold.amount, 0) - COALESCE(refunded.amount, 0) AS total
      FROM days LEFT JOIN sold ON sold.day = days.day
      LEFT JOIN refunded ON refunded.day = days.day ORDER BY days.day`);
    const purchaseTrend = await query(`
      WITH days AS (
        SELECT generate_series(CURRENT_DATE - 29, CURRENT_DATE, '1 day'::interval)::date AS day
      ), bought AS (
        SELECT purchase_date AS day, SUM(grand_total) AS amount
        FROM purchases WHERE status = 'received'
          AND purchase_date BETWEEN CURRENT_DATE - 29 AND CURRENT_DATE GROUP BY purchase_date
      ), returned AS (
        SELECT return_date AS day, SUM(total_amount) AS amount
        FROM purchase_returns WHERE return_date BETWEEN CURRENT_DATE - 29 AND CURRENT_DATE GROUP BY return_date
      )
      SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
        COALESCE(bought.amount, 0) - COALESCE(returned.amount, 0) AS total
      FROM days LEFT JOIN bought ON bought.day = days.day
      LEFT JOIN returned ON returned.day = days.day ORDER BY days.day`);
    const monthlyRevenue = await query(`
      WITH months AS (
        SELECT generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '11 months',
          date_trunc('month', CURRENT_DATE), '1 month'::interval)::date AS month
      ), sold AS (
        SELECT date_trunc('month', sale_date)::date AS month, SUM(grand_total) AS amount
        FROM sales WHERE status IN ('completed', 'returned')
          AND sale_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '11 months'
          AND sale_date <= CURRENT_DATE GROUP BY 1
      ), refunded AS (
        SELECT date_trunc('month', return_date)::date AS month, SUM(total_refund) AS amount
        FROM sale_returns WHERE return_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '11 months'
          AND return_date <= CURRENT_DATE GROUP BY 1
      )
      SELECT to_char(months.month, 'YYYY-MM') AS month,
        COALESCE(sold.amount, 0) - COALESCE(refunded.amount, 0) AS total
      FROM months LEFT JOIN sold ON sold.month = months.month
      LEFT JOIN refunded ON refunded.month = months.month ORDER BY months.month`);
    const topProducts = await query(`
      SELECT p.id, p.name, p.sku,
        SUM(si.quantity - COALESCE(returned_items.quantity, 0)) AS qty,
        SUM(si.line_total - COALESCE(returned_items.refund_amount, 0)) AS revenue
      FROM sale_items si JOIN products p ON si.product_id = p.id JOIN sales s ON si.sale_id = s.id
      LEFT JOIN (
        SELECT sale_item_id, SUM(quantity) AS quantity, SUM(refund_amount) AS refund_amount
        FROM sale_return_items GROUP BY sale_item_id
      ) returned_items ON returned_items.sale_item_id = si.id
      WHERE s.status IN ('completed', 'returned')
        AND s.sale_date BETWEEN CURRENT_DATE - 29 AND CURRENT_DATE
      GROUP BY p.id, p.name, p.sku
      HAVING SUM(si.quantity - COALESCE(returned_items.quantity, 0)) > 0
      ORDER BY qty DESC, p.name, p.id LIMIT 5`);
    const expenseBreakdown = await query(`
      SELECT ec.name, COALESCE(SUM(e.amount),0) as total
      FROM expenses e LEFT JOIN expense_categories ec ON e.category_id = ec.id
      WHERE e.expense_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY ec.name ORDER BY total DESC LIMIT 5`);

    res.json({
      salesTrend: salesTrend.rows.map(r => ({ date: r.date, total: parseFloat(r.total) })),
      purchaseTrend: purchaseTrend.rows.map(r => ({ date: r.date, total: parseFloat(r.total) })),
      monthlyRevenue: monthlyRevenue.rows.map(r => ({ month: r.month, total: parseFloat(r.total) })),
      topProducts: topProducts.rows.map(r => ({ name: r.name, sku: r.sku, qty: parseFloat(r.qty), revenue: parseFloat(r.revenue) })),
      expenseBreakdown: expenseBreakdown.rows.map(r => ({ name: r.name || 'Uncategorized', total: parseFloat(r.total) })),
    });
  } catch (err) { next(err); }
});

router.get('/recent-activity', authenticate, async (req, res, next) => {
  try {
    const recentSales = await query(`
      SELECT s.id, s.invoice_number, s.sale_date, s.grand_total, s.payment_status, c.name as customer_name
      FROM sales s JOIN customers c ON s.customer_id = c.id
      WHERE s.status = 'completed' ORDER BY s.created_at DESC LIMIT 5`);
    const recentPurchases = await query(`
      SELECT p.id, p.purchase_number, p.purchase_date, p.grand_total, p.payment_status, sup.name as supplier_name
      FROM purchases p JOIN suppliers sup ON p.supplier_id = sup.id
      WHERE p.status = 'received' ORDER BY p.created_at DESC LIMIT 5`);
    const lowStockProducts = await query(`
      SELECT id, name, sku, current_stock, min_stock_level, unit
      FROM products WHERE archived = FALSE AND current_stock <= min_stock_level
      ORDER BY current_stock ASC LIMIT 5`);
    const recentLogs = await query(`
      SELECT user_name, action, module, description, created_at
      FROM audit_logs ORDER BY created_at DESC LIMIT 8`);
    res.json({
      recentSales: recentSales.rows,
      recentPurchases: recentPurchases.rows,
      lowStockProducts: lowStockProducts.rows,
      recentLogs: recentLogs.rows,
    });
  } catch (err) { next(err); }
});

module.exports = router;
