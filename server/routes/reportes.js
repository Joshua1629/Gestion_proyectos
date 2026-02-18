const express = require("express");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { param, query } = require("express-validator");
const { validationResult } = require("express-validator");
const pool = require("../models/db");

const router = express.Router();

function getLogoPath() {
  const candidates = [
    // Rutas de desarrollo
    path.join(process.cwd(), "frontend", "public", "logo.png"),
    path.join(process.cwd(), "frontend", "public", "logoapp.png"),
    path.join(__dirname, "..", "..", "frontend", "public", "logo.png"),
    path.join(__dirname, "..", "..", "frontend", "public", "logoapp.png"),
    // Rutas de producción (Electron empaquetado)
    process.resourcesPath ? path.join(process.resourcesPath, "app.asar.unpacked", "frontend", "public", "logo.png") : null,
    process.resourcesPath ? path.join(process.resourcesPath, "app.asar.unpacked", "frontend", "public", "logoapp.png") : null,
    process.resourcesPath ? path.join(process.resourcesPath, "app.asar", "frontend", "public", "logo.png") : null,
    process.resourcesPath ? path.join(process.resourcesPath, "app.asar", "frontend", "public", "logoapp.png") : null,
    // Rutas alternativas en extraResources
    process.resourcesPath ? path.join(process.resourcesPath, "logo.png") : null,
    process.resourcesPath ? path.join(process.resourcesPath, "logoapp.png") : null,
    // Desde el directorio del servidor (si está en extraResources)
    path.join(__dirname, "..", "..", "logo.png"),
    path.join(__dirname, "..", "..", "logoapp.png"),
  ].filter(Boolean);
  
  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c)) {
        console.log(`✅ Logo encontrado en: ${c}`);
        return c;
      }
    } catch (err) {
      // Continuar buscando
    }
  }
  console.warn("⚠️ Logo no encontrado en ninguna ruta. Rutas probadas:", candidates);
  return null;
}

function getCfiaSealPath() {
  const candidates = [
    // Rutas de desarrollo
    path.join(process.cwd(), "frontend", "public", "cfia_seal.png"),
    path.join(process.cwd(), "frontend", "public", "cfia.png"),
    path.join(__dirname, "..", "..", "frontend", "public", "cfia_seal.png"),
    path.join(__dirname, "..", "..", "frontend", "public", "cfia.png"),
    // Rutas de producción (Electron empaquetado)
    process.resourcesPath ? path.join(process.resourcesPath, "app.asar.unpacked", "frontend", "public", "cfia_seal.png") : null,
    process.resourcesPath ? path.join(process.resourcesPath, "app.asar.unpacked", "frontend", "public", "cfia.png") : null,
    process.resourcesPath ? path.join(process.resourcesPath, "app.asar", "frontend", "public", "cfia_seal.png") : null,
    process.resourcesPath ? path.join(process.resourcesPath, "app.asar", "frontend", "public", "cfia.png") : null,
    // Rutas alternativas
    process.resourcesPath ? path.join(process.resourcesPath, "cfia_seal.png") : null,
    process.resourcesPath ? path.join(process.resourcesPath, "cfia.png") : null,
    path.join(__dirname, "..", "..", "cfia_seal.png"),
    path.join(__dirname, "..", "..", "cfia.png"),
  ].filter(Boolean);
  
  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c)) {
        console.log(`✅ Sello CFIA encontrado en: ${c}`);
        return c;
      }
    } catch (err) {
      // Continuar buscando
    }
  }
  return null;
}

// Normaliza rutas para comparaciones robustas (soporta Windows/Linux)
function normalizePath(p) {
  try {
    return path.resolve(p).replace(/\\/g, "/").toLowerCase();
  } catch {
    return String(p || "").replace(/\\/g, "/").toLowerCase();
  }
}

const checkValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });
  next();
};

// Helpers de estilo
function drawHeader(doc, proyectoNombre, clienteNombre) {
  // Línea verde superior
  doc.save();
  doc
    .lineWidth(3)
    .strokeColor("#93C01F")
    .moveTo(50, 60)
    .lineTo(545, 60)
    .stroke();
  // Logo empresa en esquina superior izquierda (altura limitada para no solapar nombre)
  const logo = getLogoPath();
  if (logo) {
    try {
      doc.image(logo, 50, 2, { fit: [70, 50] });
    } catch {}
  }
  // Título debajo de la franja y el logo
  doc
    .fillColor("#000")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text("REPORTE FOTOGRÁFICO", 50, 78, { align: "left" });
  // Sello CFIA a la derecha (como en el ejemplo)
  const cfiaSeal = getCfiaSealPath();
  if (cfiaSeal) {
    try {
      doc.image(cfiaSeal, 455, 20, { width: 90 });
    } catch {}
  }
  doc.restore();
}

function drawFooter(doc, currentPage, totalPages) {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const x = doc.page.margins.left;
  const w = pageWidth - doc.page.margins.left - doc.page.margins.right;
  const y = Math.max(0, pageHeight - 30); // 30pt desde el borde inferior (origen arriba)
  doc.save();
  doc
    .fontSize(9)
    .fillColor("#666")
    .text(`Página ${currentPage} de ${totalPages || ""}`, x, y, {
      width: w,
      align: "right",
      lineBreak: false,
    });
  doc.restore();
}

// Pie de página: solo el número, abajo a la derecha (llamar en la página actual)
function drawFooterPageNumber(doc, pageNum) {
  const pageHeight = doc.page.height;
  const marginBottom = 50;
  const footerY = pageHeight - marginBottom - 10;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.save();
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#000")
    .text(String(pageNum), doc.page.margins.left, footerY, {
      width: w,
      align: "right",
      lineBreak: false,
    });
  doc.restore();
}

function severityStyle(cat) {
  switch ((cat || "").toUpperCase()) {
    case "CRITICO":
      return { label: "Crítico", color: "#D32F2F" };
    case "LEVE":
      return { label: "Leve", color: "#FFA000" };
    case "OK":
    default:
      return { label: "OK", color: "#388E3C" };
  }
}

// Fecha tipo: "Jueves 23 de Octubre del 2025."
function formatFechaInforme(d = new Date()) {
  const dias = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ];
  const meses = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  return `${dias[d.getDay()]} ${d.getDate()} de ${
    meses[d.getMonth()]
  } del ${d.getFullYear()}.`;
}

// Formatea una fecha ignorando zonas horarias (usa UTC internamente)
function formatFechaInformeSeguro(value) {
  const dias = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ];
  const meses = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  // Extraer partes y construir una fecha estable SIN conversiones de zona horaria
  let y, m, d;
  if (typeof value === "string") {
    // Priorizar formato ISO (YYYY-MM-DD) que viene de la base de datos
    const mIso = value.match(/^\s*(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?\s*$/);
    if (mIso) {
      y = Number(mIso[1]);
      m = Number(mIso[2]) - 1; // Los meses en JS son 0-indexed
      d = Number(mIso[3]);
    } else {
      // Formato local (DD/MM/YYYY o DD-MM-YYYY)
      const mLoc = value.match(/^\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\s*$/);
      if (mLoc) {
        d = Number(mLoc[1]);
        m = Number(mLoc[2]) - 1;
        y = Number(mLoc[3]);
      }
    }
  } else if (value instanceof Date) {
    // Si viene como Date, NO usar toISOString() porque puede cambiar el día
    // En su lugar, usar los métodos locales que preservan la fecha correcta
    // (a menos que el Date ya tenga un desfase, en cuyo caso necesitamos corregirlo)
    // Para evitar problemas, usar getFullYear(), getMonth(), getDate() que preservan la fecha local
    y = value.getFullYear();
    m = value.getMonth();
    d = value.getDate();
  } else if (typeof value === "number") {
    // Timestamp: convertir a Date y usar métodos locales (no UTC)
    const dv = new Date(value);
    y = dv.getFullYear();
    m = dv.getMonth();
    d = dv.getDate();
  }
  if (y == null || m == null || d == null) {
    const now = new Date();
    y = now.getFullYear();
    m = now.getMonth();
    d = now.getDate();
  }
  // Usar los valores directamente - NO hacer conversión UTC adicional
  // Crear la fecha en UTC pero usando los valores de año/mes/día extraídos
  // Esto evita cualquier desfase de zona horaria
  const utc = new Date(Date.UTC(y, m, d, 12, 0, 0));
  return `${dias[utc.getUTCDay()]} ${utc.getUTCDate()} de ${meses[utc.getUTCMonth()]} del ${utc.getUTCFullYear()}.`;
}

