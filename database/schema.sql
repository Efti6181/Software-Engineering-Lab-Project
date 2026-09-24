-- =====================================================================
-- Business Inventory Management System - PostgreSQL Schema
-- Execute this file in pgAdmin Query Tool against the business_inventory database
-- =====================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- ENUMS
-- =====================================================================
CREATE TYPE user_role AS ENUM ('admin', 'staff');
CREATE TYPE user_status AS ENUM ('active', 'inactive');
CREATE TYPE entity_status AS ENUM ('active', 'inactive');
CREATE TYPE stock_status AS ENUM ('in_stock', 'low_stock', 'out_of_stock');
CREATE TYPE purchase_status AS ENUM ('draft', 'ordered', 'received', 'cancelled');
CREATE TYPE payment_status AS ENUM ('paid', 'partial', 'unpaid');
CREATE TYPE sale_status AS ENUM ('completed', 'voided', 'returned');
CREATE TYPE payment_method AS ENUM ('cash', 'card', 'mobile_banking', 'bank_transfer', 'due', 'other');
CREATE TYPE movement_type AS ENUM (
  'purchase', 'sale', 'sale_return', 'purchase_return',
  'adjustment_in', 'adjustment_out', 'opening_stock', 'correction'
);
CREATE TYPE adjustment_reason AS ENUM ('damaged', 'lost', 'found', 'correction', 'opening_stock', 'other');
CREATE TYPE notification_type AS ENUM ('low_stock', 'out_of_stock', 'adjustment', 'large_due', 'supplier_due', 'info');
CREATE TYPE ref_type AS ENUM ('sale', 'purchase', 'sale_return', 'purchase_return', 'adjustment', 'opening_stock', 'payment');

-- =====================================================================
-- USERS
-- =====================================================================
CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(120) NOT NULL,
  email           VARCHAR(160) UNIQUE NOT NULL,
  phone           VARCHAR(40),
  password_hash   VARCHAR(255) NOT NULL,
  role            user_role NOT NULL DEFAULT 'staff',
  status          user_status NOT NULL DEFAULT 'active',
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);

-- =====================================================================
-- BUSINESS SETTINGS (single row)
-- =====================================================================
CREATE TABLE business_settings (
  id                    SERIAL PRIMARY KEY,
  business_name         VARCHAR(160) NOT NULL DEFAULT 'My Business',
  logo_url              TEXT,
  address               TEXT,
  phone                 VARCHAR(60),
  email                 VARCHAR(160),
  currency_symbol       VARCHAR(10) NOT NULL DEFAULT '৳',
  currency_code         VARCHAR(10) NOT NULL DEFAULT 'BDT',
  default_tax_percent   NUMERIC(5,2) NOT NULL DEFAULT 0,
  invoice_prefix        VARCHAR(20) NOT NULL DEFAULT 'INV',
  invoice_footer        TEXT,
  default_low_stock_level INTEGER NOT NULL DEFAULT 5,
  allow_negative_stock  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            INTEGER REFERENCES users(id)
);

