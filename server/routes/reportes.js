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

function drawLegend(doc, y) {
  const items = [
    { label: "OK", color: "#388E3C" },
    { label: "Leve", color: "#FFA000" },
    { label: "Crítico", color: "#D32F2F" },
  ];
  let x = 50;
  items.forEach((it) => {
    doc.rect(x, y, 8, 8).fillColor(it.color).fill();
    doc
      .fillColor("#000")
      .fontSize(9)
      .text(` ${it.label}`, x + 11, y - 2);
    x += 70;
  });
}

function drawCover(doc, proyecto, coverImagePath) {
  // Header con logo alineado a la derecha
  const logo = getLogoPath();
  if (logo) {
    try {
      doc.image(logo, 460, 55, { width: 80 });
    } catch {}
  }
  doc.moveDown(1.2);
  // Caja de datos del proyecto
  const boxY = 120;
  doc
    .roundedRect(50, boxY, 495, 90, 6)
    .strokeColor("#CCC")
    .lineWidth(1)
    .stroke();
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("NOMBRE DEL PROYECTO:", 60, boxY + 10);
  doc
    .font("Helvetica")
    .text(String(proyecto.nombre || ""), 200, boxY + 10, { width: 330 });
  doc.font("Helvetica-Bold").text("CLIENTE:", 60, boxY + 30);
  doc
    .font("Helvetica")
    .text(String(proyecto.cliente || ""), 200, boxY + 30, { width: 330 });
  doc.font("Helvetica-Bold").text("RANGO DE FECHAS:", 60, boxY + 50);
  const rango = [proyecto.fecha_inicio || "", proyecto.fecha_fin || ""]
    .filter(Boolean)
    .join("  —  ");
  doc
    .font("Helvetica")
    .text(rango || "No definido", 200, boxY + 50, { width: 330 });

  // Foto de portada (si existe una evidencia)
  const imgY = boxY + 110;
  if (coverImagePath && fs.existsSync(coverImagePath)) {
    try {
      doc.rect(50, imgY, 495, 250).strokeColor("#DDD").stroke();
      doc.image(coverImagePath, 50, imgY, {
        fit: [495, 250],
        align: "center",
        valign: "center",
      });
    } catch {}
  }

  // Nota y leyenda
  const noteY = imgY + 260;
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#000")
    .text("NOTA:", 50, noteY);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#333")
    .text(
      "Las imágenes incluidas en este reporte corresponden a hallazgos documentados durante la inspección y están categorizadas por nivel de criticidad.",
      90,
      noteY,
      { width: 455 }
    );
  drawLegend(doc, noteY + 22);
}

function drawFinding(doc, idx, evidencia, tareaNombre, yStart, linkedNormas) {
  const marginX = 50;
  const blockH = 180;
  const imgW = 180; // imagen a la derecha
  const imgH = 120;
  const gap = 10;
  const spec = severityStyle(evidencia.categoria);

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
  // Badge de categoría a la derecha
  const badgeX = marginX + 495 - 58;
  doc
    .rect(badgeX, yStart + 6, 10, 10)
    .fillColor(spec.color)
    .fill();
  doc
    .fillColor("#000")
    .font("Helvetica")
    .fontSize(10)
    .text(spec.label, badgeX + 14, yStart + 4, { width: 40, align: "left" });

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
      const color = severityStyle(n.clasificacion || evidencia.categoria).color;
      // marcador de color
      doc.rect(leftX, y + 3, 6, 6).fillColor(color).fill();
      doc
        .fillColor("#000")
        .font("Helvetica")
        .fontSize(9)
        .text(` ${n.titulo}${n.fuente ? " — " + n.fuente : ""}`, leftX + 10, y, {
          width: leftW - 12,
        });
      y += 14;
    });
    if (linkedNormas.length > 6) {
      doc
        .fillColor("#666")
        .fontSize(9)
        .text(`… y ${linkedNormas.length - 6} más`, leftX, y, { width: leftW });
    }
  }

  // Columna derecha: imagen
  const imgX = marginX + leftW + 2 * gap;
  const imgY = yStart + 32;
  if (evidencia.image_path && fs.existsSync(evidencia.image_path)) {
    try {
      doc
        .rect(imgX - 2, imgY - 2, imgW + 4, imgH + 4)
        .strokeColor("#DDD")
        .stroke();
      doc.image(evidencia.image_path, imgX, imgY, {
        fit: [imgW, imgH],
        align: "center",
        valign: "center",
      });
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

      const coverImage =
        evidRows[0]?.image_path && fs.existsSync(evidRows[0].image_path)
          ? evidRows[0].image_path
          : null;

      // Asociaciones Evidencia ⇄ Normas (catálogo)
      let byEvid = {};
      if (evidRows.length) {
        const ids = evidRows.map((e) => e.id);
        const placeholders = ids.map(() => '?').join(',');
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
      drawCover(doc, proyecto, coverImage);
      doc.addPage();

      // PÁGINA 2: Resumen + Normas
      drawHeader(doc, proyecto.nombre, proyecto.cliente);
      doc
        .font("Helvetica-Bold")
        .fontSize(14)
        .text("Resumen del Proyecto", 50, 90);
      doc.moveDown(0.5);
      doc
        .font("Helvetica")
        .fontSize(11)
        .list(
          [
            `Tareas totales: ${totalTareas}`,
            `Tareas completadas: ${completadas}`,
            `Tareas en progreso: ${enProgreso}`,
          ],
          60
        );
      doc.moveDown(1);
      doc
        .font("Helvetica-Bold")
        .fontSize(14)
        .text("Fases", { underline: true });
      if (fasesRows.length === 0) {
        doc.font("Helvetica").fontSize(11).text("Sin fases configuradas");
      } else {
        fasesRows.forEach((f) =>
          doc.font("Helvetica").fontSize(11).text(`• ${f.nombre}: ${f.estado}`)
        );
      }
      doc.moveDown(1);
      doc
        .font("Helvetica-Bold")
        .fontSize(14)
        .text("Normas asociadas", { underline: true });
      if (!normasRows || normasRows.length === 0) {
        doc.font("Helvetica").fontSize(11).text("No hay normas asociadas");
      } else {
        normasRows.forEach((n) =>
          doc
            .font("Helvetica")
            .fontSize(11)
            .text(`• ${n.titulo}${n.etiquetas ? " (" + n.etiquetas + ")" : ""}`)
        );
      }

      // PÁGINAS DE HALLAZGOS (EVIDENCIAS)
      let y = Math.max(doc.y + 10, 120);
      const perPage = 2;
      for (let i = 0; i < evidRows.length; i++) {
        const ev = evidRows[i];
        // Si no hay espacio, nueva página
        if (y > 700) {
          doc.addPage();
          drawHeader(doc, proyecto.nombre, proyecto.cliente);
          y = 120;
        }
        const linked = byEvid[ev.id] || [];
        drawFinding(
          doc,
          i,
          ev,
          ev.tarea_id ? tareasMap[ev.tarea_id]?.nombre : null,
          y,
          linked
        );
        y += 230; // espacio entre bloques
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
