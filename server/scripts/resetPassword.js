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
    const { usuario, email, password } = parseArgs();
    if (!password) {
      console.error('Debe proporcionar --password');
      process.exit(1);
    }
    if (!usuario && !email) {
      console.error('Debe proporcionar --usuario o --email');
      process.exit(1);
    }
    const hash = await bcrypt.hash(String(password), 10);

    let where = '';
    let param = '';
    if (usuario) { where = 'usuario = ?'; param = usuario; }
    else { where = 'email = ?'; param = email; }

    const [res] = await pool.query(`UPDATE usuarios SET password = ? WHERE ${where}`, [hash, param]);
    console.log('Filas afectadas:', res.affectedRows);
    process.exit(0);
  } catch (err) {
    console.error('Error reseteando contraseña:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {};