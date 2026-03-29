-- ============================================================
-- Hospital Instrument Inventory Management System
-- SQLite Schema v2 — Full normalized schema with loan tracking
-- ============================================================

-- ============================================================
-- TABLE: categories
-- Master list of instrument categories (e.g. 刀柄類, 鑷子類)
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    name_en     TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- TABLE: staff                                   [REQ 1]
-- Registered personnel who can perform transactions.
-- Never hard-deleted — deactivate instead to preserve history.
-- ============================================================
CREATE TABLE IF NOT EXISTS staff (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL UNIQUE,
    role             TEXT,                        -- optional: e.g. '護理師', '技術員'
    is_active        INTEGER NOT NULL DEFAULT 1,  -- 1=active, 0=inactive
    created_at       TEXT DEFAULT (datetime('now')),
    deactivated_at   TEXT                         -- set when is_active → 0
);

-- ============================================================
-- TABLE: instruments                             [REQ 2]
-- Master catalog of surgical instruments (one row per SKU).
-- Soft-delete via is_active; name+category pair stays unique
-- even among inactive SKUs to prevent accidental re-creation.
-- ============================================================
CREATE TABLE IF NOT EXISTS instruments (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id          INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name                 TEXT NOT NULL,
    stock_quantity       INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    low_stock_threshold  INTEGER NOT NULL DEFAULT 2,
    notes                TEXT,
    is_active            INTEGER NOT NULL DEFAULT 1,  -- 1=active, 0=inactive SKU
    created_at           TEXT DEFAULT (datetime('now')),
    updated_at           TEXT DEFAULT (datetime('now')),
    deactivated_at       TEXT,
    UNIQUE (category_id, name)
);

-- ============================================================
-- TABLE: transactions
-- Append-only ledger of every stock movement (入庫/出庫).
-- loan_id links a transaction back to the loan it created or
-- closed; NULL for non-loan movements (e.g. bulk stock-in).
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    instrument_id    INTEGER NOT NULL REFERENCES instruments(id) ON DELETE RESTRICT,
    movement_type    TEXT NOT NULL CHECK (movement_type IN ('入庫', '出庫')),
    quantity         INTEGER NOT NULL CHECK (quantity > 0),
    staff_id         INTEGER REFERENCES staff(id) ON DELETE SET NULL,
    loan_id          INTEGER REFERENCES loans(id),  -- [REQ 3] FK to loans
    transaction_date TEXT NOT NULL DEFAULT (date('now')),
    notes            TEXT,
    created_at       TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- TABLE: loans                                   [REQ 3]
-- Tracks individual borrow-and-return cycles for a single
-- instrument unit issued to a named staff member.
-- A loan is "open" (unreturned) when returned_at IS NULL.
-- ============================================================
CREATE TABLE IF NOT EXISTS loans (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    instrument_id       INTEGER NOT NULL REFERENCES instruments(id) ON DELETE RESTRICT,
    staff_id            INTEGER NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
    quantity            INTEGER NOT NULL CHECK (quantity > 0),
    out_transaction_id  INTEGER NOT NULL REFERENCES transactions(id),
    issued_date         TEXT NOT NULL DEFAULT (date('now')),
    in_transaction_id   INTEGER REFERENCES transactions(id),  -- NULL = not yet returned
    returned_date       TEXT,                                  -- NULL = not yet returned
    notes               TEXT
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_instruments_category    ON instruments(category_id);
CREATE INDEX IF NOT EXISTS idx_instruments_stock       ON instruments(stock_quantity);
CREATE INDEX IF NOT EXISTS idx_instruments_active      ON instruments(is_active);
CREATE INDEX IF NOT EXISTS idx_transactions_instrument ON transactions(instrument_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date       ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_staff      ON transactions(staff_id);
CREATE INDEX IF NOT EXISTS idx_transactions_loan       ON transactions(loan_id);
CREATE INDEX IF NOT EXISTS idx_loans_staff             ON loans(staff_id);
CREATE INDEX IF NOT EXISTS idx_loans_instrument        ON loans(instrument_id);
CREATE INDEX IF NOT EXISTS idx_loans_open              ON loans(returned_date) WHERE returned_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_staff_active            ON staff(is_active);

-- ============================================================
-- VIEW: v_inventory_summary
-- Main grid data — one row per instrument with status
-- ============================================================
CREATE VIEW IF NOT EXISTS v_inventory_summary AS
SELECT
    i.id,
    c.name        AS category,
    i.name        AS instrument_name,
    i.stock_quantity,
    i.low_stock_threshold,
    i.is_active,
    CASE WHEN i.is_active = 0              THEN 'inactive'
         WHEN i.stock_quantity = 0         THEN 'out_of_stock'
         WHEN i.stock_quantity <= i.low_stock_threshold THEN 'low_stock'
         ELSE 'ok'
    END           AS stock_status,
    i.notes,
    i.updated_at
FROM instruments i
JOIN categories c ON c.id = i.category_id;

-- ============================================================
-- VIEW: v_transaction_log
-- Full ledger with human-readable names
-- ============================================================
CREATE VIEW IF NOT EXISTS v_transaction_log AS
SELECT
    t.id,
    t.transaction_date,
    c.name        AS category,
    i.name        AS instrument_name,
    t.movement_type,
    t.quantity,
    s.name        AS staff_name,
    t.loan_id,
    t.notes,
    t.created_at
FROM transactions t
JOIN  instruments i ON i.id = t.instrument_id
JOIN  categories  c ON c.id = i.category_id
LEFT JOIN staff   s ON s.id = t.staff_id
ORDER BY t.id DESC;

-- ============================================================
-- VIEW: v_unreturned_loans                        [REQ 3]
-- Every open loan — instruments issued but not yet returned.
-- ============================================================
CREATE VIEW IF NOT EXISTS v_unreturned_loans AS
SELECT
    l.id               AS loan_id,
    s.id               AS staff_id,
    s.name             AS staff_name,
    c.name             AS category,
    i.id               AS instrument_id,
    i.name             AS instrument_name,
    l.quantity,
    l.issued_date,
    CAST(
        julianday('now') - julianday(l.issued_date)
    AS INTEGER)        AS days_outstanding,
    l.notes
FROM loans     l
JOIN staff       s ON s.id = l.staff_id
JOIN instruments i ON i.id = l.instrument_id
JOIN categories  c ON c.id = i.category_id
WHERE l.returned_date IS NULL
ORDER BY l.issued_date ASC;

-- ============================================================
-- VIEW: v_staff_outbound_history                  [REQ 4]
-- All 出庫 transactions grouped with loan return status.
-- ============================================================
CREATE VIEW IF NOT EXISTS v_staff_outbound_history AS
SELECT
    s.id               AS staff_id,
    s.name             AS staff_name,
    l.id               AS loan_id,
    l.issued_date,
    l.returned_date,
    CASE WHEN l.returned_date IS NULL THEN '未歸還'
         ELSE '已歸還'
    END                AS return_status,
    c.name             AS category,
    i.name             AS instrument_name,
    l.quantity,
    CAST(
        julianday(COALESCE(l.returned_date, date('now')))
        - julianday(l.issued_date)
    AS INTEGER)        AS days_held,
    l.notes
FROM loans     l
JOIN staff       s ON s.id = l.staff_id
JOIN instruments i ON i.id = l.instrument_id
JOIN categories  c ON c.id = i.category_id
ORDER BY s.name ASC, l.issued_date DESC;
