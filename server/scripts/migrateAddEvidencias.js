const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', '..', 'data', 'gestion_proyectos.db');

function run(db, sql) {
  return new Promise((resolve, reject) => db.run(sql, function (err) { err ? reject(err) : resolve(this); }));
}

(async () => {
  if (!fs.existsSync(dbPath)) {
    console.error('Base de datos no encontrada en', dbPath);
    process.exit(1);
  }
  const db = new sqlite3.Database(dbPath);

  try {
    await run(db, 'PRAGMA foreign_keys = ON');

    // Crear tabla evidencias si no existe
    await run(db, `CREATE TABLE IF NOT EXISTS evidencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proyecto_id INTEGER NOT NULL,
      tarea_id INTEGER,
      categoria TEXT NOT NULL CHECK (categoria IN ('OK','LEVE','CRITICO')),
      comentario TEXT,
      image_path TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,
      FOREIGN KEY (tarea_id) REFERENCES tareas(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES usuarios(id)
    )`);

    await run(db, `CREATE INDEX IF NOT EXISTS idx_evidencias_proyecto ON evidencias(proyecto_id)`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_evidencias_tarea ON evidencias(tarea_id)`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_evidencias_categoria ON evidencias(categoria)`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_evidencias_created_at ON evidencias(created_at)`);

    console.log('Migración evidencias aplicada.');
  } catch (err) {
    console.error('Error en migración evidencias:', err && err.message ? err.message : err);
    process.exit(1);
  } finally {
    db.close();
  }
})();
