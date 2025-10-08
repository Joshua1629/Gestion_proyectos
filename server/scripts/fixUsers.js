const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', '..', 'data', 'gestion_proyectos.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.all("SELECT id, nombre, email, usuario FROM usuarios", (err, rows) => {
    if (err) {
      console.error('Error leyendo usuarios:', err);
      process.exit(1);
    }

    const updates = [];
    rows.forEach(r => {
      if (!r.usuario) {
        let u = null;
        if (r.email) {
          u = r.email.split('@')[0];
        } else if (r.nombre) {
          u = r.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        }
        if (u) updates.push({ id: r.id, usuario: u });
      }
    });

    if (updates.length === 0) {
      console.log('No hay usuarios para actualizar.');
      db.close();
      return;
    }

    const stmt = db.prepare('UPDATE usuarios SET usuario = ? WHERE id = ?');
    updates.forEach(u => {
      stmt.run(u.usuario, u.id, (err) => {
        if (err) console.error('Error updating user', u.id, err);
        else console.log('Updated user', u.id, '->', u.usuario);
      });
    });
    stmt.finalize(() => db.close());
  });
});
