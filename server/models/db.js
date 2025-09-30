const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Determinar la ruta de la base de datos según el entorno
function getDatabasePath() {
  if (process.env.NODE_ENV === 'production') {
    // En producción, guardar la BD en la carpeta de datos del usuario
    const userDataPath = process.env.APPDATA || process.env.HOME || __dirname;
    const appDataDir = path.join(userDataPath, 'GestionProyectos');
    
    // Crear el directorio si no existe
    if (!fs.existsSync(appDataDir)) {
      fs.mkdirSync(appDataDir, { recursive: true });
    }
    
    return path.join(appDataDir, 'gestion_proyectos.db');
  } else {
    // En desarrollo, usar una ruta relativa
    return path.join(__dirname, '..', '..', 'data', 'gestion_proyectos.db');
  }
}

const dbPath = getDatabasePath();

// Crear el directorio de datos si no existe (para desarrollo)
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Crear conexión a SQLite
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error conectando a SQLite:', err.message);
  } else {
    console.log('Conectado a la base de datos SQLite:', dbPath);
    
    // Habilitar foreign keys
    db.run('PRAGMA foreign_keys = ON');
  }
});

// Wrapper para promesas (compatible con la API anterior de mysql2)
const dbWrapper = {
  query: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        db.all(sql, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve([rows, null]); // Formato compatible con mysql2
          }
        });
      } else {
        db.run(sql, params, function(err) {
          if (err) {
            reject(err);
          } else {
            resolve([{ insertId: this.lastID, affectedRows: this.changes }, null]);
          }
        });
      }
    });
  },
  
  execute: function(sql, params = []) {
    return this.query(sql, params);
  },
  
  // Método para obtener la instancia directa de SQLite si es necesario
  getDatabase: () => db
};

module.exports = dbWrapper;