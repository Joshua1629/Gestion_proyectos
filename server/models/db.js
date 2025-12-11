// Manejar el require de sqlite3 con mejor manejo de errores
let sqlite3;
try {
  sqlite3 = require('sqlite3').verbose();
  console.log('✅ sqlite3 cargado correctamente');
} catch (error) {
  console.error('❌ ERROR CRÍTICO: No se pudo cargar sqlite3');
  console.error('❌ Error:', error.message);
  console.error('❌ Stack:', error.stack);
  console.error('❌ NODE_PATH:', process.env.NODE_PATH || '(no configurado)');
  console.error('❌ __dirname:', __dirname);
  console.error('❌ process.cwd():', process.cwd());
  
  // Intentar mostrar rutas donde Node.js busca módulos
  const Module = require('module');
  console.error('❌ Rutas de búsqueda de módulos:');
  if (Module._nodeModulePaths) {
    Module._nodeModulePaths(__dirname).forEach(p => console.error('   -', p));
  }
  
  throw new Error(`No se pudo cargar sqlite3: ${error.message}`);
}
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
            // Procesar las filas para asegurar que las fechas sean strings válidos
            const processedRows = rows.map(row => {
              const processedRow = { ...row };
              
              // Convertir campos de fecha a strings válidos o vacíos si son null
              ['fecha_limite', 'fecha_inicio', 'fecha_fin', 'fecha_verificacion'].forEach(dateField => {
                if (processedRow[dateField] !== undefined) {
                  if (processedRow[dateField] === null || processedRow[dateField] === undefined) {
                    // Devolver null para fechas no definidas (más semántico que cadena vacía)
                    processedRow[dateField] = null;
                  } else {
                    // Asegurar que sea un string válido en formato YYYY-MM-DD
                    const dateStr = String(processedRow[dateField]);
                    // Si viene como fecha ISO completa, extraer solo la parte de fecha
                    const isoMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
                    processedRow[dateField] = isoMatch ? isoMatch[1] : dateStr;
                  }
                }
              });
              
              // Convertir campos booleanos para compatibilidad
              ['completada', 'activo'].forEach(boolField => {
                if (processedRow[boolField] !== undefined) {
                  processedRow[boolField] = Boolean(processedRow[boolField]);
                }
              });
              
              return processedRow;
            });
            
            resolve([processedRows, null]); // Formato compatible con mysql2
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