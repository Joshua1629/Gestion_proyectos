/**
 * Genera icon.ico desde logoapp.png para el icono de la app en Windows (barra de tareas, ventana).
 * Ejecutar: npm run build:icon
 */
const path = require("path");
const fs = require("fs");

const dir = path.join(__dirname, "..");
const input = path.join(dir, "frontend", "public", "logoapp.png");
const output = path.join(dir, "frontend", "public", "icon.ico");

if (!fs.existsSync(input)) {
  console.warn("⚠️ No se encontró logoapp.png. Crear frontend/public/logoapp.png y volver a ejecutar.");
  process.exit(0);
}

async function run() {
  let pngToIco;
  try {
    const mod = await import("png-to-ico");
    pngToIco = mod.default;
  } catch (e) {
    console.warn("⚠️ png-to-ico no instalado. Ejecuta: npm install --save-dev png-to-ico");
    process.exit(0);
  }
  try {
    const buf = await pngToIco(input);
    fs.writeFileSync(output, buf);
    console.log("✅ icon.ico generado en frontend/public/icon.ico");
  } catch (err) {
    console.error("❌ Error generando icon.ico:", err.message);
    process.exit(1);
  }
}
run();