-- =====================================================================
-- CATEGORIES
-- =====================================================================
CREATE TABLE categories (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  description   TEXT,
  status        entity_status NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_categories_status ON categories(status);

-- =====================================================================
-- BRANDS
-- =====================================================================
CREATE TABLE brands (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  description   TEXT,
  status        entity_status NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_brands_status ON brands(status);

-- =====================================================================
-- SUPPLIERS
-- =====================================================================
CREATE TABLE suppliers (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(160) NOT NULL,
  company_name  VARCHAR(160),
  phone         VARCHAR(60),
  email         VARCHAR(160),
  address       TEXT,
  notes         TEXT,
  status        entity_status NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_suppliers_status ON suppliers(status);

-- =====================================================================
-- PRODUCTS
-- =====================================================================
CREATE TABLE products (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(200) NOT NULL,
  sku                 VARCHAR(80) UNIQUE NOT NULL,
  barcode             VARCHAR(80) UNIQUE,
  category_id         INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
  brand_id            INTEGER REFERENCES brands(id) ON DELETE SET NULL,
  description         TEXT,
  purchase_price      NUMERIC(14,2) NOT NULL DEFAULT 0,
  selling_price       NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_stock       NUMERIC(14,2) NOT NULL DEFAULT 0,
  min_stock_level     INTEGER NOT NULL DEFAULT 5,
  unit                VARCHAR(30) NOT NULL DEFAULT 'pcs',
  preferred_supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  image_url           TEXT,
  status              entity_status NOT NULL DEFAULT 'active',
  archived            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_archived ON products(archived);
CREATE INDEX idx_products_name ON products(name);

-- =====================================================================
-- STOCK MOVEMENTS (audit trail for every stock change)
-- =====================================================================
CREATE TABLE stock_movements (
  id              SERIAL PRIMARY KEY,
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  movement_type   movement_type NOT NULL,
  quantity        NUMERIC(14,2) NOT NULL, -- positive=in, negative=out
  previous_stock  NUMERIC(14,2) NOT NULL,
  new_stock       NUMERIC(14,2) NOT NULL,
  ref_type        ref_type,
  ref_id          INTEGER,
  notes           TEXT,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_type ON stock_movements(movement_type);
CREATE INDEX idx_stock_movements_ref ON stock_movements(ref_type, ref_id);
CREATE INDEX idx_stock_movements_created ON stock_movements(created_at);

-- =====================================================================
-- INVENTORY ADJUSTMENTS
-- =====================================================================
CREATE TABLE inventory_adjustments (
  id              SERIAL PRIMARY KEY,
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  reason          adjustment_reason NOT NULL,
  quantity_change NUMERIC(14,2) NOT NULL, -- positive=in, negative=out
  previous_stock  NUMERIC(14,2) NOT NULL,
  new_stock       NUMERIC(14,2) NOT NULL,
  notes           TEXT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inventory_adjustments_product ON inventory_adjustments(product_id);

-- =====================================================================
-- CUSTOMERS
-- =====================================================================
CREATE TABLE customers (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(160) NOT NULL,
  phone         VARCHAR(60),
  email         VARCHAR(160),
  address       TEXT,
  notes         TEXT,
  is_walk_in    BOOLEAN NOT NULL DEFAULT FALSE,
  status        entity_status NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_status ON customers(status);

-- =====================================================================
-- PURCHASES
-- =====================================================================
CREATE TABLE purchases (
  id                SERIAL PRIMARY KEY,
  purchase_number   VARCHAR(40) UNIQUE NOT NULL,
  supplier_id       INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  purchase_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal          NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  additional_cost   NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total       NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  due_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  status            purchase_status NOT NULL DEFAULT 'draft',
  payment_status    payment_status NOT NULL DEFAULT 'unpaid',
  notes             TEXT,
  created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX idx_purchases_status ON purchases(status);
CREATE INDEX idx_purchases_date ON purchases(purchase_date);

CREATE TABLE purchase_items (
  id              SERIAL PRIMARY KEY,
  purchase_id     INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity        NUMERIC(14,2) NOT NULL,
  unit_cost       NUMERIC(14,2) NOT NULL,
  item_discount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total      NUMERIC(14,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX idx_purchase_items_product ON purchase_items(product_id);

-- =====================================================================
-- SALES
-- =====================================================================
CREATE TABLE sales (
  id                SERIAL PRIMARY KEY,
  invoice_number    VARCHAR(40) UNIQUE NOT NULL,
  customer_id       INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  sale_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal          NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  delivery_charge   NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total       NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  due_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  status           sale_status NOT NULL DEFAULT 'completed',
  payment_status    payment_status NOT NULL DEFAULT 'unpaid',
  payment_method    payment_method,
  cashier_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sales_customer ON sales(customer_id);
CREATE INDEX idx_sales_status ON sales(status);
CREATE INDEX idx_sales_date ON sales(sale_date);
CREATE INDEX idx_sales_cashier ON sales(cashier_id);

CREATE TABLE sale_items (
  id              SERIAL PRIMARY KEY,
  sale_id          INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity         NUMERIC(14,2) NOT NULL,
  unit_price       NUMERIC(14,2) NOT NULL,
  unit_cost        NUMERIC(14,2) NOT NULL DEFAULT 0,
  item_discount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total       NUMERIC(14,2) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);

-- =====================================================================
-- SALE RETURNS
-- =====================================================================
CREATE TABLE sale_returns (
  id                SERIAL PRIMARY KEY,
  return_number     VARCHAR(40) UNIQUE NOT NULL,
  sale_id           INTEGER NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  customer_id       INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  return_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  total_refund      NUMERIC(14,2) NOT NULL DEFAULT 0,
  reason            TEXT,
  restock           BOOLEAN NOT NULL DEFAULT TRUE,
  processed_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sale_returns_sale ON sale_returns(sale_id);

CREATE TABLE sale_return_items (
  id                SERIAL PRIMARY KEY,
  sale_return_id    INTEGER NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  sale_item_id      INTEGER NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
  product_id        INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity          NUMERIC(14,2) NOT NULL,
  refund_amount     NUMERIC(14,2) NOT NULL,
  reason            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sale_return_items_return ON sale_return_items(sale_return_id);

-- =====================================================================
-- PURCHASE RETURNS
-- =====================================================================
CREATE TABLE purchase_returns (
  id                SERIAL PRIMARY KEY,
  return_number     VARCHAR(40) UNIQUE NOT NULL,
  purchase_id       INTEGER NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  supplier_id       INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  return_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  reason            TEXT,
  processed_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_purchase_returns_purchase ON purchase_returns(purchase_id);

CREATE TABLE purchase_return_items (
  id                  SERIAL PRIMARY KEY,
  purchase_return_id  INTEGER NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  purchase_item_id    INTEGER NOT NULL REFERENCES purchase_items(id) ON DELETE RESTRICT,
  product_id          INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity            NUMERIC(14,2) NOT NULL,
  refund_amount       NUMERIC(14,2) NOT NULL,
  reason              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_purchase_return_items_return ON purchase_return_items(purchase_return_id);

-- =====================================================================
-- EXPENSE CATEGORIES + EXPENSES
-- =====================================================================
CREATE TABLE expense_categories (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE expenses (
  id                SERIAL PRIMARY KEY,
  expense_number    VARCHAR(40) UNIQUE NOT NULL,
  category_id       INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
  amount            NUMERIC(14,2) NOT NULL,
  expense_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method    payment_method NOT NULL DEFAULT 'cash',
  description       TEXT,
  created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category_id);

-- =====================================================================
-- PAYMENTS (customer + supplier payments)
-- =====================================================================
CREATE TABLE payments (
  id                SERIAL PRIMARY KEY,
  payment_number    VARCHAR(40) UNIQUE NOT NULL,
  party_type        VARCHAR(20) NOT NULL CHECK (party_type IN ('customer','supplier')),
  party_id          INTEGER NOT NULL,
  ref_type          ref_type,
  ref_id            INTEGER,
  amount            NUMERIC(14,2) NOT NULL,
  payment_method    payment_method NOT NULL DEFAULT 'cash',
  reference         VARCHAR(120),
  notes             TEXT,
  user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  payment_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_party ON payments(party_type, party_id);
CREATE INDEX idx_payments_ref ON payments(ref_type, ref_id);
CREATE INDEX idx_payments_date ON payments(payment_date);

-- =====================================================================
-- NOTIFICATIONS
-- =====================================================================
CREATE TABLE notifications (
  id            SERIAL PRIMARY KEY,
  type          notification_type NOT NULL,
  title         VARCHAR(200) NOT NULL,
  message       TEXT,
  ref_type      VARCHAR(40),
  ref_id        INTEGER,
  is_read       BOOLEAN NOT NULL DEFAULT FALSE,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_user ON notifications(user_id);

-- =====================================================================
-- AUDIT LOGS
-- =====================================================================
CREATE TABLE audit_logs (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name     VARCHAR(120),
  action        VARCHAR(80) NOT NULL,
  module        VARCHAR(80) NOT NULL,
  entity_id     INTEGER,
  description   TEXT,
  ip_address    VARCHAR(60),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_module ON audit_logs(module);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- =====================================================================
-- UPDATED_AT TRIGGERS
-- =====================================================================
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp_users BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER set_timestamp_categories BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER set_timestamp_brands BEFORE UPDATE ON brands FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER set_timestamp_suppliers BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER set_timestamp_products BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER set_timestamp_purchases BEFORE UPDATE ON purchases FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER set_timestamp_sales BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER set_timestamp_customers BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER set_timestamp_business_settings BEFORE UPDATE ON business_settings FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- =====================================================================
-- SEED DATA
-- =====================================================================

-- Default business settings (single row)
INSERT INTO business_settings (business_name, address, phone, email, currency_symbol, currency_code, default_tax_percent, invoice_prefix, default_low_stock_level, allow_negative_stock)
VALUES ('My Business', '123 Main Street, Dhaka, Bangladesh', '+880 1234 567890', 'info@mybusiness.com', '৳', 'BDT', 0, 'INV', 5, FALSE);

-- Default admin user. Password = "admin123" (bcrypt hash generated for development only).
-- CHANGE THIS PASSWORD IMMEDIATELY after first login in a real deployment.
INSERT INTO users (name, email, phone, password_hash, role, status)
VALUES ('System Admin', 'admin@business.com', '+880 100000000', '$2a$10$lN/ZTRxebpEA3w70V9ixneR465Ug9xYZcLf.LzUKvaRQtyQY7gTWe', 'admin', 'active');

-- Default walk-in customer for POS
INSERT INTO customers (name, phone, is_walk_in, status)
VALUES ('Walk-in Customer', '', TRUE, 'active');

-- Default expense categories
INSERT INTO expense_categories (name, description) VALUES
('Rent', 'Office or shop rent'),
('Salary', 'Employee salaries'),
('Electricity', 'Electricity bills'),
('Internet', 'Internet bills'),
('Advertising', 'Marketing and advertising'),
('Courier', 'Courier and delivery charges'),
('Transportation', 'Transportation costs'),
('Office Expense', 'General office expenses'),
('Maintenance', 'Maintenance and repairs'),
('Other', 'Other expenses');

-- Default categories and brands for convenience
INSERT INTO categories (name, description) VALUES
('Electronics', 'Electronic products'),
('Groceries', 'Daily grocery items'),
('Stationery', 'Office and school stationery');

INSERT INTO brands (name, description) VALUES
('Generic', 'Generic / unbranded items'),
('Samsung', 'Samsung electronics'),
('Local', 'Local brands');

-- =====================================================================
-- END OF SCHEMA
-- =====================================================================
