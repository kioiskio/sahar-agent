CREATE TABLE IF NOT EXISTS conversations (
  wa_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  area TEXT NOT NULL,
  price REAL NOT NULL CHECK (price >= 0),
  layout TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deposit_orders (
  id TEXT PRIMARY KEY,
  wa_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  paypal_order_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (wa_id) REFERENCES conversations (wa_id),
  FOREIGN KEY (listing_id) REFERENCES listings (id)
);