// Parse fechas guardadas como 'YYYY-MM-DD' en horario local para evitar desfase
function parseFechaLocal(value) {
  if (!value) return new Date();
  try {
    if (typeof value === "string") {
      // Formato local dd/mm/aaaa
      const mLoc = value.match(/^\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\s*$/);
      if (mLoc) {
        const da = Number(mLoc[1]);
        const mo = Number(mLoc[2]) - 1;
        const y = Number(mLoc[3]);
        const d = new Date(y, mo, da);
        d.setHours(12, 0, 0, 0); // fijar a mediodía para evitar desfases
        return d;
      }
      // ISO con solo fecha YYYY-MM-DD
      const m = value.match(/^\s*(\d{4})-(\d{2})-(\d{2})\s*$/);
      if (m) {
        const y = Number(m[1]);
        const mo = Number(m[2]) - 1;
        const da = Number(m[3]);
        const d = new Date(y, mo, da);
        d.setHours(12, 0, 0, 0);
        return d;
      }
      // ISO con fecha y tiempo (ignorar tiempo/zonas y usar la fecha local)
      const mIso = value.match(/^\s*(\d{4})-(\d{2})-(\d{2})[T\s].*$/);
      if (mIso) {
        const y = Number(mIso[1]);
        const mo = Number(mIso[2]) - 1;
        const da = Number(mIso[3]);
        const d = new Date(y, mo, da);
        d.setHours(12, 0, 0, 0);
        return d;
      }
    }
    // Si viene como objeto Date, normalizar a solo fecha local
    if (value instanceof Date) {
      const y = value.getFullYear();
      const mo = value.getMonth();
      const da = value.getDate();
      const d = new Date(y, mo, da);
      d.setHours(12, 0, 0, 0);
      return d;
    }
    // Si es numérico (timestamp), convertir y normalizar
    if (typeof value === "number") {
      const dv = new Date(value);
      const y = dv.getFullYear();
      const mo = dv.getMonth();
      const da = dv.getDate();
      const d = new Date(y, mo, da);
      d.setHours(12, 0, 0, 0);
      return d;
    }
    const dgen = new Date(value);
    const y = dgen.getFullYear();
    const mo = dgen.getMonth();
    const da = dgen.getDate();
    const d = new Date(y, mo, da);
    d.setHours(12, 0, 0, 0);
    return d;
  } catch {
    return new Date();
  }
}

function drawLegend(doc, y) {
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#000")
    .text("Simbología:", 50, y);
  const items = [
    { label: "Cumplimiento → OK.", color: "#388E3C" },
    {
      label: "Incumplimiento Leve → Solucionar a Mediano Plazo.",
      color: "#FFA000",
    },
    {
      label: "Incumplimiento Crítico → Solucionar a Corto Plazo.",
      color: "#D32F2F",
    },
  ];
  let yLine = y + 16;
  items.forEach((it) => {
    // círculo de color
    doc
      .circle(56, yLine + 4, 4)
      .fillColor(it.color)
      .fill();
    doc
      .fillColor("#000")
      .font("Helvetica")
      .fontSize(9)
      .text(it.label, 68, yLine - 2, { width: 477 });
    yLine += 16;
  });
}

