const db = require('./db');
db.all("SELECT * FROM clients", (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    console.log(JSON.stringify(rows, null, 2));
  }
  process.exit();
});
