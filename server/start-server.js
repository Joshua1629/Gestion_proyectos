#!/usr/bin/env node
/**
 * Script wrapper para iniciar el servidor backend en Electron
 * Este script configura el entorno correctamente antes de cargar app.js
 */

// En producción, necesitamos configurar las rutas de módulos correctamente
if (process.env.NODE_ENV === 'production' || !process.env.ELECTRON_DEV) {
  // En Electron empaquetado, las dependencias están dentro del .asar
  // Necesitamos ayudar a Node.js a encontrarlas
  
  const path = require('path');
  const fs = require('fs');
  
  // Buscar node_modules en varias ubicaciones posibles
  // __dirname es resources/server/, así que necesitamos buscar en diferentes ubicaciones
  const resourcesPath = process.resourcesPath || path.join(__dirname, '..');
  const possiblePaths = [
    // PRIMERO: node_modules local del servidor (en extraResources)
    path.join(__dirname, 'node_modules'),
    // Desde app.asar.unpacked/node_modules (desempaquetado)
    path.join(resourcesPath, 'app.asar.unpacked', 'node_modules'),
    // Desde resources/node_modules
    path.join(resourcesPath, 'node_modules'),
    // Desde app.asar/node_modules (dentro del .asar - puede no funcionar para módulos nativos)
    path.join(resourcesPath, 'app.asar', 'node_modules'),
  ];
  
  // Agregar al NODE_PATH las rutas que existen
  const nodePaths = [];
  for (const nmPath of possiblePaths) {
    if (fs.existsSync(nmPath)) {
      nodePaths.push(nmPath);
      console.log('[start-server] Encontrado node_modules en:', nmPath);
    }
  }
  
  // También agregar node_modules locales si existe
  const localNodeModules = path.join(__dirname, 'node_modules');
  if (fs.existsSync(localNodeModules)) {
    nodePaths.push(localNodeModules);
  }
  
  if (nodePaths.length > 0) {
    const separator = process.platform === 'win32' ? ';' : ':';
    const existingPath = process.env.NODE_PATH || '';
    process.env.NODE_PATH = nodePaths.join(separator) + (existingPath ? separator + existingPath : '');
    console.log('[start-server] NODE_PATH configurado:', process.env.NODE_PATH);
  }
}

// Ahora cargar y ejecutar app.js
console.log('[start-server] Iniciando servidor desde:', __dirname);
console.log('[start-server] process.cwd():', process.cwd());
console.log('[start-server] __dirname:', __dirname);
console.log('[start-server] NODE_ENV:', process.env.NODE_ENV);
console.log('[start-server] NODE_PATH:', process.env.NODE_PATH || '(no configurado)');

// Verificar que sqlite3 se puede cargar ANTES de cargar app.js
try {
  console.log('[start-server] Verificando que sqlite3 esté disponible...');
  const testSqlite3 = require('sqlite3');
  console.log('[start-server] ✅ sqlite3 disponible:', testSqlite3);
} catch (err) {
  console.error('[start-server] ❌ ERROR: sqlite3 NO está disponible');
  console.error('[start-server] ❌ Error:', err.message);
  console.error('[start-server] ❌ Stack:', err.stack);
  console.error('[start-server] ❌ Verificando rutas de búsqueda...');
  
  const Module = require('module');
  const searchPaths = Module._nodeModulePaths(__dirname);
  console.error('[start-server] Rutas donde Node.js busca módulos:');
  searchPaths.forEach(p => {
    const sqlite3Path = require('path').join(p, 'sqlite3');
    const fs = require('fs');
    const exists = fs.existsSync(sqlite3Path);
    console.error(`   ${exists ? '✅' : '❌'} ${sqlite3Path}`);
  });
  
  process.exit(1);
}

try {
  // Cargar el módulo del servidor
  const serverModule = require('./app.js');
  
  // Si el módulo exporta initializeApp, ejecutarlo explícitamente
  if (serverModule && typeof serverModule.initializeApp === 'function') {
    console.log('[start-server] Ejecutando initializeApp...');
    serverModule.initializeApp()
      .then(() => {
        console.log('[start-server] Servidor inicializado correctamente');
      })
      .catch((err) => {
        console.error('[start-server] ERROR al inicializar servidor:', err);
        console.error('[start-server] Stack:', err.stack);
        process.exit(1);
      });
  } else {
    // Si no exporta initializeApp, esperar que app.js se ejecute automáticamente
    console.log('[start-server] app.js debería ejecutarse automáticamente');
  }
} catch (err) {
  console.error('[start-server] ERROR cargando app.js:', err);
  console.error('[start-server] Stack:', err.stack);
  console.error('[start-server] Mensaje:', err.message);
  process.exit(1);
}