function drawCover(doc, proyecto, coverImagePath, institucionImagePath) {
  // Encabezados alineados a la izquierda (más cercanos al margen)
  const leftX = 50;
  const headStartY = 95;
  const valueWidth = 300;
  let cy = headStartY;
  function heading(label, value) {
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#444")
      .text(label, leftX, cy, { width: valueWidth, align: "left" });
    cy += 14;
    const valueStr = String(value || "");
    doc.font("Helvetica").fontSize(13).fillColor("#000");
    const valueHeight = doc.heightOfString(valueStr, { width: valueWidth });
    doc.text(valueStr, leftX, cy, { width: valueWidth, align: "left" });
    cy += valueHeight + 10; // altura real del valor + espacio hasta el siguiente
  }
  heading("NOMBRE DE ESTABLECIMIENTO", proyecto.nombre);
  heading("RAZON SOCIAL", proyecto.cliente);
  // Formatear cédula jurídica con guiones (X-XXX-XXXXXX)
  const cedulaRaw = String(proyecto.cedula_juridica || "").replace(/\D/g, "");
  let cedulaFormateada = cedulaRaw;
  if (cedulaRaw.length === 10) {
    cedulaFormateada = `${cedulaRaw.slice(0, 1)}-${cedulaRaw.slice(1, 4)}-${cedulaRaw.slice(4)}`;
  } else if (cedulaRaw.length === 9) {
    cedulaFormateada = `${cedulaRaw.slice(0, 1)}-${cedulaRaw.slice(1, 3)}-${cedulaRaw.slice(3)}`;
  }
  heading("CEDULA JURIDICA", cedulaFormateada);
  // línea divisoria sutil
  doc
    .moveTo(leftX, cy)
    .lineTo(545, cy)
    .strokeColor("#d3d3d3")
    .lineWidth(1)
    .stroke();
  cy += 15;

  const leftBoxY = Math.max(205, cy);
  const imgY = Math.max(240, leftBoxY + 5);

  // Foto de portada (usar institucional si existe, si no la primera normal)
  const imgX = 260;
  const imgW = 300;
  const imgH = 230;
  const mainCover =
    institucionImagePath && fs.existsSync(institucionImagePath)
      ? institucionImagePath
      : coverImagePath && fs.existsSync(coverImagePath)
      ? coverImagePath
      : null;
  if (mainCover) {
    try {
      // Imagen de portada sin borde
      doc.image(mainCover, imgX, imgY, {
        fit: [imgW, imgH],
        align: "center",
        valign: "center",
      });
    } catch {}
  }

  // Columna izquierda con VERIFICADOR y fechas
  const leftBoxX = 50;
  const leftBoxW = 170;
  const leftBoxH = 195; // space for verifier + dates
  // fondo
  doc
    .roundedRect(leftBoxX, leftBoxY, leftBoxW, leftBoxH, 6)
    .fillColor("#fafafa")
    .fill();
  doc
    .roundedRect(leftBoxX, leftBoxY, leftBoxW, leftBoxH, 6)
    .strokeColor("#d8d8d8")
    .lineWidth(1)
    .stroke();
  let ly = leftBoxY + 12;
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#333")
    .text("VERIFICADOR", leftBoxX + 12, ly);
  ly += 14;
  const verifierNameWidth = leftBoxW - 24 - 40; // más estrecho para que baje una palabra y sobre espacio para el sello
  const verifierNameH = doc.heightOfString("Ing. Luis Javier Jiménez Fernández", { width: verifierNameWidth });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#000")
    .text("Ing. Luis Javier Jiménez Fernández", leftBoxX + 12, ly, {
      width: verifierNameWidth,
    });
  ly += verifierNameH + 8;
  doc
    .font("Helvetica")
    .fontSize(9)
    .text("70188-0617", leftBoxX + 12, ly);
  ly += 14;
  doc
    .font("Helvetica")
    .fontSize(9)
    .text("IMI-24991", leftBoxX + 12, ly);
  ly += 14;
  doc
    .font("Helvetica")
    .fontSize(9)
    .text("CAPDEE #92", leftBoxX + 12, ly);
  ly += 18;
  // línea divisoria
  doc
    .moveTo(leftBoxX + 12, ly)
    .lineTo(leftBoxX + leftBoxW - 12, ly)
    .strokeColor("#e0e0e0")
    .lineWidth(1)
    .stroke();
  ly += 10;

  const fechaVerif = formatFechaInformeSeguro(
    proyecto.fecha_verificacion
      ? proyecto.fecha_verificacion
      : proyecto.fecha_inicio
      ? proyecto.fecha_inicio
      : new Date()
  );
  const fechaInforme = formatFechaInformeSeguro(new Date());
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor("#333")
    .text("Fecha de Verificación:", leftBoxX + 12, ly);
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#000")
    .text(fechaVerif, leftBoxX + 12, ly + 12, { width: leftBoxW - 24 });
  ly += 30;
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor("#333")
    .text("Fecha Realización de Informe:", leftBoxX + 12, ly);
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#000")
    .text(fechaInforme, leftBoxX + 12, ly + 12, { width: leftBoxW - 24 });

  // NOTA y Simbología al pie, alineadas como en el ejemplo
  const bottomY = doc.page.height - doc.page.margins.bottom - 120; // elevar un poco para más balance
  // separador superior
  doc
    .moveTo(50, bottomY - 15)
    .lineTo(545, bottomY - 15)
    .strokeColor("#d0d0d0")
    .lineWidth(1)
    .stroke();
  const noteX = 330;
  const noteY = bottomY;
  // Caja de nota
  doc
    .roundedRect(noteX - 10, noteY - 10, 225, 80, 6)
    .strokeColor("#e5e7eb")
    .lineWidth(1)
    .stroke();
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#000")
    .text("NOTA:", noteX, noteY);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#333")
    .text(
      "Las fotografías son representativas del incumplimiento, un mismo incumplimiento aplica para toda la instalación eléctrica.",
      noteX + 44,
      noteY,
      { width: 175 }
    );

  // Simbología al mismo nivel pero a la izquierda
  drawLegend(doc, bottomY);
}

// Espacio reservado para sello CFIA (medidas físicas del sello: 10,3 cm × 7,2 cm)
// 1 cm = 72/2.54 pt ≈ 28,35 pt
const SEAL_HEIGHT_CM = 7.2;
const SEAL_WIDTH_CM = 10.3;
const SEAL_HEIGHT_PT = Math.round(SEAL_HEIGHT_CM * (72 / 2.54)); // ≈ 205 pt
const SEAL_WIDTH_PT = Math.round(SEAL_WIDTH_CM * (72 / 2.54));   // ≈ 292 pt

const PAGE_CONTENT_TOP = SEAL_HEIGHT_PT;

