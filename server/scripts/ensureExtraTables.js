const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

function getDatabasePath() {
  if (process.env.NODE_ENV === "production") {
    const userDataPath = process.env.APPDATA || process.env.HOME || __dirname;
    const appDataDir = path.join(userDataPath, "GestionProyectos");
    if (!fs.existsSync(appDataDir))
      fs.mkdirSync(appDataDir, { recursive: true });
    return path.join(appDataDir, "gestion_proyectos.db");
  }
  const dataDir = path.join(__dirname, "..", "..", "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, "gestion_proyectos.db");
}

async function ensureExtraTables() {
  const dbPath = getDatabasePath();
  await new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);
      db.run("PRAGMA foreign_keys = ON");

      // Asegurar columnas en proyectos (cedula_juridica, fecha_verificacion, codigo)
      db.all("PRAGMA table_info(proyectos)", [], (e, rows) => {
        if (!e) {
          const hasCed =
            rows && rows.some((r) => r && r.name === "cedula_juridica");
          if (!hasCed) {
            db.run(
              "ALTER TABLE proyectos ADD COLUMN cedula_juridica TEXT",
              [],
              () => {}
            );
          }
          const hasFV =
            rows && rows.some((r) => r && r.name === "fecha_verificacion");
          if (!hasFV) {
            db.run(
              "ALTER TABLE proyectos ADD COLUMN fecha_verificacion DATE",
              [],
              () => {}
            );
          }
          const hasCodigo = rows && rows.some((r) => r && r.name === "codigo");
          if (!hasCodigo) {
            db.run(
              "ALTER TABLE proyectos ADD COLUMN codigo TEXT",
              [],
              () => {
                // Backfill: generar un código único para proyectos existentes
                const genCode = () =>
                  `PRJ-${Date.now().toString(36).toUpperCase()}-${Math.random()
                    .toString(36)
                    .slice(2, 6)
                    .toUpperCase()}`;
                db.all("SELECT id FROM proyectos", [], (eSel, pRows) => {
                  if (eSel || !Array.isArray(pRows) || pRows.length === 0)
                    return;
                  const stmt = db.prepare(
                    "UPDATE proyectos SET codigo = ? WHERE id = ?"
                  );
                  pRows.forEach((r) => {
                    try {
                      stmt.run([genCode(), r.id]);
                    } catch {}
                  });
                  stmt.finalize(() => {
                    db.run(
                      "CREATE UNIQUE INDEX IF NOT EXISTS idx_proyectos_codigo ON proyectos(codigo)"
                    );
                  });
                });
              }
            );
          } else {
            db.run(
              "CREATE UNIQUE INDEX IF NOT EXISTS idx_proyectos_codigo ON proyectos(codigo)"
            );
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
        // Asegurar columna de agrupación en evidencias para manejar grupos con múltiples fotos
        db.all("PRAGMA table_info(evidencias)", [], (e2, rows) => {
          if (e2) {
            // cerrar de todas formas
            return db.close(() => resolve());
          }
          const hasGroupKey = rows && rows.some((r) => r && r.name === 'group_key');
          const hasFileHash = rows && rows.some((r) => r && r.name === 'file_hash');
          const hasEvidenceType = rows && rows.some((r) => r && r.name === 'evidence_type');
          const ensureIndex = () => {
            db.run("CREATE INDEX IF NOT EXISTS idx_evidencias_group_key ON evidencias(group_key)", [], () => {
              db.run("CREATE INDEX IF NOT EXISTS idx_evidencias_file_hash ON evidencias(file_hash)");
              db.run("CREATE INDEX IF NOT EXISTS idx_evidencias_evidence_type ON evidencias(evidence_type)", [], () => db.close(() => resolve()));
            });
          };
          if (!hasGroupKey) {
            db.run("ALTER TABLE evidencias ADD COLUMN group_key TEXT", [], () => {
              // Backfill básico: calcular group_key como t{tarea_id||0}|{comentario_normalizado}
              db.all("SELECT id, tarea_id, comentario FROM evidencias WHERE group_key IS NULL OR group_key = ''", [], (e3, evRows) => {
                if (e3 || !Array.isArray(evRows) || evRows.length === 0) return ensureIndex();
                const norm = (s) => String(s || '')
                  .replace(/\^?\s*\[(INSTITUCION|PORTADA)\]\s*/gi, '')
                  .replace(/\s+/g, ' ')
                  .trim();
                const stmt = db.prepare("UPDATE evidencias SET group_key = ? WHERE id = ?");
                evRows.forEach((r) => {
                  try {
                    const key = `t${r.tarea_id || 0}|c${norm(r.comentario)}`;
                    stmt.run([key, r.id]);
                  } catch {}
                });
                stmt.finalize(() => ensureIndex());
              });
            });
          } else {
            // Asegurar columnas adicionales
            const doEnsureFileHash = (next) => {
              if (hasFileHash) return next();
              db.run("ALTER TABLE evidencias ADD COLUMN file_hash TEXT", [], () => next());
            };
            const doEnsureEvidenceType = (next) => {
              if (hasEvidenceType) return next();
              db.run("ALTER TABLE evidencias ADD COLUMN evidence_type TEXT DEFAULT 'GENERAL'", [], () => next());
            };
            doEnsureFileHash(() => doEnsureEvidenceType(() => ensureIndex()));
          }
        });
      });
    });
  });
}

module.exports = { ensureExtraTables };
