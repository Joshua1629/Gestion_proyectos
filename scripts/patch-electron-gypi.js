/**
 * Parchea common.gypi de Electron en .electron-gyp para definir openssl_fips.
 * Ese archivo se crea al descargar los headers (primer intento de rebuild).
 * Ejecutar después de que install-app-deps falle una vez, luego volver a ejecutar install-app-deps.
 */
const path = require("path");
const fs = require("fs");

const pkgPath = path.join(__dirname, "..", "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const electronVersion = (pkg.devDependencies && pkg.devDependencies.electron) || "22.3.27";
const version = electronVersion.replace(/^\^/, "").trim();

const home = process.env.USERPROFILE || process.env.HOME || process.env.HOMEPATH;
if (!home) {
  console.warn("scripts/patch-electron-gypi.js: no se encontró directorio home.");
  process.exit(0);
}

const commonGypiPath = path.join(home, ".electron-gyp", version, "include", "node", "common.gypi");
if (!fs.existsSync(commonGypiPath)) {
  console.log("scripts/patch-electron-gypi.js: common.gypi no existe aún en", commonGypiPath);
  process.exit(0);
}

let content = fs.readFileSync(commonGypiPath, "utf8");
// La condición 'openssl_fips != ""' en common.gypi requiere la variable sin %; con % no se resuelve en gyp.
if (content.includes("'openssl_fips': ''")) {
  console.log("scripts/patch-electron-gypi.js: openssl_fips ya definido (sin %), omitiendo.");
  process.exit(0);
}

// Añadir 'openssl_fips': '' justo después de 'openssl_fips%': '' para que la condición se evalúe bien.
let replaced = content.replace(
  /('openssl_fips%':\s*'',?)\s*\n/,
  "$1\n    'openssl_fips': '',\n"
);
if (replaced === content) {
  // Si no hay openssl_fips%, insertar en la sección variables al inicio.
  replaced = content.replace(
    /(\s*'variables':\s*\{\s*\n)/,
    "$1    'openssl_fips': '',\n"
  );
}
if (replaced === content) {
  console.warn("scripts/patch-electron-gypi.js: no se pudo aplicar parche (formato distinto).");
  process.exit(0);
}

fs.writeFileSync(commonGypiPath, replaced, "utf8");
console.log("scripts/patch-electron-gypi.js: parche openssl_fips aplicado a", commonGypiPath);
process.exit(0);