// Bloque verificador (izquierda del espacio para sello) — ancho limitado para dejar 10,3 cm al sello
function drawVerificadorBlock(doc) {
  const leftX = 50;
  const topY = 25;
  const contentWidth = 495; // A4 menos márgenes
  const blockW = contentWidth - SEAL_WIDTH_PT - 15; // dejar ≥ 10,3 cm para el sello + separación
  const lineH = 14;
  let y = topY;

  const logoPath = getLogoPath();
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, leftX, y, { width: 70 });
      y += 70 + 6;
    } catch (e) {
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#333");
      doc.text("FERMA INGENIERÍA Y CONSULTORÍA", leftX, y, { width: blockW });
      y += lineH + 4;
    }
  } else {
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#333");
    doc.text("FERMA INGENIERÍA Y CONSULTORÍA", leftX, y, { width: blockW });
    y += lineH + 4;
  }

  doc.font("Helvetica").fontSize(10).fillColor("#000");

  // Caja VERIFICADOR
  const boxTop = y;
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000");
  doc.text("VERIFICADOR", leftX + 8, y + 6);
  y += 18;

  doc.font("Helvetica").fontSize(10);
  doc.text("Ing. Luis Javier Jiménez Fernández", leftX + 8, y);
  y += lineH;
  doc.text("Ingeniero en Mantenimiento Industrial", leftX + 8, y);
  y += lineH + 4;
  doc.text("70188-0617", leftX + 8, y);
  y += lineH;
  doc.text("IMI-24991", leftX + 8, y);
  y += lineH;
  doc.text("CAPDEE #92", leftX + 8, y);
  y += lineH + 8;

  const boxH = y - boxTop;
  doc.roundedRect(leftX, boxTop, blockW, boxH, 4).strokeColor("#CCC").lineWidth(1).stroke();
}

// Página 2: Equipos de Seguridad y Verificación (lado a lado, dos columnas)
function drawEquiposPage(doc) {
  drawVerificadorBlock(doc);

  const marginX = 50;
  const fullW = 495;
  const gap = 15;
  const boxW = (fullW - gap) / 2;
  const leftX = marginX;
  const rightX = marginX + boxW + gap;
  const yStart = PAGE_CONTENT_TOP;

  const bulletRadius = 4;
  const textIndent = 32;

  function drawListBoxAt(boxX, y, boxWidth, title, items, splitOnlyForRecommendation = false) {
    const itemTextWidth = boxWidth - textIndent - 8;
    const opts = { width: itemTextWidth, lineGap: 5 };

    doc.font("Helvetica").fontSize(10);
    let totalH = 14 + 10;
    items.forEach((t) => {
      const text = String(t || "");
      const lower = text.toLowerCase();
      const isRecommendation = lower.includes("(se recomienda al menos 75% algodón)");
      let firstLine = text;
      let secondLine = null;
      if (splitOnlyForRecommendation && isRecommendation) {
        const idx = lower.indexOf("(se recomienda al menos 75% algodón)");
        firstLine = text.slice(0, idx).trimEnd();
        secondLine = " " + text.slice(idx).trim();
      } else if (!splitOnlyForRecommendation) {
        const m = text.match(/^(.*?)(\s*\(.*\))\s*$/);
        if (m) {
          firstLine = m[1];
          secondLine = m[2];
        }
      }
      totalH += doc.heightOfString(firstLine, opts) + 4;
      if (secondLine) totalH += doc.heightOfString(secondLine, opts) + 4;
      totalH += 4;
    });

    const boxH = totalH;
    doc
      .roundedRect(boxX, y, boxWidth, boxH, 6)
      .strokeColor("#CFCFCF")
      .lineWidth(1)
      .stroke();

    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#000")
      .text(title, boxX + 10, y + 6);

    let ly = y + 20;
    items.forEach((t) => {
      const text = String(t || "");
      const lower = text.toLowerCase();
      const isRecommendation = lower.includes("(se recomienda al menos 75% algodón)");
      let firstLine = text;
      let secondLine = null;
      if (splitOnlyForRecommendation && isRecommendation) {
        const idx = lower.indexOf("(se recomienda al menos 75% algodón)");
        firstLine = text.slice(0, idx).trimEnd();
        secondLine = " " + text.slice(idx).trim();
      } else if (!splitOnlyForRecommendation) {
        const m = text.match(/^(.*?)(\s*\(.*\))\s*$/);
        if (m) {
          firstLine = m[1];
          secondLine = m[2];
        }
      }
      doc
        .circle(boxX + 12, ly + 5, bulletRadius)
        .fillColor("#43A047")
        .fill();
      const h1 = doc.heightOfString(firstLine, opts);
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#000")
        .text(firstLine, boxX + textIndent, ly - 2, opts);
      ly += h1 + 4;
      if (secondLine) {
        const h2 = doc.heightOfString(secondLine, opts);
        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor("#000")
          .text(secondLine, boxX + textIndent, ly - 2, opts);
        ly += h2 + 4;
      }
      ly += 4;
    });

    return boxH;
  }

  const seguridadItems = [
    "Zapatos de seguridad (Dieléctricos).",
    "Chaleco reflectivo.",
    "Camisa de algodón de manga y pantalón largo (se recomienda al menos 75% algodón).",
    "Guantes (cuando se considere necesario).",
    "Casco.",
    "Lentes (cuando se considere necesario).",
  ];
  const verificacionItems = [
    "Telurómetro de gancho.",
    "Cinta métrica laser.",
    "Multímetro de gancho.",
    "Desatornilladores aislados.",
    "Llave Ratchet 12 mm (1/2\") y 9,95 mm (3/8\").",
    "Cámara Térmica.",
  ];

  const h1 = drawListBoxAt(leftX, yStart, boxW, "Equipos de Seguridad:", seguridadItems, true);
  const h2 = drawListBoxAt(rightX, yStart, boxW, "Equipos de Verificación:", verificacionItems);

  return yStart + Math.max(h1, h2) + 4;
}

function drawFinding(
  doc,
  idx,
  evidencia,
  yStart,
  linkedNormas,
  images
) {
  const marginX = 50;
  const imgW = 200;
  const imgH = 115; // compacto para caber 2 evidencias en hoja 2 con espacio para sello
  const gap = 10;
  // La severidad se muestra por incumplimiento, no a nivel de evidencia

  // Calcular alturas de texto
  const leftW = 495 - imgW - 3 * gap;
  const comentarioRaw = evidencia.comentario || "";
  const comentarioTxt = String(comentarioRaw).trim();
  const hasComentario = comentarioTxt.length > 0;
  const comentarioHeight = hasComentario
    ? doc.heightOfString(comentarioTxt, { width: leftW, align: "left" }) + 14
    : 0;
  const normasMostradas = Array.isArray(linkedNormas) ? linkedNormas : [];
  const itemTextWidthCalc = leftW - 24;
  const normasHeight = normasMostradas.reduce((acc, n) => {
    const texto = ` ${n.titulo}${n.fuente ? " — " + n.fuente : ""}`;
    const h = doc.heightOfString(texto, { width: itemTextWidthCalc, align: "left" });
    return acc + h + 4;
  }, 0) + (normasMostradas.length ? 18 : 0);
  const contentHeight = 28 + normasHeight + comentarioHeight + 12;
  let blockH = Math.max(contentHeight, imgH + 36);
  // NO limitar el bloque - asegurar que todo el contenido quepa
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  const availableHeight = Math.max(0, pageBottom - yStart - 6);
  // Si el bloque no cabe, NO recortarlo - el llamador debería haber hecho salto de página
  if (blockH > availableHeight && availableHeight > 150) {
    blockH = Math.max(contentHeight, availableHeight);
  }

  // Caja principal
  doc
    .roundedRect(marginX, yStart, 495, blockH, 6)
    .strokeColor("#E0E0E0")
    .lineWidth(1)
    .stroke();

  doc.rect(marginX, yStart, 495, 20).fillColor("#F7F7F7").fill();
  doc
    .fillColor("#000")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(`${idx + 1}. Evidencia e Incumplimiento:`, marginX + 8, yStart + 5);

  const leftX = marginX + 12;
  const leftY = yStart + 28;
  let yCursor = leftY;

  // Primero: Incumplimientos asociados (todos, sin límite)
  if (normasMostradas.length) {
    const headerTxt = "Incumplimientos asociados:";
    const headerH = doc.heightOfString(headerTxt, { width: leftW });
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor("#000")
      .text(headerTxt, leftX, yCursor, { width: leftW });
    const bulletRadius = 4;
    const bulletIndent = 20;
    const itemTextWidth = leftW - bulletIndent - 4;
    let y = yCursor + headerH + 2;
    normasMostradas.forEach((n) => {
      const titulo = String(n.titulo || "").trim();
      const fuente = n.fuente ? String(n.fuente).trim() : "";
      const texto = fuente ? titulo + "  —  " + fuente : titulo;
      const h = doc.heightOfString(texto, { width: itemTextWidth, align: "left" });
      const bulletColor = severityStyle(n.clasificacion).color;
      doc.circle(leftX + 8, y + 4, bulletRadius).fillColor(bulletColor).fill();
      doc
        .fillColor("#000")
        .font("Helvetica")
        .fontSize(9)
        .text(texto, leftX + bulletIndent, y - 2, { width: itemTextWidth, height: h + 4 });
      y += h + 4;
    });
    yCursor = y + 4;
  }

  // Después: Comentario (debajo de incumplimientos)
  if (hasComentario) {
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor("#000")
      .text("Comentario:", leftX, yCursor);
    const commentH = doc.heightOfString(comentarioTxt, { width: leftW, align: "left" });
    doc
      .font("Helvetica")
      .fontSize(9)
      .text(comentarioTxt, leftX, yCursor + 10, {
        width: leftW,
        height: commentH + 4,
      });
  }

  const imgX = marginX + leftW + 2 * gap;
  const imgY = yStart + 28;
  // Mostrar una sola imagen (sin agrupamiento/grilla)
  const imgs =
    Array.isArray(images) && images.length
      ? images.filter((p) => p && fs.existsSync(p)).slice(0, 1)
      : evidencia.image_path && fs.existsSync(evidencia.image_path)
      ? [evidencia.image_path]
      : [];
  if (imgs.length) {
    try {
      // Marco general
      const effImgH = Math.min(imgH, Math.max(0, blockH - 36));
      // Imagen única ocupa todo el marco
      doc.image(imgs[0], imgX, imgY, {
        fit: [imgW, effImgH],
        align: "center",
        valign: "center",
      });
    } catch {}
  }

  return blockH; // devolver altura usada para cálculo siguiente
}

