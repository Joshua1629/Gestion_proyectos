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
              return;
            }
            
            console.log('Schema ejecutado correctamente. Creando usuarios por defecto...');
            
            // Crear usuarios por defecto (admin y usuario) si no existen
            const bcrypt = require('bcryptjs');
            const defaultPassword = 'admin123';
            
            bcrypt.hash(defaultPassword, 10, (hashErr, hash) => {
              if (hashErr) {
                console.error('Error generando hash:', hashErr.message);
                db.close();
                reject(hashErr);
                return;
              }
              
              // Verificar si ya existen usuarios
              db.all('SELECT usuario FROM usuarios', (checkErr, existingUsers) => {
                if (checkErr) {
                  console.error('Error verificando usuarios existentes:', checkErr.message);
                  db.close();
                  reject(checkErr);
                  return;
                }
                
                const existingUsernames = (existingUsers || []).map(u => u.usuario).filter(Boolean);
                const usersToCreate = [];
                
                // Verificar y preparar usuario admin
                if (!existingUsernames.includes('admin')) {
                  usersToCreate.push({
                    nombre: 'Administrador',
                    usuario: 'admin',
                    email: 'admin@ferma.com',
                    password: hash,
                    rol: 'admin'
                  });
                }
                
                // Crear hash para el usuario regular
                bcrypt.hash('usuario123', 10, (userHashErr, userHash) => {
                  if (userHashErr) {
                    console.error('Error generando hash para usuario:', userHashErr.message);
                    db.close();
                    reject(userHashErr);
                    return;
                  }
                  
                  // Verificar y preparar usuario regular
                  if (!existingUsernames.includes('usuario')) {
                    usersToCreate.push({
                      nombre: 'Usuario',
                      usuario: 'usuario',
                      email: 'usuario@ferma.com',
                      password: userHash,
                      rol: 'usuario'
                    });
                  }
                  
                  if (usersToCreate.length === 0) {
                    console.log('✅ Usuarios por defecto ya existen, omitiendo creación.');
                    db.close();
                    resolve(dbPath);
                    return;
                  }
                  
                  // Crear usuarios uno por uno
                  let created = 0;
                  const total = usersToCreate.length;
                  
                  usersToCreate.forEach((userData, index) => {
                    db.run(
                      'INSERT INTO usuarios (nombre, usuario, email, password, rol) VALUES (?, ?, ?, ?, ?)',
                      [userData.nombre, userData.usuario, userData.email, userData.password, userData.rol],
                      (insertErr) => {
                        if (insertErr) {
                          console.error(`Error creando usuario ${userData.usuario}:`, insertErr.message);
                        } else {
                          console.log(`✅ Usuario ${userData.rol} creado:`);
                          console.log(`   Usuario: ${userData.usuario}`);
                          console.log(`   Contraseña: ${userData.usuario === 'admin' ? 'admin123' : 'usuario123'}`);
                          console.log(`   Email: ${userData.email}`);
                          console.log(`   Rol: ${userData.rol}`);
                        }
                        
                        created++;
                        if (created === total) {
                          console.log('✅ Base de datos inicializada correctamente con usuarios por defecto.');
                          db.close();
                          resolve(dbPath);
                        }
                      }
                    );
                  });
                });
              });
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