const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

async function initializeDatabase() {
  try {
    // Determinar la ruta del schema SQLite
    const schemaFile = path.join(__dirname, '..', '..', 'db', 'schema_sqlite.sql');
    
    if (!fs.existsSync(schemaFile)) {
      throw new Error(`No se encontró schema_sqlite.sql en: ${schemaFile}`);
    }

    const sql = fs.readFileSync(schemaFile, 'utf8');
    
    // Determinar la ruta de la base de datos según el entorno
    function getDatabasePath() {
      if (process.env.NODE_ENV === 'production') {
        const userDataPath = process.env.APPDATA || process.env.HOME || __dirname;
        const appDataDir = path.join(userDataPath, 'GestionProyectos');
        
        if (!fs.existsSync(appDataDir)) {
          fs.mkdirSync(appDataDir, { recursive: true });
        }
        
        return path.join(appDataDir, 'gestion_proyectos.db');
      } else {
        const dataDir = path.join(__dirname, '..', '..', 'data');
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        return path.join(dataDir, 'gestion_proyectos.db');
      }
    }

    const dbPath = getDatabasePath();
    
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Error conectando a SQLite:', err.message);
          reject(err);
          return;
        }

        console.log('Conectado a SQLite. Ejecutando schema...');
        
        // Habilitar foreign keys
        db.run('PRAGMA foreign_keys = ON', (err) => {
          if (err) {
            console.error('Error habilitando foreign keys:', err.message);
            reject(err);
            return;
          }

          // Ejecutar el schema completo
          db.exec(sql, (err) => {
            if (err) {
              console.error('Error ejecutando schema:', err.message);
              reject(err);
            } else {
              console.log('Base de datos inicializada correctamente.');
              resolve(dbPath);
            }
            
            db.close((closeErr) => {
              if (closeErr) {
                console.error('Error cerrando la base de datos:', closeErr.message);
              }
            });
          });
        });
      });
    });
    
  } catch (err) {
    console.error('Error inicializando base de datos:', err.message || err);
    throw err;
  }
}

// Función para verificar si la base de datos existe y tiene las tablas necesarias
async function checkDatabaseExists() {
  try {
    function getDatabasePath() {
      if (process.env.NODE_ENV === 'production') {
        const userDataPath = process.env.APPDATA || process.env.HOME || __dirname;
        const appDataDir = path.join(userDataPath, 'GestionProyectos');
        return path.join(appDataDir, 'gestion_proyectos.db');
      } else {
        return path.join(__dirname, '..', '..', 'data', 'gestion_proyectos.db');
      }
    }

    const dbPath = getDatabasePath();
    
    if (!fs.existsSync(dbPath)) {
      return false;
    }

    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          resolve(false);
          return;
        }

        // Verificar si existen las tablas principales
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'", (err, row) => {
          db.close();
          if (err || !row) {
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
    });
  } catch (err) {
    return false;
  }
}

// Si se ejecuta directamente
if (require.main === module) {
  initializeDatabase()
    .then((dbPath) => {
      console.log(`Base de datos creada en: ${dbPath}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error:', err.message || err);
      process.exit(1);
    });
}

module.exports = { initializeDatabase, checkDatabaseExists };