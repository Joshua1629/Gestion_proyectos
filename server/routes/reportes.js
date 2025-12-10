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
  // Logo empresa en esquina superior izquierda (sobre el título)
  const logo = getLogoPath();
  if (logo) {
    try {
      doc.image(logo, 50, 2, { width: 70 });
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
  const y = Math.max(0, pageHeight - 30); // 30pt desde el borde inferior
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
  // Extraer partes y construir una fecha UTC estable
  let y, m, d;
  if (typeof value === "string") {
    const mLoc = value.match(/^\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\s*$/);
    if (mLoc) {
      d = Number(mLoc[1]);
      m = Number(mLoc[2]) - 1;
      y = Number(mLoc[3]);
    } else {
      const mIso = value.match(/^\s*(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?\s*$/);
      if (mIso) {
        y = Number(mIso[1]);
        m = Number(mIso[2]) - 1;
        d = Number(mIso[3]);
      }
    }
  } else if (value instanceof Date) {
    y = value.getFullYear();
    m = value.getMonth();
    d = value.getDate();
  } else if (typeof value === "number") {
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
  let cy = headStartY;
  function heading(label, value) {
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#444")
      .text(label, leftX, cy, { width: 300, align: "left" });
    cy += 14;
    doc
      .font("Helvetica")
      .fontSize(13)
      .fillColor("#000")
      .text(String(value || ""), leftX, cy, { width: 300, align: "left" });
    cy += 20; // spacing after value
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

  // Foto de portada (usar institucional si existe, si no la primera normal)
  const imgY = 240; // bajar más la imagen de portada
  const imgX = 260; // mantener hacia la derecha para dejar espacio a la izquierda
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
  const leftBoxY = 205;
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
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#000")
    .text("Ing. Luis Javier Jiménez Fernández", leftBoxX + 12, ly, {
      width: leftBoxW - 24,
    });
  ly += 26;
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

// Página 2: Equipos de Seguridad y Verificación
function drawEquiposPage(doc) {
  const marginX = 50;
  const fullW = 495;
  const boxW = fullW; // una columna, dos cajas apiladas
  let y = 50; // posición inicial más arriba

  function drawListBox(title, items, splitOnlyForRecommendation = false) {
    const lineH = 14; // altura de renglón compacta
    // Calcular altura considerando que el texto entre paréntesis va en una segunda línea
    const totalLines = items.reduce((acc, t) => {
      const lower = String(t || "").toLowerCase();
      const hasParen = /\(.+\)/.test(lower);
      const isRecommendation = lower.includes("(se recomienda al menos 75% algodón)");
      const shouldSplit = splitOnlyForRecommendation ? isRecommendation : hasParen;
      return acc + (shouldSplit ? 2 : 1);
    }, 0);
    const boxH = 14 + totalLines * lineH + 8; // padding reducido
    doc
      .roundedRect(marginX, y, boxW, boxH, 6)
      .strokeColor("#CFCFCF")
      .lineWidth(1)
      .stroke();

    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#000")
      .text(title, marginX + 10, y + 6);

    let ly = y + 18;
    items.forEach((t) => {
      const text = String(t || "");
      const lower = text.toLowerCase();
      const isRecommendation = lower.includes("(se recomienda al menos 75% algodón)");
      let firstLine = text;
      let secondLine = null;
      if (splitOnlyForRecommendation && isRecommendation) {
        const idx = lower.indexOf("(se recomienda al menos 75% algodón)");
        firstLine = text.slice(0, idx).trimEnd();
        secondLine = text.slice(idx).trim();
      } else if (!splitOnlyForRecommendation) {
        const m = text.match(/^(.*?)(\s*\(.*\))\s*$/);
        if (m) {
          firstLine = m[1];
          secondLine = m[2];
        }
      }
      // punto verde para la primera línea del ítem
      doc
        .circle(marginX + 12, ly + 3, 4)
        .fillColor("#43A047")
        .fill();
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#000")
        .text(firstLine, marginX + 26, ly - 2, { width: boxW - 36 });
      ly += lineH;
      // Si existe texto entre paréntesis, dibujarlo en el renglón siguiente sin viñeta
      if (secondLine) {
        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor("#000")
          .text(secondLine, marginX + 26, ly - 2, { width: boxW - 36 });
        ly += lineH;
      }
    });

    y += boxH + 6; // espacio reducido entre cajas
  }

  drawListBox("Equipos de Seguridad:", [
    "Zapatos de seguridad (Dieléctricos).",
    "Chaleco reflectivo.",
    "Camisa de algodón de manga y pantalón largo (se recomienda al menos 75% algodón).",
    "Guantes (cuando se considere necesario).",
    "Casco.",
    "Lentes (cuando se considere necesario).",
  ], true);

  drawListBox("Equipos de Verificación:", [
    "Telurómetro de gancho.",
    "Cinta métrica laser.",
    "Multímetro de gancho.",
    "Desatornilladores aislados.",
    "Llave Ratchet 12 mm (1/2\") y 9,95 mm (3/8\").",
    "Cámara Térmica.",
  ]);

  // devolver la posición siguiente disponible para continuar contenido
  return y;
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
  // Altura se calcula dinámicamente según comentario y número de normas
  const imgW = 200; // zona de imágenes a la derecha
  const imgH = 150; // reducido para 3 evidencias por hoja
  const gap = 10;
  // La severidad se muestra por incumplimiento, no a nivel de evidencia

  // Calcular alturas de texto
  const leftW = 495 - imgW - 3 * gap;
  const comentarioRaw = evidencia.comentario || "";
  const comentarioTxt = String(comentarioRaw).trim();
  const hasComentario = comentarioTxt.length > 0;
  const comentarioHeight = hasComentario
    ? doc.heightOfString(comentarioTxt, { width: leftW, align: "left" }) + 18 // +18 para label "Comentario:" y espaciado
    : 0;
  const normasMostradas = Array.isArray(linkedNormas)
    ? linkedNormas.slice(0, 6)
    : [];
  // Calcular altura real de normas considerando el alto de cada texto
  const normasHeight = normasMostradas.reduce((acc, n) => {
    const texto = ` ${n.titulo}${n.fuente ? " — " + n.fuente : ""}`;
    const h = doc.heightOfString(texto, { width: leftW - 12, align: "left" });
    return acc + h + 6;
  }, 0) + (normasMostradas.length ? 22 : 0); // 22 ~ título header + margen
  // Altura dinámica: solo lo necesario para el contenido (incluye comentario completo + normas completas)
  const contentHeight = 32 + comentarioHeight + normasHeight + 20; // header + comentario + normas + padding extra
  let blockH = Math.max(contentHeight, imgH + 40); // al menos el tamaño de la imagen
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

  // Encabezado del hallazgo
  doc.rect(marginX, yStart, 495, 22).fillColor("#F7F7F7").fill();
  doc
    .fillColor("#000")
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(`Evidencia e Incumplimiento:`, marginX + 8, yStart + 6);
  // Sin badge global; el estado se mostrará para cada incumplimiento

  // Columna izquierda: comentario (se elimina 'Tarea' del reporte)
  const leftX = marginX + 12;
  const leftY = yStart + 32;
  let yCursor = leftY;
  if (hasComentario) {
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .text("Comentario:", leftX, yCursor);
    // Usar la altura completa del comentario sin recortar
    const commentH = doc.heightOfString(comentarioTxt, { width: leftW, align: "left" });
    doc
      .font("Helvetica")
      .fontSize(9)
      .text(comentarioTxt, leftX, yCursor + 12, {
        width: leftW,
      });
    yCursor += 12 + commentH + 6;
  }

  // Listado de normas/incumplimientos asociados
  if (normasMostradas.length) {
    const headerTxt = "Incumplimientos asociados:";
    const headerH = doc.heightOfString(headerTxt, { width: leftW });
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#000")
      .text(headerTxt, leftX, yCursor, { width: leftW });
    let y = yCursor + headerH + 2;
    // Dibujar TODAS las normas mostradas sin verificar límite (ya se calculó el espacio necesario)
    normasMostradas.forEach((n) => {
      const color = severityStyle(n.clasificacion || "LEVE").color;
      const texto = ` ${n.titulo}${n.fuente ? " — " + n.fuente : ""}`;
      const itemWidth = leftW - 12;
      const h = doc.heightOfString(texto, { width: itemWidth, align: "left" });
      // marcador tipo "bullet" redondo más notorio
      doc
        .circle(leftX + 3, y + 6, 4)
        .fillColor(color)
        .fill();
      doc
        .fillColor("#000")
        .font("Helvetica")
        .fontSize(10)
        .text(texto, leftX + 12, y - 2, { width: itemWidth });
      y += h + 6; // avanzar según el alto real del texto
    });
    if (linkedNormas.length > normasMostradas.length) {
      doc
        .fillColor("#666")
        .fontSize(9)
        .text(`… y ${linkedNormas.length - normasMostradas.length} más`, leftX, y, { width: leftW });
    }
  }

  // Columna derecha: una o más imágenes
  const imgX = marginX + leftW + 2 * gap;
  const imgY = yStart + 32;
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
      const effImgH = Math.min(imgH, Math.max(0, blockH - 40));
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

      // PORTADA
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
        let y = nextYAfterEquipos + 5; // espacio mínimo después de equipos
        for (let i = 0; i < evidList.length; i++) {
          const g = evidList[i];
          // Calcular altura estimada antes de dibujar para decidir salto
          const textoWidth = 495 - 200 - 30; // ancho leftW (495 total - imgW - 3*gap)
          const comentarioHeight = doc.heightOfString(g.comentario || "Sin comentario", { width: textoWidth });
          const normasCount = Math.min(g.links.length, 6);
          // Estimar altura de normas más precisa
          const normasHeight = g.links.slice(0, 6).reduce((acc, n) => {
            const texto = ` ${n.titulo}${n.fuente ? " — " + n.fuente : ""}`;
            const h = doc.heightOfString(texto, { width: textoWidth - 12, align: "left" });
            return acc + h + 6;
          }, 0) + (normasCount ? 22 : 0);
          const pageBottomY = doc.page.height - doc.page.margins.bottom - 10;
          // Altura dinámica basada en contenido real
          const contentHeight = 32 + comentarioHeight + normasHeight + 15;
          const estimatedHeight = Math.max(contentHeight, 150 + 40);
          // Usar el límite real de la página (A4 = 841pt, con margen 50 = 791pt útiles)
          if (y + estimatedHeight > pageBottomY) {
            doc.addPage();
            y = 50; // empezar más arriba en páginas nuevas
          }
          const usedH = drawFinding(
            doc,
            i,
            { comentario: g.comentario, tarea_id: g.tareaId },
            y,
            g.links,
            g.images.slice(0, 1)
          );
          y += usedH + 15; // separación reducida para 3 evidencias por hoja
        }
      }
      // Numeración de páginas (footer)
   
      doc.end();
    } catch (err) {
      console.error("reporte proyecto error:", err);
      res.status(500).json({ error: "Error generando reporte" });
    }
  }
);

module.exports = router;
