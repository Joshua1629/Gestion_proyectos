const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Importar funciones de inicialización de base de datos
const { initializeDatabase, checkDatabaseExists } = require('./scripts/initDb');

const tryRequireRouter = (...parts) => {
  const candidates = [
    path.join(__dirname, ...parts),
    path.join(__dirname, ...parts) + '.js',
    path.join(process.cwd(), ...parts),
    path.join(process.cwd(), ...parts) + '.js',
    path.join(process.resourcesPath || __dirname, ...parts),
    path.join(process.resourcesPath || __dirname, ...parts) + '.js'
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

    const app = express();

    // Configuración más específica de CORS
    app.use(cors({
      origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
      credentials: true,
      optionsSuccessStatus: 200
    }));
    
    app.use(express.json());

    // Middleware de logging para debug
    app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
      next();
    });

    // Rutas API
    app.use('/api/proyectos', proyectosRouter);
    app.use('/api/auth', authRouter);
    app.use('/api/tareas', tareasRouter);

    // manejador de errores simple
    app.use((err, req, res, next) => {
      console.error(err);
      res.status(500).json({ error: 'Error del servidor' });
    });

    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`Backend escuchando en puerto ${PORT}`);
      console.log('Aplicación lista para usar.');
    });

  } catch (error) {
    console.error('Error inicializando la aplicación:', error);
    process.exit(1);
  }
}

// Inicializar la aplicación
initializeApp();