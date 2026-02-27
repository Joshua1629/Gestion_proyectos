/**
 * Parchea binding.gyp de sqlite3 para definir openssl_fips (evita error de node-gyp
 * con Electron/Node cuando common.gypi referencia openssl_fips y no está definida).
 */
const path = require("path");
const fs = require("fs");

const bindingPath = path.join(__dirname, "..", "node_modules", "sqlite3", "binding.gyp");
if (!fs.existsSync(bindingPath)) {
  console.log("scripts/patch-sqlite3-gyp.js: sqlite3 no instalado, omitiendo parche.");
  process.exit(0);
}

let content = fs.readFileSync(bindingPath, "utf8");
if (content.includes("openssl_fips%")) {
  process.exit(0);
}
// Añadir openssl_fips% para que gyp no falle con "name 'openssl_fips' is not defined"
const newVariables = content.replace(
  /"variables":\s*\{\s*"sqlite%"/,
  '"variables": {\n      "openssl_fips%": "",\n      "sqlite%"'
);
if (newVariables === content) {
  console.warn("scripts/patch-sqlite3-gyp.js: no se pudo aplicar parche (formato distinto).");
  process.exit(0);
}
fs.writeFileSync(bindingPath, newVariables, "utf8");
console.log("scripts/patch-sqlite3-gyp.js: parche openssl_fips aplicado a sqlite3/binding.gyp");
process.exit(0);
