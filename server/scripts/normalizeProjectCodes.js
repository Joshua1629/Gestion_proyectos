const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const { getBaseDir, getDatabasePath } = require('../lib/userDataPath');

function parseYearSafe(d) {
  try {
    if (!d) return null;
    const date = new Date(String(d));
    if (isNaN(date.getTime())) return null;
    return date.getFullYear();
  } catch {
    return null;
  }
}

(async function normalize() {
  const baseDir = getBaseDir();
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  const dbPath = getDatabasePath();
  const db = new sqlite3.Database(dbPath);
  db.serialize(() => {
    db.run('PRAGMA foreign_keys = ON');
    db.run('BEGIN TRANSACTION');

    // Ensure column and unique index exist
    db.all('PRAGMA table_info(proyectos)', [], (e, rows) => {
      if (e) {
        console.error('Error leyendo schema:', e.message || e);
        db.run('ROLLBACK', () => db.close());
        return;
      }
      const hasCodigo = rows && rows.some((r) => r && r.name === 'codigo');
      const ensureIndex = () => {
        db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_proyectos_codigo ON proyectos(codigo)');
      };
      const proceed = () => {
        // Read all projects
        db.all('SELECT id, nombre, fecha_inicio, fecha_fin FROM proyectos ORDER BY id ASC', [], (err, proyectos) => {
          if (err) {
            console.error('Error leyendo proyectos:', err.message || err);
            db.run('ROLLBACK', () => db.close());
            return;
          }
          if (!Array.isArray(proyectos) || proyectos.length === 0) {
            console.log('No hay proyectos para normalizar.');
            db.run('COMMIT', () => db.close());
            return;
          }

          const byYearCounter = new Map();
          const updates = [];
          const currentYear = new Date().getFullYear();

          for (const p of proyectos) {
            const yStart = parseYearSafe(p.fecha_inicio);
            const yEnd = parseYearSafe(p.fecha_fin);
            const year = yStart ?? yEnd ?? currentYear;
            const count = (byYearCounter.get(year) || 0) + 1;
            byYearCounter.set(year, count);
            const codigo = `PROY-${year}-${String(count).padStart(4, '0')}`;
            updates.push({ id: p.id, codigo });
          }

          const stmt = db.prepare('UPDATE proyectos SET codigo = ? WHERE id = ?');
          for (const u of updates) {
            stmt.run([u.codigo, u.id]);
          }
          stmt.finalize((finErr) => {
            if (finErr) {
              console.error('Error aplicando actualizaciones:', finErr.message || finErr);
              db.run('ROLLBACK', () => db.close());
              return;
            }
            console.log('Códigos normalizados a formato PROY-YYYY-####');
            db.run('COMMIT', () => db.close());
          });
        });
      };

      if (!hasCodigo) {
        db.run('ALTER TABLE proyectos ADD COLUMN codigo TEXT', [], (alterErr) => {
          if (alterErr) {
            console.error('Error agregando columna codigo:', alterErr.message || alterErr);
            db.run('ROLLBACK', () => db.close());
            return;
          }
          ensureIndex();
          proceed();
        });
      } else {
        ensureIndex();
        proceed();
      }
    });
  });
})();
