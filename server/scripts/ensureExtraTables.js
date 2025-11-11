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

      // Asegurar columna cedula_juridica en proyectos
      db.all("PRAGMA table_info(proyectos)", [], (e, rows) => {
        if (!e) {
          const hasCed = rows && rows.some(r => r && r.name === 'cedula_juridica');
          if (!hasCed) {
            db.run("ALTER TABLE proyectos ADD COLUMN cedula_juridica TEXT", [], () => {});
          }
          const hasFV = rows && rows.some(r => r && r.name === 'fecha_verificacion');
          if (!hasFV) {
            db.run("ALTER TABLE proyectos ADD COLUMN fecha_verificacion DATE", [], () => {});
          }
        }
      });

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

      -- Repositorio de normas/Incumplimientos (catálogo desde Excel)
      CREATE TABLE IF NOT EXISTS normas_repo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT,
        titulo TEXT NOT NULL,
        descripcion TEXT,
        categoria TEXT,
        subcategoria TEXT,
        incumplimiento TEXT,
        severidad TEXT,
        etiquetas TEXT,
        fuente TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_normasrepo_titulo ON normas_repo(titulo);
      CREATE INDEX IF NOT EXISTS idx_normasrepo_codigo ON normas_repo(codigo);
      CREATE INDEX IF NOT EXISTS idx_normasrepo_categoria ON normas_repo(categoria);

      -- Evidencias asociadas a elementos del repositorio de normas
      CREATE TABLE IF NOT EXISTS normas_repo_evidencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        norma_repo_id INTEGER NOT NULL,
        comentario TEXT,
        image_path TEXT NOT NULL,
        thumb_path TEXT,
        mime_type TEXT,
        size_bytes INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME,
        FOREIGN KEY (norma_repo_id) REFERENCES normas_repo(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_nre_norma ON normas_repo_evidencias(norma_repo_id);

      -- Relación entre evidencias del proyecto y elementos del repositorio de normas
      CREATE TABLE IF NOT EXISTS evidencias_normas_repo (
        evidencia_id INTEGER NOT NULL,
        norma_repo_id INTEGER NOT NULL,
        clasificacion TEXT DEFAULT 'LEVE' CHECK (clasificacion IN ('OK','LEVE','CRITICO')),
        observacion TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME,
        PRIMARY KEY (evidencia_id, norma_repo_id),
        FOREIGN KEY (evidencia_id) REFERENCES evidencias(id) ON DELETE CASCADE,
        FOREIGN KEY (norma_repo_id) REFERENCES normas_repo(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_enr_evidencia ON evidencias_normas_repo(evidencia_id);
      CREATE INDEX IF NOT EXISTS idx_enr_norma ON evidencias_normas_repo(norma_repo_id);
      `;

      db.exec(ddl, (e) => {
        if (e) return reject(e);
        db.close(() => resolve());
      });
    });
  });
}

module.exports = { ensureExtraTables };
