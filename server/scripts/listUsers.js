const pool = require('../models/db');

(async () => {
  try {
    const [rows] = await pool.query('SELECT id, nombre, usuario, email, rol FROM usuarios ORDER BY id');
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('Error listing users:', e);
    process.exit(1);
  }
})();
