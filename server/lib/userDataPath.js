/**
 * Rutas de datos de usuario multiplataforma.
 * - En Electron: process.env.ELECTRON_USER_DATA (app.getPath('userData') desde main.js).
 * - En desarrollo (NODE_ENV !== production, sin Electron): carpeta ./data del proyecto.
 * - Standalone producción: os.homedir()/GestionProyectos.
 * No se usa APPDATA ni HOME manualmente.
 */
const path = require("path");
const os = require("os");
const fs = require("fs");

// Desde server/lib, la raíz del proyecto es ../..
const projectRoot = path.join(__dirname, "..", "..");
const devDataDir = path.join(projectRoot, "data");

/**
 * Devuelve el directorio base donde se guardan datos (DB, uploads).
 */
function getBaseDir() {
  if (process.env.ELECTRON_USER_DATA) {
    return process.env.ELECTRON_USER_DATA;
  }
  if (process.env.NODE_ENV !== "production" && fs.existsSync(projectRoot)) {
    return devDataDir;
  }
  return path.join(os.homedir(), "GestionProyectos");
}

/**
 * Ruta del archivo de base de datos SQLite.
 */
function getDatabasePath() {
  return path.join(getBaseDir(), "gestion_proyectos.db");
}

/**
 * Directorio base para subida de archivos (evidencias, normas, etc.).
 */
function getUploadsBase() {
  return path.join(getBaseDir(), "uploads");
}

module.exports = {
  getBaseDir,
  getDatabasePath,
  getUploadsBase,
};
