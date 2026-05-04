process.env.TZ = 'Asia/Tashkent';
const express = require('express');
const cors = require('cors');
const db = require('./db');
const app = express();
const PORT = process.env.PORT || 3050;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- SERVICES API ---
app.get('/api/services', (req, res) => {
  db.all("SELECT *, COALESCE(active, 1) as active FROM services ORDER BY category, name", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/services', (req, res) => {
  const { name, category, price, icon, color, rgb, worker_name, active } = req.body;
  db.run(
    "INSERT INTO services (name, category, price, icon, color, rgb, worker_name, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [name, category, price, icon, color, rgb, worker_name || 'Xodim 1', active !== undefined ? active : 1],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, ...req.body });
    }
  );
});

app.put('/api/services/:id', (req, res) => {
  const { id } = req.params;
  const { name, category, price, icon, active, worker_name } = req.body;
  db.run(
    "UPDATE services SET name = ?, category = ?, price = ?, icon = ?, active = ?, worker_name = ? WHERE id = ?",
    [name, category, price, icon, active, worker_name, id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.delete('/api/services/:id', (req, res) => {
  db.run("DELETE FROM services WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// --- ORDERS API ---
app.post('/api/orders', (req, res) => {
  let { client_name, client_phone, total_amount, items, worker_name, service_name, note, status, payment_method } = req.body;

  if (!service_name && items && items.length) {
    service_name = items.map(i => i.name).join(', ');
    if (service_name.length > 50) service_name = service_name.substring(0, 47) + '...';
  }

  db.run(
    "INSERT INTO orders (client_name, client_phone, total_amount, worker_name, service_name, note, status, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [client_name, client_phone, total_amount, worker_name, service_name || 'Buyurtma', note, status || 'pending', payment_method || 'Karta'],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      const orderId = this.lastID;

      if (items && items.length) {
        const stmt = db.prepare("INSERT INTO order_items (order_id, service_id, service_name, price, quantity) VALUES (?, ?, ?, ?, ?)");
        items.forEach(item => {
          stmt.run([orderId, item.id, item.name, item.price, item.quantity]);
        });
        stmt.finalize();
      }

      res.json({ id: orderId, success: true });
    }
  );
});

app.delete('/api/orders/:id', (req, res) => {
  db.run("DELETE FROM orders WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.put('/api/orders/:id', (req, res) => {
  const { status } = req.body;
  db.run("UPDATE orders SET status = ? WHERE id = ?", [status, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/orders/:id/items', (req, res) => {
  db.all("SELECT * FROM order_items WHERE order_id = ?", [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/orders', (req, res) => {
  db.all("SELECT * FROM orders ORDER BY created_at DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- STATS API ---
app.get('/api/stats', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  db.get("SELECT SUM(total_amount) as total FROM orders WHERE date(created_at) = ?", [today], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ daily_revenue: row.total || 0 });
  });
});

// --- WORKERS API ---
app.get('/api/workers', (req, res) => {
  db.all("SELECT * FROM workers", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/workers', (req, res) => {
  const { name, role, phone, salary } = req.body;
  db.run("INSERT INTO workers (name, role, phone, salary) VALUES (?, ?, ?, ?)", [name, role, phone, salary], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, success: true });
  });
});

app.delete('/api/workers/:id', (req, res) => {
  db.run("DELETE FROM workers WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// --- ATTENDANCE API ---
app.get('/api/attendance', (req, res) => {
  db.all("SELECT * FROM attendance ORDER BY date DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({
      ...r,
      workerId: r.worker_id,
      workerName: r.worker_name,
      timeIn: r.time_in,
      timeOut: r.time_out
    })));
  });
});

app.post('/api/attendance', (req, res) => {
  const { workerId, workerName, status, timeIn, timeOut, date, note } = req.body;
  db.run(
    "INSERT INTO attendance (worker_id, worker_name, status, time_in, time_out, date, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [workerId, workerName, status, timeIn, timeOut, date, note],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, success: true });
    }
  );
});

app.delete('/api/attendance/:id', (req, res) => {
  db.run("DELETE FROM attendance WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// --- SALES API ---
app.get('/api/sales', (req, res) => {
  db.all("SELECT * FROM orders ORDER BY created_at DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/sales', (req, res) => {
  const { client, worker, amount, service, note, payment } = req.body;
  db.run(
    "INSERT INTO orders (client_name, total_amount, worker_name, service_name, note, status, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [client, amount, worker, service, note, 'done', payment || 'Karta'],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, success: true });
    }
  );
});

// --- EXPENSES API ---
app.get('/api/expenses', (req, res) => {
  db.all("SELECT * FROM expenses ORDER BY created_at DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/expenses', (req, res) => {
  const { category, amount, note } = req.body;
  db.run(
    "INSERT INTO expenses (category, amount, note) VALUES (?, ?, ?)",
    [category, amount, note],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, success: true });
    }
  );
});

// --- CLIENTS API ---
app.get('/api/clients', (req, res) => {
  db.all("SELECT * FROM clients ORDER BY created_at DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/clients', (req, res) => {
  const { name, phone, address, note, initial_orders_count, initial_total_sum } = req.body;
  if (!name) return res.status(400).json({ error: 'Ism kiritilmagan' });
  db.run(
    "INSERT INTO clients (name, phone, address, note, initial_orders_count, initial_total_sum) VALUES (?, ?, ?, ?, ?, ?)",
    [name, phone || '', address || '', note || '', initial_orders_count || 0, initial_total_sum || 0],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, success: true });
    }
  );
});

app.put('/api/clients/:id', (req, res) => {
  const { name, phone, address, note, initial_orders_count, initial_total_sum } = req.body;
  db.run(
    "UPDATE clients SET name=?, phone=?, address=?, note=?, initial_orders_count=?, initial_total_sum=? WHERE id=?",
    [name, phone || '', address || '', note || '', initial_orders_count || 0, initial_total_sum || 0, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.delete('/api/clients/:id', (req, res) => {
  db.run("DELETE FROM clients WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// --- EXPENSES DELETE ---
app.delete('/api/expenses/:id', (req, res) => {
  db.run("DELETE FROM expenses WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// --- SALARIES API ---
app.get('/api/salaries', (req, res) => {
  db.all("SELECT * FROM salary_payments", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/salaries', (req, res) => {
  const { worker_id, amount, month, worker_name } = req.body;
  
  db.serialize(() => {
    // 1. Oylik to'lovini saqlash
    db.run(
      "INSERT INTO salary_payments (worker_id, amount, month) VALUES (?, ?, ?)",
      [worker_id, amount, month],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        // 2. Harajatlarga (expenses) ham qo'shish
        db.run(
          "INSERT INTO expenses (category, amount, note) VALUES (?, ?, ?)",
          ['Oylik', amount, `${worker_name} uchun ${month} oyligi`],
          (err2) => {
            if (err2) console.error("Expense error:", err2.message);
            res.json({ id: this.lastID, success: true });
          }
        );
      }
    );
  });
});

app.listen(PORT, () => {
  console.log(`Bonu Photo Server running on http://localhost:${PORT}`);
});