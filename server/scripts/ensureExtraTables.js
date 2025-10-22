const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

function getDatabasePath() {
  if (process.env.NODE_ENV === 'production') {
    const userDataPath = process.env.APPDATA || process.env.HOME || __dirname;
    const appDataDir = path.join(userDataPath, 'GestionProyectos');
    if (!fs.existsSync(appDataDir)) fs.mkdirSync(appDataDir, { recursive: true });
    return path.join(appDataDir, 'gestion_proyectos.db');
  }
  const dataDir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'gestion_proyectos.db');
}

async function ensureExtraTables() {
  const dbPath = getDatabasePath();
  await new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);
      db.run('PRAGMA foreign_keys = ON');

      const ddl = `
      CREATE TABLE IF NOT EXISTS normas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT NOT NULL,
        descripcion TEXT,
        etiquetas TEXT,
        file_path TEXT NOT NULL,
        file_name TEXT,
        mime_type TEXT,
        size_bytes INTEGER,
        texto_extraido TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
      );
      CREATE TABLE IF NOT EXISTS proyecto_normas (
        proyecto_id INTEGER NOT NULL,
        norma_id INTEGER NOT NULL,
        PRIMARY KEY (proyecto_id, norma_id),
        FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,
        FOREIGN KEY (norma_id) REFERENCES normas(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS tarea_normas (
        tarea_id INTEGER NOT NULL,
        norma_id INTEGER NOT NULL,
        PRIMARY KEY (tarea_id, norma_id),
        FOREIGN KEY (tarea_id) REFERENCES tareas(id) ON DELETE CASCADE,
        FOREIGN KEY (norma_id) REFERENCES normas(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_normas_titulo ON normas(titulo);
      CREATE INDEX IF NOT EXISTS idx_normas_etiquetas ON normas(etiquetas);
      `;

      db.exec(ddl, (e) => {
        if (e) return reject(e);
        db.close(() => resolve());
      });
    });
  });
}

module.exports = { ensureExtraTables };
