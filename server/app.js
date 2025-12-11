const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Importar funciones de inicialización de base de datos
const { initializeDatabase, checkDatabaseExists } = require('./scripts/initDb');
const { ensureExtraTables } = require('./scripts/ensureExtraTables');

const tryRequireRouter = (...parts) => {
  // En producción, las rutas están dentro del .asar junto con el código del servidor
  const candidates = [
    // Primero buscar relativamente desde __dirname (funciona en dev y prod)
    path.join(__dirname, ...parts),
    path.join(__dirname, ...parts) + '.js',
  ];

  for (const candidate of candidates) {
    try {
      // intentar cargar solo si el archivo existe o bien dejar que require haga la resolución
      if (fs.existsSync(candidate) || candidate.endsWith('.js')) {
        const mod = require(candidate);
        if (mod) return mod;
      }
    } catch (err) {
      // Mostrar el error completo para que puedas ver si hay un error de sintaxis o runtime dentro del router
      console.error(`Error cargando router desde "${candidate}":\n`, err && err.stack ? err.stack : err);
      // seguir probando otras rutas
    }
  }
  return null;
};

// Función async para inicializar la aplicación
async function initializeApp() {
  try {
    // Verificar si la base de datos existe, si no, crearla
    const dbExists = await checkDatabaseExists();
    if (!dbExists) {
      console.log('Base de datos no encontrada. Inicializando...');
      await initializeDatabase();
      console.log('Base de datos inicializada correctamente.');
    } else {
      console.log('Base de datos existente encontrada.');
      
      // Verificar si hay usuarios, si no, crear admin y usuario por defecto
      try {
        const pool = require('./models/db');
        const [users] = await pool.query('SELECT usuario FROM usuarios');
        const existingUsernames = (users || []).map(u => u.usuario).filter(Boolean);
        
        const bcrypt = require('bcryptjs');
        const usersToCreate = [];
        
        // Verificar y crear admin si no existe
        if (!existingUsernames.includes('admin')) {
          const adminHash = await bcrypt.hash('admin123', 10);
          usersToCreate.push({
            nombre: 'Administrador',
            usuario: 'admin',
            email: 'admin@ferma.com',
            password: adminHash,
            rol: 'admin'
          });
        }
        
        // Verificar y crear usuario regular si no existe
        if (!existingUsernames.includes('usuario')) {
          const userHash = await bcrypt.hash('usuario123', 10);
          usersToCreate.push({
            nombre: 'Usuario',
            usuario: 'usuario',
            email: 'usuario@ferma.com',
            password: userHash,
            rol: 'usuario'
          });
        }
        
        if (usersToCreate.length > 0) {
          console.log(`⚠️ No hay todos los usuarios necesarios. Creando ${usersToCreate.length} usuario(s) por defecto...`);
          
          for (const userData of usersToCreate) {
            await pool.query(
              'INSERT INTO usuarios (nombre, usuario, email, password, rol) VALUES (?, ?, ?, ?, ?)',
              [userData.nombre, userData.usuario, userData.email, userData.password, userData.rol]
            );
            console.log(`✅ Usuario ${userData.rol} creado:`);
            console.log(`   Usuario: ${userData.usuario}`);
            console.log(`   Contraseña: ${userData.usuario === 'admin' ? 'admin123' : 'usuario123'}`);
            console.log(`   Email: ${userData.email}`);
            console.log(`   Rol: ${userData.rol}`);
          }
        } else {
          console.log(`✅ Base de datos tiene usuarios existentes (${existingUsernames.length} usuario(s)).`);
        }
      } catch (userCheckErr) {
        console.warn('⚠️ No se pudo verificar/crear usuarios:', userCheckErr.message);
      }
    }

    // Intentar cargar desde varias rutas posibles (dev y empaquetado)
    let proyectosRouter = tryRequireRouter('routes', 'proyectos')
      || tryRequireRouter('models', 'routes', 'proyectos')
      || tryRequireRouter('server', 'routes', 'proyectos');

    let authRouter = tryRequireRouter('routes', 'auth')
      || tryRequireRouter('models', 'routes', 'auth')
      || tryRequireRouter('server', 'routes', 'auth');

    let tareasRouter = tryRequireRouter('routes', 'tareas')
      || tryRequireRouter('models', 'routes', 'tareas')
      || tryRequireRouter('server', 'routes', 'tareas');

    let evidenciasRouter = tryRequireRouter('routes', 'evidencias')
      || tryRequireRouter('models', 'routes', 'evidencias')
      || tryRequireRouter('server', 'routes', 'evidencias');

    let normasRouter = tryRequireRouter('routes', 'normas')
      || tryRequireRouter('models', 'routes', 'normas')
      || tryRequireRouter('server', 'routes', 'normas');

    let normasRepoRouter = tryRequireRouter('routes', 'normas_repo')
      || tryRequireRouter('models', 'routes', 'normas_repo')
      || tryRequireRouter('server', 'routes', 'normas_repo');

    let reportesRouter = tryRequireRouter('routes', 'reportes')
      || tryRequireRouter('models', 'routes', 'reportes')
      || tryRequireRouter('server', 'routes', 'reportes');

    // Si no se encuentran, crear router stub para evitar crash y dejar mensajes claros
    const createStub = (name) => {
      const r = express.Router();
      r.use((req, res) => res.status(503).json({ error: `${name} router not found on filesystem` }));
      return r;
    };

    if (!proyectosRouter) {
      console.warn('Warning: proyectos router not found. Using stub.');
      proyectosRouter = createStub('proyectos');
    }
    if (!authRouter) {
      console.warn('Warning: auth router not found. Using stub.');
      authRouter = createStub('auth');
    }
    if (!tareasRouter) {
      console.warn('Warning: tareas router not found. Using stub.');
      tareasRouter = createStub('tareas');
    }
    if (!evidenciasRouter) {
      console.warn('Warning: evidencias router not found. Using stub.');
      evidenciasRouter = createStub('evidencias');
    }
    if (!normasRouter) {
      console.warn('Warning: normas router not found. Using stub.');
      normasRouter = createStub('normas');
    }
    if (!normasRepoRouter) {
      console.warn('Warning: normas-repo router not found. Using stub.');
      normasRepoRouter = createStub('normas-repo');
    }
    if (!reportesRouter) {
      console.warn('Warning: reportes router not found. Using stub.');
      reportesRouter = createStub('reportes');
    }

    const app = express();

    // Configuración más específica de CORS
    app.use(cors({
      origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
      credentials: true,
      optionsSuccessStatus: 200
    }));
    
    // Middleware tolerante para JSON: captura rawBody y trata de parsear incluso si faltan comillas
    app.use((req, res, next) => {
      // solo procesar cuerpos con tipo JSON
      const ct = req.headers['content-type'] || '';
      if (!ct.includes('application/json')) return next();

      let data = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => {
        req.rawBody = data;
        if (!data) {
          req.body = {};
          return next();
        }

        try {
          req.body = JSON.parse(data);
          return next();
        } catch (err) {
          // Intentar corregir objetos estilo JS (sin comillas en claves/strings)
          function tolerantFix(s) {
            let t = s.trim();
            // Poner comillas en claves sin comillas: {key: -> {"key":
            t = t.replace(/([\{,\s])([A-Za-z0-9_]+)\s*:/g, '$1"$2":');
            // Poner comillas en valores que no esten entre comillas y no sean números, true, false o null
            t = t.replace(/:\s*([^"\d\{\[\]\},][^,\}\]]*)(?=[,\}])/g, (m, p1) => {
              const v = p1.trim();
              if (/^(true|false|null)$/i.test(v)) return ':' + v;
              if (/^[\d.+-eE]+$/.test(v)) return ':' + v; // number
              return ':"' + v.replace(/"/g, '\\"') + '"';
            });
            return t;
          }

          try {
            const fixed = tolerantFix(data);
            req.body = JSON.parse(fixed);
            console.warn('Parsed malformed JSON by tolerantFix. original=', data, 'fixed=', fixed);
            return next();
          } catch (err2) {
            // No se pudo parsear; devolver error de JSON mal formado
            console.error('JSON parse error original:', err && err.message, 'rawBody=', data);
            // pasar el error hacia el manejador global para que incluya rawBody
            const e = new SyntaxError('Malformed JSON');
            e.originalError = err;
            return next(e);
          }
        }
      });
    });

    // Middleware de logging para debug
    app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
      next();
    });

    // Asegurar tablas adicionales (para bases ya existentes)
    try {
      await ensureExtraTables();
    } catch (e) {
      console.warn('No se pudieron asegurar tablas extra:', e && e.message ? e.message : e);
    }

    // Rutas API
    app.use('/api/proyectos', proyectosRouter);
    app.use('/api/auth', authRouter);
    app.use('/api/tareas', tareasRouter);
    app.use('/api/evidencias', evidenciasRouter);
    app.use('/api/normas', normasRouter);
  app.use('/api/normas-repo', normasRepoRouter);
    app.use('/api/reportes', reportesRouter);

    // Servir uploads estáticos
    function getUploadsBase() {
      // Si estamos dentro de .asar (empaquetado), usar AppData
      if (__dirname.includes('.asar') || process.env.NODE_ENV === 'production') {
        const userDataPath = process.env.APPDATA || process.env.HOME;
        if (!userDataPath) {
          throw new Error('No se pudo determinar la ruta de datos del usuario para uploads');
        }
        const base = path.join(userDataPath, 'GestionProyectos', 'uploads');
        if (!fs.existsSync(base)) {
          console.log('📁 Creando directorio de uploads:', base);
          fs.mkdirSync(base, { recursive: true });
        }
        console.log('📂 Directorio de uploads:', base);
        return base;
      }
      // Desarrollo - usar carpeta local
      const base = path.join(__dirname, '..', 'data', 'uploads');
      if (!fs.existsSync(base)) {
        console.log('📁 Creando directorio de uploads (dev):', base);
        fs.mkdirSync(base, { recursive: true });
      }
      console.log('📂 Directorio de uploads (dev):', base);
      return base;
    }
    const uploadsDir = getUploadsBase();
    app.use('/uploads', express.static(uploadsDir));

    // Servir archivos estáticos de public (logo, etc.)
    function getPublicDir() {
      // En desarrollo
      if (__dirname.includes('server') && !__dirname.includes('.asar')) {
        const publicDir = path.join(__dirname, '..', 'frontend', 'public');
        if (fs.existsSync(publicDir)) {
          console.log('📂 Directorio public (dev):', publicDir);
          return publicDir;
        }
      }
      // En producción (Electron empaquetado)
      const candidates = [
        process.resourcesPath ? path.join(process.resourcesPath, 'frontend', 'public') : null,
        process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'frontend', 'public') : null,
        process.resourcesPath ? path.join(process.resourcesPath, 'app.asar', 'frontend', 'public') : null,
      ].filter(Boolean);
      
      for (const candidate of candidates) {
        if (candidate && fs.existsSync(candidate)) {
          console.log('📂 Directorio public (prod):', candidate);
          return candidate;
        }
      }
      
      // Fallback: intentar desde __dirname
      const fallback = path.join(__dirname, '..', 'frontend', 'public');
      console.log('📂 Directorio public (fallback):', fallback);
      return fallback;
    }
    
    const publicDir = getPublicDir();
    if (fs.existsSync(publicDir)) {
      app.use(express.static(publicDir));
      console.log('✅ Archivos estáticos de public disponibles en /');
    } else {
      console.warn('⚠️ Directorio public no encontrado:', publicDir);
    }

    // manejador de errores simple
    app.use((err, req, res, next) => {
      console.error(err && err.stack ? err.stack : err);
      // En desarrollo incluimos detalle y stack para facilitar debugging (no usar en producción)
      if (process.env.NODE_ENV !== 'production') {
        return res.status(500).json({ error: 'Error del servidor', detail: err && err.message ? err.message : String(err), rawBody: req && req.rawBody ? req.rawBody : undefined, stack: err && err.stack ? err.stack : undefined });
      }
      res.status(500).json({ error: 'Error del servidor' });
    });

    const PORT = process.env.PORT || 3001;
    const HOST = process.env.HOST || '127.0.0.1';
    
    console.log(`📡 Intentando iniciar servidor en ${HOST}:${PORT}...`);
    
    const server = app.listen(PORT, HOST, () => {
      console.log(`✅ ✅ ✅ Backend escuchando en ${HOST}:${PORT} ✅ ✅ ✅`);
      console.log('✅ Aplicación lista para usar.');
      console.log(`✅ Health check disponible en: http://${HOST}:${PORT}/api/auth/health`);
      console.log(`✅ Server address:`, server.address());
    });
    
    server.on('error', (err) => {
      console.error('❌ Error del servidor HTTP:', err);
      console.error('❌ Error code:', err.code);
      console.error('❌ Error message:', err.message);
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ El puerto ${PORT} ya está en uso. Cierra otras instancias de la aplicación.`);
      } else {
        console.error('❌ Error desconocido al iniciar el servidor HTTP');
      }
      throw err; // Re-lanzar para que Electron lo capture
    });
    
    // Verificar que el servidor realmente está escuchando
    server.on('listening', () => {
      const addr = server.address();
      console.log(`✅ Servidor confirmado escuchando en:`, addr);
    });

  } catch (error) {
    console.error('Error inicializando la aplicación:', error);
    console.error('Stack:', error.stack);
    // NO usar process.exit(1) aquí porque estamos dentro de Electron
    // Lanzar el error para que Electron lo maneje
    throw error;
  }
}

// Inicializar la aplicación
// Si se ejecuta directamente (no desde require)
if (require.main === module) {
  initializeApp();
}

// Exportar para uso desde Electron
module.exports = { initializeApp };