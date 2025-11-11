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
    path.join(process.cwd(), "frontend", "public", "logo.png"),
    path.join(process.cwd(), "frontend", "public", "logoapp.png"),
    path.join(__dirname, "..", "..", "frontend", "public", "logo.png"),
    path.join(__dirname, "..", "..", "frontend", "public", "logoapp.png"),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  return null;
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
    .moveTo(50, 40)
    .lineTo(545, 40)
    .stroke();
  // Título
  doc
    .fillColor("#000")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text("REPORTE FOTOGRÁFICO", 50, 50, { align: "left" });
  // Subtítulo a la derecha (proyecto / cliente)
  const rightText = [proyectoNombre, clienteNombre]
    .filter(Boolean)
    .join("  ·  ");
  if (rightText)
    doc
      .font("Helvetica")
      .fontSize(10)
      .text(rightText, 300, 55, { width: 245, align: "right" });
  doc.restore();
}

function drawFooter(doc, currentPage, totalPages) {
  doc.save();
  doc
    .fontSize(9)
    .fillColor("#666")
    .text(
      `Página ${currentPage} de ${
        totalPages || doc.page.document._root.data.Pages.data.Count || ""
      }`,
      50,
      800,
      { width: 495, align: "right" }
    );
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
  // Header con logo alineado a la derecha
  const logo = getLogoPath();
  if (logo) {
    try {
      doc.image(logo, 460, 55, { width: 80 });
    } catch {}
  }
  // Quitar sello superior: usaremos la imagen institucional como foto principal de portada
  doc.moveDown(1.2);
  // Encabezados de establecimiento centrados
  const centerX = 50;
  const centerW = 495;
  const headStartY = 95;
  let cy = headStartY;
  function heading(label, value) {
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#444")
      .text(label, centerX, cy, { width: centerW, align: "center" });
    cy += 14;
    doc
      .font("Helvetica")
      .fontSize(13)
      .fillColor("#000")
      .text(String(value || ""), centerX, cy, {
        width: centerW,
        align: "center",
      });
    cy += 20; // spacing after value
  }
  heading("NOMBRE DE ESTABLECIMIENTO", proyecto.nombre);
  heading("RAZON SOCIAL", proyecto.cliente);
  heading("CEDULA JURIDICA", proyecto.cedula_juridica);
  // línea divisoria sutil
  doc
    .moveTo(centerX + 40, cy)
    .lineTo(centerX + centerW - 40, cy)
    .strokeColor("#d3d3d3")
    .lineWidth(1)
    .stroke();
  cy += 15;

  // Foto de portada (usar institucional si existe, si no la primera normal)
  const imgY = 205;
  const imgX = 250; // mover un poco más a la derecha para liberar espacio a la izquierda
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
      // sombra ligera simulada
      doc
        .rect(imgX + 2, imgY + 2, imgW, imgH)
        .fillColor("#f0f0f0")
        .fill();
      doc
        .roundedRect(imgX, imgY, imgW, imgH, 6)
        .strokeColor("#c9c9c9")
        .lineWidth(1)
        .stroke();
      doc.image(mainCover, imgX + 4, imgY + 4, {
        fit: [imgW - 8, imgH - 8],
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

  const fechaVerif = formatFechaInforme(
    proyecto.fecha_verificacion
      ? new Date(proyecto.fecha_verificacion)
      : proyecto.fecha_inicio
      ? new Date(proyecto.fecha_inicio)
      : new Date()
  );
  const fechaInforme = formatFechaInforme(new Date());
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

function drawFinding(
  doc,
  idx,
  evidencia,
  tareaNombre,
  yStart,
  linkedNormas,
  images
) {
  const marginX = 50;
  // Altura extendida para poder colocar varias fotos
  const blockH = 260;
  const imgW = 200; // zona de imágenes a la derecha
  const imgH = 200;
  const gap = 10;
  // La severidad se muestra por incumplimiento, no a nivel de evidencia

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
    .text(`Evidencia ${idx + 1}`, marginX + 8, yStart + 6);
  // Sin badge global; el estado se mostrará para cada incumplimiento

  // Columna izquierda: tarea y comentario
  const leftX = marginX + 12;
  const leftY = yStart + 32;
  const leftW = 495 - imgW - 3 * gap;
  doc
    .fillColor("#333")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Tarea:", leftX, leftY);
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(tareaNombre || "Sin tarea asociada", leftX + 45, leftY, {
      width: leftW - 45,
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Comentario:", leftX, leftY + 18);
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(evidencia.comentario || "Sin comentario", leftX, leftY + 32, {
      width: leftW,
    });

  // Listado de normas/incumplimientos asociados
  if (Array.isArray(linkedNormas) && linkedNormas.length) {
    doc.moveDown(0.3);
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("Incumplimientos asociados:", leftX, doc.y, { width: leftW });
    const startY = doc.y + 2;
    let y = startY;
    linkedNormas.slice(0, 6).forEach((n) => {
      const color = severityStyle(n.clasificacion || "LEVE").color;
      // marcador de color
      doc
        .rect(leftX, y + 3, 6, 6)
        .fillColor(color)
        .fill();
      doc
        .fillColor("#000")
        .font("Helvetica")
        .fontSize(9)
        .text(
          ` ${n.titulo}${n.fuente ? " — " + n.fuente : ""}`,
          leftX + 10,
          y,
          {
            width: leftW - 12,
          }
        );
      y += 14;
    });
    if (linkedNormas.length > 6) {
      doc
        .fillColor("#666")
        .fontSize(9)
        .text(`… y ${linkedNormas.length - 6} más`, leftX, y, { width: leftW });
    }
  }

  // Columna derecha: una o más imágenes
  const imgX = marginX + leftW + 2 * gap;
  const imgY = yStart + 32;
  const imgs =
    Array.isArray(images) && images.length
      ? images.filter((p) => p && fs.existsSync(p))
      : evidencia.image_path && fs.existsSync(evidencia.image_path)
      ? [evidencia.image_path]
      : [];
  if (imgs.length) {
    try {
      // Marco general
      doc
        .rect(imgX - 2, imgY - 2, imgW + 4, imgH + 4)
        .strokeColor("#DDD")
        .stroke();
      // Distribución: hasta 3 imágenes en rejilla 2x2
      // - 1 imagen: ocupa todo
      // - 2-3 imágenes: dos arriba, una abajo centrada
      if (imgs.length === 1) {
        doc.image(imgs[0], imgX, imgY, {
          fit: [imgW, imgH],
          align: "center",
          valign: "center",
        });
      } else {
        const pad = 6;
        const cellW = (imgW - pad) / 2;
        const cellH = (imgH - pad) / 2;
        // fila 1
        doc.image(imgs[0], imgX + 0, imgY + 0, {
          fit: [cellW, cellH],
          align: "center",
          valign: "center",
        });
        if (imgs[1])
          doc.image(imgs[1], imgX + cellW + pad, imgY + 0, {
            fit: [cellW, cellH],
            align: "center",
            valign: "center",
          });
        // fila 2
        if (imgs[2]) {
          // centrada abajo
          const cx = imgX + (imgW - cellW) / 2;
          doc.image(imgs[2], cx, imgY + cellH + pad, {
            fit: [cellW, cellH],
            align: "center",
            valign: "center",
          });
        } else if (imgs.length === 2) {
          // reusar la 1ra en grande si quieres dejar vacío; mejor nada
        }
      }
    } catch {}
  }
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

      // Detectar evidencia institucional (comentario con marcador)
      const isInstitucional = (ev) =>
        /\[(INSTITUCION|PORTADA)\]/i.test(String(ev.comentario || ""));
      const institucional = evidRows.find(isInstitucional) || null;
      const institucionalImage =
        institucional &&
        institucional.image_path &&
        fs.existsSync(institucional.image_path)
          ? institucional.image_path
          : null;

      // Elegir imagen de portada (primera evidencia no institucional)
      const firstNormal = evidRows.find((e) => !isInstitucional(e));
      const coverImage =
        firstNormal &&
        firstNormal.image_path &&
        fs.existsSync(firstNormal.image_path)
          ? firstNormal.image_path
          : null;

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
      res.setHeader(
        "Content-Disposition",
        `inline; filename=reporte_proyecto_${id}.pdf`
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

      // PÁGINAS DE HALLAZGOS (EVIDENCIAS)
      // Agrupar evidencias por (tareaId + comentario) para permitir múltiples fotos por evidencia
      function normComment(s) {
        return String(s || "")
          .replace(/^\s*\[(INSTITUCION|PORTADA)\]\s*/i, "")
          .trim();
      }
      const groups = [];
      const gmap = new Map();
      for (const ev of evidRows) {
        if (isInstitucional(ev)) continue; // no mostrar la institucional en el listado
        const key = `${ev.tarea_id || 0}|${normComment(ev.comentario)}`;
        if (!gmap.has(key)) {
          gmap.set(key, {
            tareaId: ev.tarea_id || null,
            comentario: normComment(ev.comentario),
            images: [],
            evidIds: [],
          });
          groups.push(gmap.get(key));
        }
        const g = gmap.get(key);
        g.evidIds.push(ev.id);
        if (ev.image_path && fs.existsSync(ev.image_path))
          g.images.push(ev.image_path);
      }

      // Vincular normas combinadas por grupo
      const linkedByEvid = byEvid; // ya cargado
      const groupsWithLinks = groups.map((g) => {
        const links = [];
        const seen = new Set();
        for (const id of g.evidIds) {
          for (const l of linkedByEvid[id] || []) {
            const k = `${l.norma_repo_id}|${l.clasificacion}`;
            if (seen.has(k)) continue;
            seen.add(k);
            links.push(l);
          }
        }
        return { ...g, links };
      });

      let y = Math.max(doc.y + 10, 120);
      for (let i = 0; i < groupsWithLinks.length; i++) {
        const g = groupsWithLinks[i];
        // Si no hay espacio, nueva página
        if (y > 700) {
          doc.addPage();
          drawHeader(doc, proyecto.nombre, proyecto.cliente);
          y = 120;
        }
        drawFinding(
          doc,
          i,
          { comentario: g.comentario, tarea_id: g.tareaId },
          g.tareaId ? tareasMap[g.tareaId]?.nombre : null,
          y,
          g.links,
          g.images.slice(0, 3)
        );
        y += 310; // espacio entre bloques acorde a altura
      }

      // Numeración de páginas (footer)
      const range = doc.bufferedPageRange(); // { start, count }
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        drawFooter(doc, i + 1, range.count);
      }

      doc.end();
    } catch (err) {
      console.error("reporte proyecto error:", err);
      res.status(500).json({ error: "Error generando reporte" });
    }
  }
);

module.exports = router;
