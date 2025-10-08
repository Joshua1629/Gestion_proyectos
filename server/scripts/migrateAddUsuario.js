const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', '..', 'data', 'gestion_proyectos.db');
const db = new sqlite3.Database(dbPath);

function columnExists(columns, name) {
  return columns.some(c => c.name === name);
}

db.serialize(() => {
  db.all("PRAGMA table_info(usuarios)", (err, cols) => {
    if (err) {
      console.error('Error leyendo esquema usuarios:', err);
      process.exit(1);
    }

    if (!columnExists(cols, 'usuario')) {
      console.log('Agregando columna usuario a tabla usuarios...');
      db.run("ALTER TABLE usuarios ADD COLUMN usuario TEXT", (err) => {
        if (err) {
          console.error('Error agregando columna usuario:', err);
          process.exit(1);
        }

        // Llenar valores para usuarios sin valor
        db.all("SELECT id, nombre, email FROM usuarios", (err, rows) => {
          if (err) { console.error('Error leyendo usuarios:', err); process.exit(1); }
          const stmt = db.prepare('UPDATE usuarios SET usuario = ? WHERE id = ?');
          rows.forEach(r => {
            let u = null;
            if (r.email) u = r.email.split('@')[0];
            else if (r.nombre) u = r.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '_');
            if (u) {
              stmt.run(u, r.id, (err) => {
                if (err) console.error('Error actualizando usuario', r.id, err);
                else console.log('Usuario actualizado:', r.id, '->', u);
              });
            }
          });
          stmt.finalize(() => {
            // Crear índice si no existe
            db.run("CREATE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario)", (err) => {
              if (err) console.error('Error creando indice:', err);
              else console.log('Indice idx_usuarios_usuario creado o ya existía');
              db.close();
            });
          });
        });
      });
    } else {
      console.log('Columna usuario ya existe. Nada que hacer.');
      db.close();
    }
  });
});
