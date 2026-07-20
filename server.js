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
  db.all("SELECT *, datetime(created_at, '+5 hours') as created_at, COALESCE(active, 1) as active FROM services ORDER BY category, name", (err, rows) => {
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
  console.log('Incoming order:', req.body);
  let { client_name, client_phone, total_amount, items, worker_name, worker_group, service_name, note, status, payment_method } = req.body;

  if (!service_name && items && items.length) {
    service_name = items.map(i => i.name).join(', ');
    if (service_name.length > 50) service_name = service_name.substring(0, 47) + '...';
  }

  if (client_name === 'Staff Order') status = 'done';

  db.run(
    "INSERT INTO orders (client_name, client_phone, total_amount, worker_name, worker_group, service_name, note, status, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [client_name, client_phone, total_amount, worker_name, worker_group, service_name || 'Buyurtma', note, status || 'pending', payment_method || 'Karta'],
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
  db.all("SELECT *, datetime(created_at, '+5 hours') as created_at FROM orders ORDER BY created_at DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- STATS API ---
app.get('/api/stats', (req, res) => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
  db.get("SELECT SUM(total_amount) as total FROM orders WHERE date(created_at, '+5 hours') = ?", [today], (err, row) => {
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
  const finalDate = date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
  db.run(
    "INSERT INTO attendance (worker_id, worker_name, status, time_in, time_out, date, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [workerId, workerName, status, timeIn, timeOut, finalDate, note],
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
  db.all("SELECT *, datetime(created_at, '+5 hours') as created_at FROM orders ORDER BY created_at DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/sales', (req, res) => {
  const { client, worker, group, amount, service, note, payment } = req.body;
  db.run(
    "INSERT INTO orders (client_name, total_amount, worker_name, worker_group, service_name, note, status, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [client, amount, worker, group, service, note, 'done', payment || 'Karta'],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, success: true });
    }
  );
});

// --- EXPENSES API ---
app.get('/api/expenses', (req, res) => {
  db.all("SELECT *, datetime(created_at, '+5 hours') as created_at FROM expenses ORDER BY created_at DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/expenses', (req, res) => {
  const { category, amount, note, worker_name } = req.body;
  db.run(
    "INSERT INTO expenses (category, amount, note, worker_name) VALUES (?, ?, ?, ?)",
    [category, amount, note, worker_name || 'Admin'],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, success: true });
    }
  );
});

// --- CLIENTS API ---
app.get('/api/clients', (req, res) => {
  db.all("SELECT *, datetime(created_at, '+5 hours') as created_at FROM clients ORDER BY created_at DESC", (err, rows) => {
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
  db.all(
    "SELECT sp.*, COALESCE(sp.worker_name, w.name, '—') as worker_name, datetime(sp.paid_at, '+5 hours') as paid_at_formatted FROM salary_payments sp LEFT JOIN workers w ON sp.worker_id = w.id ORDER BY sp.paid_at DESC, sp.id DESC",
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows.map(r => ({
        ...r,
        paid_at: r.paid_at_formatted || r.paid_at
      })));
    }
  );
});

app.post('/api/salaries', (req, res) => {
  const { worker_id, worker_name, amount, month, paid_at, note, mark_closed } = req.body;
  const numAmount = parseInt(amount) || 0;
  
  db.serialize(() => {
    let sql = "INSERT INTO salary_payments (worker_id, worker_name, amount, month, note) VALUES (?, ?, ?, ?, ?)";
    let params = [worker_id, worker_name, numAmount, month, note || ''];

    if (paid_at) {
      sql = "INSERT INTO salary_payments (worker_id, worker_name, amount, month, note, paid_at) VALUES (?, ?, ?, ?, ?, ?)";
      const timePart = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Tashkent' });
      params = [worker_id, worker_name, numAmount, month, note || '', `${paid_at} ${timePart}`];
    }

    db.run(sql, params, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const salaryId = this.lastID;
      
      const expNote = `${worker_name} uchun ${month} oyligi` + (note ? ` (${note})` : '');
      db.run(
        "INSERT INTO expenses (category, amount, note, worker_name) VALUES (?, ?, ?, ?)",
        ['Oylik', numAmount, expNote, worker_name || 'Admin'],
        (err2) => {
          if (err2) console.error("Expense error:", err2.message);

          if (mark_closed) {
            db.run(
              "INSERT OR REPLACE INTO salary_closures (worker_id, month) VALUES (?, ?)",
              [worker_id, month],
              () => res.json({ id: salaryId, success: true })
            );
          } else {
            res.json({ id: salaryId, success: true });
          }
        }
      );
    });
  });
});

app.delete('/api/salaries/:id', (req, res) => {
  db.run("DELETE FROM salary_payments WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// --- SALARY CLOSURES API ---
app.get('/api/salaries/closures', (req, res) => {
  db.all("SELECT * FROM salary_closures", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/salaries/close', (req, res) => {
  const { worker_id, month } = req.body;
  db.run("INSERT OR REPLACE INTO salary_closures (worker_id, month) VALUES (?, ?)", [worker_id, month], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/salaries/unclose', (req, res) => {
  const { worker_id, month } = req.body;
  db.run("DELETE FROM salary_closures WHERE worker_id = ? AND month = ?", [worker_id, month], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// --- DEBTS API ---
app.get('/api/debts', (req, res) => {
  db.all("SELECT *, datetime(created_at, '+5 hours') as created_at FROM debts ORDER BY id DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/debts', (req, res) => {
  console.log('Debts POST Received:', req.body);
  const { client_name, client_phone, service_name, items_count, total_amount, paid_amount, debt_amount, worker_name, worker_group } = req.body;
  const numPaid = parseInt(paid_amount) || 0;

  db.serialize(() => {
    db.run(
      "INSERT INTO debts (client_name, client_phone, service_name, items_count, total_amount, paid_amount, debt_amount, worker_name, worker_group) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [client_name, client_phone, service_name, items_count, total_amount, numPaid, debt_amount, worker_name, worker_group],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const debtId = this.lastID;

        // If upfront payment was made (> 0), record it as a sale for today in orders table
        if (numPaid > 0) {
          const orderNote = `Katta buyurtma (Boshlang'ich to'lov) - ${client_name}`;
          const orderSvc = `${service_name || 'Katta buyurtma'} (${items_count || 1} ta)`;
          db.run(
            "INSERT INTO orders (client_name, client_phone, total_amount, worker_name, worker_group, service_name, note, status, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, 'done', 'Karta')",
            [client_name, client_phone || '', numPaid, worker_name || 'Admin', worker_group || worker_name || 'Admin', orderSvc, orderNote],
            (err2) => {
              if (err2) console.error("Error creating sales entry for upfront debt payment:", err2.message);
              res.json({ id: debtId, success: true });
            }
          );
        } else {
          res.json({ id: debtId, success: true });
        }
      }
    );
  });
});

app.patch('/api/debts/:id/pay', (req, res) => {
  const { amount } = req.body;
  const id = req.params.id;
  const payAmount = parseInt(amount) || 0;
  
  db.get("SELECT * FROM debts WHERE id = ?", [id], (err, row) => {
    if (err || !row) return res.status(500).json({ error: 'Topilmadi' });
    
    const newPaid = row.paid_amount + payAmount;
    const newDebt = row.total_amount - newPaid;
    
    db.serialize(() => {
      db.run(
        "UPDATE debts SET paid_amount = ?, debt_amount = ? WHERE id = ?",
        [newPaid, newDebt, id],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });

          // Record this debt repayment as a sale on the DAY IT WAS PAID in orders table
          if (payAmount > 0) {
            const orderNote = `Qarz to'lovi - ${row.client_name}`;
            const orderSvc = `${row.service_name || 'Katta buyurtma'} (Qarz to'lovi)`;
            db.run(
              "INSERT INTO orders (client_name, client_phone, total_amount, worker_name, worker_group, service_name, note, status, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, 'done', 'Karta')",
              [row.client_name, row.client_phone || '', payAmount, row.worker_name || 'Admin', row.worker_group || row.worker_name || 'Admin', orderSvc, orderNote],
              (err2) => {
                if (err2) console.error("Error creating sales entry for debt repayment:", err2.message);
                res.json({ success: true, newPaid, newDebt });
              }
            );
          } else {
            res.json({ success: true, newPaid, newDebt });
          }
        }
      );
    });
  });
});

app.delete('/api/debts/:id', (req, res) => {
  db.run("DELETE FROM debts WHERE id = ?", req.params.id, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});