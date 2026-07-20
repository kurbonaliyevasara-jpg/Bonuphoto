const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Render platformasida /data papkasi bo'lsa o'sha yerga, bo'lmasa lokal papkaga saqlaydi
const dbDir = fs.existsSync('/data') ? '/data' : __dirname;
const dbPath = path.join(dbDir, 'bonuphoto.db');

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Services table
  db.run(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price INTEGER NOT NULL,
      icon TEXT,
      color TEXT,
      rgb TEXT,
      active INTEGER DEFAULT 1,
      worker_name TEXT DEFAULT 'all',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Orders table
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT,
      client_phone TEXT,
      total_amount INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      worker_name TEXT,
      worker_group TEXT,
      service_name TEXT,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Order Items table
  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      service_id INTEGER,
      service_name TEXT,
      price INTEGER,
      quantity INTEGER,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    )
  `);

  // Workers table
  db.run(`
    CREATE TABLE IF NOT EXISTS workers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT,
      phone TEXT,
      salary INTEGER,
      active INTEGER DEFAULT 1
    )
  `);

  // Expenses table
  db.run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      amount INTEGER NOT NULL,
      worker_name TEXT DEFAULT 'Admin',
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: expenses.worker_name ustuni qo'shish
  db.all("PRAGMA table_info(expenses)", (err, rows) => {
    if (err || !rows) return;
    const hasWorker = rows.some(r => r.name === 'worker_name');
    if (!hasWorker) db.run("ALTER TABLE expenses ADD COLUMN worker_name TEXT DEFAULT 'Admin'");
  });

  // Attendance table
  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER,
      worker_name TEXT,
      status TEXT,
      time_in TEXT,
      time_out TEXT,
      date DATE,
      note TEXT,
      FOREIGN KEY(worker_id) REFERENCES workers(id)
    )
  `);

  // Clients table
  db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      note TEXT,
      initial_orders_count INTEGER DEFAULT 0,
      initial_total_sum INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Salary Payments table
  db.run(`
    CREATE TABLE IF NOT EXISTS salary_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER,
      worker_name TEXT,
      amount INTEGER,
      month TEXT,
      note TEXT,
      paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(worker_id) REFERENCES workers(id)
    )
  `);

  // Salary Closures table
  db.run(`
    CREATE TABLE IF NOT EXISTS salary_closures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER,
      month TEXT,
      closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(worker_id, month)
    )
  `);

  // Migration for salary_payments table
  db.all("PRAGMA table_info(salary_payments)", (err, rows) => {
    if (err || !rows) return;
    const hasWorkerName = rows.some(r => r.name === 'worker_name');
    const hasNote = rows.some(r => r.name === 'note');
    if (!hasWorkerName) db.run("ALTER TABLE salary_payments ADD COLUMN worker_name TEXT");
    if (!hasNote) db.run("ALTER TABLE salary_payments ADD COLUMN note TEXT");
  });

  // Migration for existing clients table
  db.all("PRAGMA table_info(clients)", (err, rows) => {
    if (err || !rows) return;
    const hasInitialOrders = rows.some(r => r.name === 'initial_orders_count');
    const hasInitialSum = rows.some(r => r.name === 'initial_total_sum');
    if (!hasInitialOrders) db.run("ALTER TABLE clients ADD COLUMN initial_orders_count INTEGER DEFAULT 0");
    if (!hasInitialSum) db.run("ALTER TABLE clients ADD COLUMN initial_total_sum INTEGER DEFAULT 0");
  });

  // Migration: orders.payment_method ustuni qo'shish
  db.all("PRAGMA table_info(orders)", (err, rows) => {
    if (err || !rows) return;
    const hasPayment = rows.some(r => r.name === 'payment_method');
    const hasGroup = rows.some(r => r.name === 'worker_group');
    if (!hasPayment) db.run("ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT 'Karta'");
    if (!hasGroup) db.run("ALTER TABLE orders ADD COLUMN worker_group TEXT");
  });

  // Debts table
  db.run(`
    CREATE TABLE IF NOT EXISTS debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL,
      client_phone TEXT,
      service_name TEXT,
      items_count INTEGER,
      total_amount INTEGER NOT NULL,
      paid_amount INTEGER NOT NULL,
      debt_amount INTEGER NOT NULL,
      worker_name TEXT,
      worker_group TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.all("PRAGMA table_info(debts)", (err, rows) => {
    if (err || !rows) return;
    const hasService = rows.some(r => r.name === 'service_name');
    const hasPhone = rows.some(r => r.name === 'client_phone');
    const hasGroup = rows.some(r => r.name === 'worker_group');
    if (!hasService) db.run("ALTER TABLE debts ADD COLUMN service_name TEXT");
    if (!hasPhone) db.run("ALTER TABLE debts ADD COLUMN client_phone TEXT");
    if (!hasGroup) db.run("ALTER TABLE debts ADD COLUMN worker_group TEXT");
  });

  // Seed initial services if table is empty
  db.get("SELECT COUNT(*) as count FROM services", (err, row) => {
    if (row.count === 0) {
      const initialServices = [
        ["3x4 rasm (6 dona)", "hujjat", 10000, "👤", "#6366f1", "99, 102, 241"],
        ["Viza uchun rasm", "hujjat", 20000, "🛂", "#6366f1", "99, 102, 241"],
        ["10x15 (A6) rasm", "print", 2000, "🖼️", "#f43f5e", "244, 63, 94"],
        ["Kserokopiya (A4)", "ofis", 500, "📑", "#10b981", "16, 185, 129"],
        ["Video montaj", "design", 50000, "🎬", "#f59e0b", "245, 158, 11"],
        ["Ramka 10x15", "frame", 15000, "🔲", "#8b5cf6", "139, 92, 246"]
      ];

      const stmt = db.prepare("INSERT INTO services (name, category, price, icon, color, rgb) VALUES (?, ?, ?, ?, ?, ?)");
      initialServices.forEach(s => stmt.run(s));
      stmt.finalize();
      console.log('Initial services seeded.');
    }
  });
});

module.exports = db;