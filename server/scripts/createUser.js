const bcrypt = require('bcryptjs');
const pool = require('../models/db');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

async function main() {
  try {
    const { nombre = 'Usuario', usuario, email, password, rol = 'usuario' } = parseArgs();

    if (!usuario && !email) {
      console.error('Debe proporcionar --usuario o --email');
      process.exit(1);
    }
    if (!password) {
      console.error('Debe proporcionar --password');
      process.exit(1);
    }
    if (!['admin', 'usuario'].includes(String(rol))) {
      console.error("Rol inválido. Use 'admin' o 'usuario'");
      process.exit(1);
    }

    const hash = await bcrypt.hash(String(password), 10);

    const [res] = await pool.query(
      'INSERT INTO usuarios (nombre, usuario, email, password, rol) VALUES (?, ?, ?, ?, ?)',
      [nombre, usuario || null, email || null, hash, rol]
    );

    console.log('Usuario creado con id:', res.insertId);
    process.exit(0);
  } catch (err) {
    console.error('Error creando usuario:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {};
