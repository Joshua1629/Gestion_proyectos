/**
 * Genera icon.icns desde logoapp.png para macOS (solo corre en Mac).
 * Ejecutar en macOS: npm run build:icon:mac
 * Requiere: logoapp.png en frontend/public/ (recomendado 1024x1024 o 512x512).
 * En Windows/Linux no hace nada (electron-builder convierte PNG a .icns al construir para mac).
 */
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

if (process.platform !== "darwin") {
  console.log("ℹ️ build:icon:mac solo tiene efecto en macOS. En otras plataformas electron-builder convierte el PNG al construir.");
  process.exit(0);
}

const dir = path.join(__dirname, "..");
const input = path.join(dir, "frontend", "public", "logoapp.png");
const iconsetDir = path.join(dir, "frontend", "public", "icon.iconset");
const output = path.join(dir, "frontend", "public", "icon.icns");

if (!fs.existsSync(input)) {
  console.warn("⚠️ No se encontró logoapp.png. Crear frontend/public/logoapp.png y volver a ejecutar.");
  process.exit(0);
}

const sizes = [16, 32, 64, 128, 256, 512];
try {
  if (fs.existsSync(iconsetDir)) {
    fs.rmSync(iconsetDir, { recursive: true });
  }
  fs.mkdirSync(iconsetDir, { recursive: true });
  for (const size of sizes) {
    execSync(`sips -z ${size} ${size} "${input}" --out "${iconsetDir}/icon_${size}x${size}.png"`, { stdio: "inherit" });
    if (size <= 256) {
      execSync(`sips -z ${size * 2} ${size * 2} "${input}" --out "${iconsetDir}/icon_${size}x${size}@2x.png"`, { stdio: "inherit" });
    }
  }
  execSync(`iconutil -c icns "${iconsetDir}" -o "${output}"`, { stdio: "inherit" });
  fs.rmSync(iconsetDir, { recursive: true });
  console.log("✅ icon.icns generado en frontend/public/icon.icns");
} catch (err) {
  console.error("❌ Error generando icon.icns:", err.message);
  process.exit(1);
}