router.get(
  "/proyectos/:id/pdf",
  [
    param("id").isInt({ min: 1 }).toInt(),
    query("categoria").optional().isIn(["OK", "LEVE", "CRITICO"]),
  ],
  checkValidation,
  async (req, res) => {
    const { id } = req.params;
    const { categoria } = req.query;

    try {
      const [proyRows] = await pool.query(
        "SELECT * FROM proyectos WHERE id = ?",
        [id]
      );
      if (!proyRows || proyRows.length === 0)
        return res.status(404).json({ error: "Proyecto no encontrado" });
      const proyecto = proyRows[0];

      const [tareasRows] = await pool.query(
        "SELECT * FROM tareas WHERE proyecto_id = ?",
        [id]
      );
      const totalTareas = tareasRows.length;
      const completadas = tareasRows.filter(
        (t) => Number(t.progreso) === 100
      ).length;
      const enProgreso = tareasRows.filter(
        (t) => Number(t.progreso) > 0 && Number(t.progreso) < 100
      ).length;
      const tareasMap = Object.fromEntries(tareasRows.map((t) => [t.id, t]));

      const [fasesRows] = await pool.query(
        "SELECT * FROM fases WHERE proyecto_id = ?",
        [id]
      );

      // Evidencias para el reporte (usaremos como "fotos")
      const where = ["proyecto_id = ?"];
      const params = [id];
      if (categoria) {
        where.push("categoria = ?");
        params.push(String(categoria));
      }
      const whereSql = "WHERE " + where.join(" AND ");
      const [evidRows] = await pool.query(
        `SELECT * FROM evidencias ${whereSql} ORDER BY created_at ASC`,
        params
      );

      // Detectar evidencias especiales: PORTADA/INSTITUCION por tipo o marcador en comentario
      const isPortadaType = (ev) =>
        String(ev.evidence_type || "").toUpperCase() === "PORTADA";
      const isInstitucionType = (ev) =>
        String(ev.evidence_type || "").toUpperCase() === "INSTITUCIONAL";
      const isTagged = (ev) => /\[(INSTITUCION|PORTADA)\]/i.test(String(ev.comentario || ""));
      const isInstitucional = (ev) => isPortadaType(ev) || isInstitucionType(ev) || isTagged(ev);
      const portadaEv = evidRows.find(isPortadaType) || null;
      const institucional = portadaEv || evidRows.find(isInstitucional) || null;
      // Recopilar TODAS las imágenes institucionales para excluirlas de evidencias
      const institucionalImages = evidRows
        .filter((ev) => isInstitucional(ev))
        .map((ev) => ev.image_path)
        .filter((p) => p && fs.existsSync(p));
      const institucionalImagesSet = new Set(institucionalImages);
      const institucionalImagesSetNorm = new Set(
        institucionalImages.map((p) => normalizePath(p))
      );
      const institucionalImage =
        (portadaEv && portadaEv.image_path && fs.existsSync(portadaEv.image_path)
          ? portadaEv.image_path
          : null) ||
        (institucionalImages.length ? institucionalImages[0] : null);

      // Elegir imagen de portada: preferir evidencia con tipo PORTADA; si no, primera institucional; si no, primera normal
      const firstNormal = evidRows.find((e) => !isInstitucional(e));
      const coverImage =
        firstNormal &&
        firstNormal.image_path &&
        fs.existsSync(firstNormal.image_path)
          ? firstNormal.image_path
          : null;

      // Determinar cuál imagen se usará efectivamente en la portada
      const mainCoverPath =
        (portadaEv && portadaEv.image_path && fs.existsSync(portadaEv.image_path)
          ? portadaEv.image_path
          : null) ||
        (institucionalImage && fs.existsSync(institucionalImage)
          ? institucionalImage
          : null) ||
        (coverImage && fs.existsSync(coverImage) ? coverImage : null);

      // Asociaciones Evidencia ⇄ Normas (catálogo)
      let byEvid = {};
      if (evidRows.length) {
        const ids = evidRows.map((e) => e.id);
        const placeholders = ids.map(() => "?").join(",");
        const [links] = await pool.query(
          `SELECT enr.evidencia_id, enr.norma_repo_id, enr.clasificacion, enr.observacion,
                  nr.titulo, nr.descripcion, nr.categoria, nr.fuente
           FROM evidencias_normas_repo enr
           INNER JOIN normas_repo nr ON nr.id = enr.norma_repo_id
           WHERE enr.evidencia_id IN (${placeholders})
           ORDER BY nr.categoria, nr.titulo`,
          ids
        );
        byEvid = links.reduce((acc, r) => {
          (acc[r.evidencia_id] = acc[r.evidencia_id] || []).push(r);
          return acc;
        }, {});
      }

      // Normas asociadas
      const [normasRows] = await pool.query(
        `SELECT n.* FROM normas n INNER JOIN proyecto_normas pn ON pn.norma_id = n.id WHERE pn.proyecto_id = ? ORDER BY n.titulo`,
        [id]
      );

      // Crear PDF
      res.setHeader("Content-Type", "application/pdf");
      // Usar el indicador único (codigo del proyecto) como nombre de archivo, con fallback al ID
      const rawCode = (proyecto && proyecto.codigo) ? String(proyecto.codigo) : "";
      const safeCode = rawCode
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^A-Za-z0-9_\-]/g, "");
      const filename = safeCode
        ? `${safeCode}.pdf`
        : `reporte_proyecto_${id}.pdf`;
      res.setHeader(
        "Content-Disposition",
        `inline; filename=${filename}`
      );
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        bufferPages: true,
      });
      doc.pipe(res);

      // PORTADA (página 1)
      drawHeader(doc, proyecto.nombre, proyecto.cliente);
      drawCover(doc, proyecto, coverImage, institucionalImage);
      doc.addPage();
      // Página 2: Equipos (sin encabezado) y continuar evidencias debajo
      const nextYAfterEquipos = drawEquiposPage(doc);
      // ---- Preparación: sin agrupamiento; una evidencia por bloque ----
      function normComment(s) {
        return String(s || "")
          .replace(/^\s*\[(INSTITUCION|PORTADA)\]\s*/i, "")
          .trim();
      }
      const evidList = [];
      for (const ev of evidRows) {
        if (isInstitucional(ev)) continue; // excluir institucionales del listado
        const images = [];
        if (ev.image_path && fs.existsSync(ev.image_path)) {
          const norm = normalizePath(ev.image_path);
          if (
            !institucionalImagesSet.has(ev.image_path) &&
            !institucionalImagesSetNorm.has(norm) &&
            (!mainCoverPath || normalizePath(mainCoverPath) !== norm)
          ) {
            images.push(ev.image_path);
          }
        }
        evidList.push({
          comentario: normComment(ev.comentario),
          tareaId: ev.tarea_id || null,
          images,
          links: byEvid[ev.id] || [],
        });
      }

      // Solo crear hallazgos si hay evidencias
      if (evidList.length) {
        // Comenzar las evidencias debajo de los equipos en la página 2
        let y = nextYAfterEquipos + 2;
        for (let i = 0; i < evidList.length; i++) {
          const g = evidList[i];
          // Calcular altura estimada antes de dibujar para decidir salto
          const textoWidth = 495 - 200 - 30;
          const comentarioHeight = doc.heightOfString(g.comentario || "Sin comentario", { width: textoWidth });
          const normasHeight = (g.links || []).reduce((acc, n) => {
            const texto = ` ${n.titulo}${n.fuente ? " — " + n.fuente : ""}`;
            const h = doc.heightOfString(texto, { width: textoWidth - 24, align: "left" });
            return acc + h + 4;
          }, 0) + (g.links && g.links.length ? 18 : 0);
          const footerReserve = 28;
          const pageBottomY = doc.page.height - doc.page.margins.bottom - footerReserve;
          const contentHeight = 28 + normasHeight + (comentarioHeight + 14) + 12;
          const estimatedHeight = Math.max(contentHeight, 115 + 36);
          if (y + estimatedHeight > pageBottomY) {
            doc.addPage();
            drawVerificadorBlock(doc);
            y = PAGE_CONTENT_TOP;
          }
          const usedH = drawFinding(
            doc,
            i,
            { comentario: g.comentario, tarea_id: g.tareaId },
            y,
            g.links,
            g.images.slice(0, 1)
          );
          y += usedH + 8;
        }
      }

      // Añadir número de página en el pie de cada página (sobre las ya creadas, sin crear nuevas)
      const pageRange = doc.bufferedPageRange();
      for (let i = 0; i < pageRange.count; i++) {
        doc.switchToPage(i);
        const pageHeight = doc.page.height;
        const marginBottom = 50;
        const footerY = pageHeight - marginBottom - 10;
        const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        doc.save();
        doc
          .font("Helvetica-Bold")
          .fontSize(12)
          .fillColor("#000")
          .text(String(i + 1), doc.page.margins.left, footerY, {
            width: w,
            align: "right",
            lineBreak: false,
            height: 14,
          });
        doc.restore();
      }

      doc.end();
    } catch (err) {
      console.error("reporte proyecto error:", err);
      res.status(500).json({ error: "Error generando reporte" });
    }
  }
);

module.exports = router;
