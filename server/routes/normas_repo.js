const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { body, param, query, validationResult } = require("express-validator");
const pool = require("../models/db");
const PDFDocument = require("pdfkit");
let XLSX = null;
try {
  XLSX = require("xlsx");
} catch {}
let sharp = null;
try {
  sharp = require("sharp");
} catch {}

const router = express.Router();
const { optionalAuth, requireRole } = require("../middleware/auth");
const { getUploadsBase } = require("../lib/userDataPath");

const checkValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });
  next();
};

function ensureUploadsDir() {
  const base = getUploadsBase();
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function buildPublicUrl(absPath) {
  const base = getUploadsBase();
  const rel = path.relative(base, absPath).replace(/\\/g, "/");
  return `/uploads/${rel}`;
}

// Intentar localizar un logo de empresa para incrustar en reportes
function getCompanyLogoPath() {
  const candidates = [];
  if (process.env.COMPANY_LOGO) candidates.push(process.env.COMPANY_LOGO);
  // Posibles ubicaciones comunes
  candidates.push(
    path.join(process.cwd(), "frontend", "public", "logo.png"),
    path.join(process.cwd(), "frontend", "public", "logoapp.png"),
    path.join(__dirname, "..", "..", "frontend", "public", "logo.png"),
    path.join(__dirname, "..", "..", "frontend", "public", "logoapp.png"),
    path.join(__dirname, "..", "..", "public", "logo.png"),
    path.join(ensureUploadsDir(), "logo.png"),
    // Rutas de producción (Electron empaquetado)
    process.resourcesPath ? path.join(process.resourcesPath, "app.asar.unpacked", "frontend", "public", "logo.png") : null,
    process.resourcesPath ? path.join(process.resourcesPath, "app.asar.unpacked", "frontend", "public", "logoapp.png") : null,
    process.resourcesPath ? path.join(process.resourcesPath, "app.asar", "frontend", "public", "logo.png") : null,
    process.resourcesPath ? path.join(process.resourcesPath, "app.asar", "frontend", "public", "logoapp.png") : null,
    process.resourcesPath ? path.join(process.resourcesPath, "logo.png") : null,
    process.resourcesPath ? path.join(process.resourcesPath, "logoapp.png") : null,
  );
  
  // Filtrar valores null/undefined
  const filteredCandidates = candidates.filter(Boolean);
  
  for (const p of filteredCandidates) {
    try {
      if (p && fs.existsSync(p)) {
        console.log(`✅ Logo encontrado en: ${p}`);
        return p;
      }
    } catch {}
  }
  console.warn("⚠️ Logo no encontrado en ninguna ruta");
  return null;
}

// Storage for Excel imports
const excelStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const base = ensureUploadsDir();
    const now = new Date();
    const dir = path.join(
      base,
      "normas_repo",
      "imports",
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, "0")
    );
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || ".xlsx";
    const unique =
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    cb(null, unique + ext);
  },
});
function excelFilter(req, file, cb) {
  const ok =
    [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/octet-stream",
    ].includes(file.mimetype) ||
    file.originalname.endsWith(".xlsx") ||
    file.originalname.endsWith(".csv");
  if (!ok) return cb(new Error("Formato no soportado (esperado .xlsx o .csv)"));
  cb(null, true);
}
const excelUpload = multer({
  storage: excelStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: excelFilter,
});

// Storage for evidencias (images)
const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const now = new Date();
    const dir = path.join(
      getUploadsBase(),
      "evidencias_normas",
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, "0")
    );
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext =
      path.extname(file.originalname) ||
      (file.mimetype === "image/png"
        ? ".png"
        : file.mimetype === "image/webp"
        ? ".webp"
        : ".jpg");
    const unique =
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    cb(null, unique + ext);
  },
});
function imageFilter(req, file, cb) {
  const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
  if (!ok) return cb(new Error("Tipo de imagen no permitido (jpeg/png/webp)"));
  cb(null, true);
}
const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFilter,
});

// Helpers de importación
function normalizeHeader(h) {
  return String(h || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar tildes
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim();
}

async function upsertNormaRepo(row) {
  const fields = [
    "codigo",
    "titulo",
    "descripcion",
    "categoria",
    "subcategoria",
    "incumplimiento",
    "severidad",
    "etiquetas",
    "fuente",
  ];
  // no upsert by codigo if missing
  if (row.codigo) {
    const [rows] = await pool.query(
      "SELECT id FROM normas_repo WHERE codigo = ?",
      [row.codigo]
    );
    if (rows && rows.length > 0) {
      const id = rows[0].id;
      await pool.query(
        "UPDATE normas_repo SET titulo = COALESCE(?, titulo), descripcion = COALESCE(?, descripcion), categoria = COALESCE(?, categoria), subcategoria = COALESCE(?, subcategoria), incumplimiento = COALESCE(?, incumplimiento), severidad = COALESCE(?, severidad), etiquetas = COALESCE(?, etiquetas), fuente = COALESCE(?, fuente), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [
          row.titulo || null,
          row.descripcion || null,
          row.categoria || null,
          row.subcategoria || null,
          row.incumplimiento || null,
          row.severidad || null,
          row.etiquetas || null,
          row.fuente || null,
          id,
        ]
      );
      return { id, updated: true };
    }
  }
  // Si no hay codigo, intentar upsert por combinación (titulo+categoria+subcategoria+fuente)
  if (!row.codigo && row.titulo) {
    const keyParams = [
      row.titulo?.trim() || null,
      row.categoria?.trim() || null,
      row.subcategoria?.trim() || null,
      row.fuente?.trim() || null,
    ];
    const [rows2] = await pool.query(
      'SELECT id FROM normas_repo WHERE titulo = ? AND COALESCE(categoria,"") = COALESCE(?,"") AND COALESCE(subcategoria,"") = COALESCE(?,"") AND COALESCE(fuente,"") = COALESCE(?,"")',
      keyParams
    );
    if (rows2 && rows2.length > 0) {
      const id = rows2[0].id;
      await pool.query(
        "UPDATE normas_repo SET titulo = COALESCE(?, titulo), descripcion = COALESCE(?, descripcion), categoria = COALESCE(?, categoria), subcategoria = COALESCE(?, subcategoria), incumplimiento = COALESCE(?, incumplimiento), severidad = COALESCE(?, severidad), etiquetas = COALESCE(?, etiquetas), fuente = COALESCE(?, fuente), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [
          row.titulo || null,
          row.descripcion || null,
          row.categoria || null,
          row.subcategoria || null,
          row.incumplimiento || null,
          row.severidad || null,
          row.etiquetas || null,
          row.fuente || null,
          rows2[0].id,
        ]
      );
      return { id, updated: true };
    }
    // Emparejar por titulo+fuente normalizados (trim + minúsculas) para conservar id y enlaces al subir Excel modificado
    const tituloNorm = (row.titulo || "").trim().toLowerCase();
    const fuenteNorm = (row.fuente || "").trim().toLowerCase();
    if (tituloNorm) {
      const [rows3] = await pool.query(
        "SELECT id FROM normas_repo WHERE LOWER(TRIM(COALESCE(titulo,''))) = ? AND LOWER(TRIM(COALESCE(fuente,''))) = ? LIMIT 1",
        [tituloNorm, fuenteNorm]
      );
      if (rows3 && rows3.length > 0) {
        const id = rows3[0].id;
        await pool.query(
          "UPDATE normas_repo SET codigo = COALESCE(?, codigo), titulo = ?, descripcion = COALESCE(?, descripcion), categoria = COALESCE(?, categoria), subcategoria = COALESCE(?, subcategoria), incumplimiento = COALESCE(?, incumplimiento), severidad = COALESCE(?, severidad), etiquetas = COALESCE(?, etiquetas), fuente = COALESCE(?, fuente), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [
            row.codigo || null,
            row.titulo != null ? String(row.titulo).trim() : null,
            row.descripcion || null,
            row.categoria || null,
            row.subcategoria || null,
            row.incumplimiento || null,
            row.severidad || null,
            row.etiquetas || null,
            row.fuente != null ? String(row.fuente).trim() : null,
            id,
          ]
        );
        return { id, updated: true };
      }
    }
  }
  const [result] = await pool.query(
    "INSERT INTO normas_repo (codigo, titulo, descripcion, categoria, subcategoria, incumplimiento, severidad, etiquetas, fuente) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ",
    [
      row.codigo || null,
      row.titulo,
      row.descripcion || null,
      row.categoria || null,
      row.subcategoria || null,
      row.incumplimiento || null,
      row.severidad || null,
      row.etiquetas || null,
      row.fuente || null,
    ]
  );
  return { id: result.insertId, created: true };
}

// POST /api/normas-repo/import (solo admin)
router.post(
  "/import",
  requireRole("admin"),
  (req, res, next) => {
    excelUpload.single("file")(req, res, (err) => {
      if (err) {
        const code = err && err.code ? err.code : undefined;
        console.error(
          "[normas-repo/import] multer error:",
          code || "",
          err && err.message ? err.message : err
        );
        let friendly = "Error procesando archivo";
        if (code === "LIMIT_FILE_SIZE")
          friendly = "Archivo demasiado grande (límite 50MB)";
        return res.status(400).json({
          error: friendly,
          detail: err && err.message ? err.message : String(err),
          code,
        });
      }
      if (!req.file) {
        console.error(
          "[normas-repo/import] no file received. headers=",
          req.headers
        );
        return res.status(400).json({
          error: "Archivo no recibido",
          detail: 'No se recibió el archivo en el campo "file"',
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!XLSX)
        return res.status(500).json({ error: "Dependencia XLSX no instalada" });
      const file = req.file;
      if (!file) return res.status(400).json({ error: "Archivo requerido" });
      console.log("[normas-repo/import] received file:", {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
      });
      const wb = XLSX.readFile(file.path);
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const rowsAoA = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
      });
      if (!Array.isArray(rowsAoA) || rowsAoA.length === 0)
        return res.status(400).json({ error: "Hoja vacía" });

      // Intento 1: detectar fila de encabezados
      const headerTokens = [
        "codigo",
        "código",
        "titulo",
        "título",
        "descripcion",
        "descripción",
        "categoria",
        "categoría",
        "subcategoria",
        "subcategoría",
        "incumplimiento",
        "hallazgo",
        "severidad",
        "nivel",
        "etiquetas",
        "tags",
        "fuente",
        "origen",
        "articulo",
        "artículo",
      ];
      let headerIdx = -1;
      for (let i = 0; i < Math.min(10, rowsAoA.length); i++) {
        const row = rowsAoA[i] || [];
        const norm = row.map((c) => normalizeHeader(c));
        if (norm.some((h) => headerTokens.includes(h))) {
          headerIdx = i;
          break;
        }
      }

      let created = 0,
        updated = 0,
        errors = 0,
        totalRows = 0;

      if (headerIdx >= 0) {
        // Modo encabezados explícitos
        const headers = (rowsAoA[headerIdx] || []).map(normalizeHeader);
        const dataRows = rowsAoA.slice(headerIdx + 1);
        totalRows = dataRows.length;
        for (const r of dataRows) {
          if (!r || r.length === 0 || r.every((c) => String(c).trim() === ""))
            continue;
          const record = {};
          headers.forEach((h, i) => {
            if (h) record[h] = r[i];
          });
          // Construir título de forma tolerante
          const categoria =
            (record.categoria || record.seccion || record.sección || "")
              .toString()
              .trim() || null;
          const descripcion = (
            record.descripcion ||
            record.descripcion_ ||
            record.incumplimiento ||
            record.titulo ||
            record.nombre ||
            record.norma ||
            ""
          )
            .toString()
            .trim();
          const articulo =
            (
              record.articulo ||
              record.artículo ||
              record.fuente ||
              record.origen ||
              ""
            )
              .toString()
              .trim() || null;
          record.titulo = descripcion;
          if (!record.titulo) {
            // Si no hay campos útiles, saltar sin contar como error
            const meaningful = [
              record.descripcion,
              record.incumplimiento,
              record.categoria,
              record.subcategoria,
              record.fuente,
              record.articulo,
              record["incumplimientos_electricos"],
            ].filter((v) => String(v || "").trim() !== "");
            if (meaningful.length === 0) {
              // Como último recurso, tomar primeras 1-2 celdas no vacías de la fila original
              const nonEmptyCells = (r || [])
                .map((c) => String(c || "").trim())
                .filter(Boolean);
              if (nonEmptyCells.length === 0) continue;
              record.titulo = nonEmptyCells
                .slice(0, 2)
                .join(" - ")
                .slice(0, 160);
            } else {
              record.titulo = meaningful[0].toString().slice(0, 160);
            }
          }
          try {
            const resp = await upsertNormaRepo({
              codigo: null,
              titulo: String(record.titulo).trim(),
              descripcion: descripcion || null,
              categoria: categoria,
              subcategoria: null,
              incumplimiento: null,
              severidad: null,
              etiquetas: record.etiquetas || record.tags || null,
              fuente: articulo,
            });
            if (resp.created) created++;
            else if (resp.updated) updated++;
            else created++;
          } catch (e) {
            console.warn(
              "Upsert norma_repo (header mode) error:",
              e && e.message ? e.message : e
            );
            errors++;
          }
        }
      } else {
        // Modo sin encabezados: asumir formato de 2-3 columnas
        // Regla: filas con 1 sola celda no vacía = sección/categoría
        // Filas con 2+ celdas: col1 = subcategoria (opcional), col2 = titulo/descripcion, col3 = articulo/fuente
        let currentCategoria = null;
        function normalizeCat(s) {
          return String(s || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^A-Za-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .toUpperCase();
        }
        console.log("[normas-repo/import] fallback-mode rows=", rowsAoA.length);
        let seq = 0;
        for (const row of rowsAoA) {
          const cols = (row || []).map((c) => String(c).trim());
          if (cols.length === 0 || cols.every((c) => c === "")) continue;
          const nonEmpty = cols.filter((c) => c !== "");
          // sección/categoría
          if (nonEmpty.length === 1) {
            const only = nonEmpty[0];
            // saltar fila de título global
            const nh = normalizeHeader(only);
            if (nh === "incumplimientos_electricos" || nh === "articulo")
              continue;
            currentCategoria = only;
            continue;
          }
          // item
          // Tomar primeras 2 no vacías para indice/subcat y descripción; artículo = última no vacía
          const col0 = nonEmpty[0] || ""; // categoria
          const col1 = nonEmpty[1] || ""; // descripcion
          const col2 =
            nonEmpty.length >= 3 ? nonEmpty[nonEmpty.length - 1] : ""; // articulo
          // saltar fila cabecera que tenga ambos: INCUMPLIMIENTOS ELECTRICOS y ARTICULO
          const n0 = normalizeHeader(col0);
          const n1 = normalizeHeader(col1);
          const n2 = normalizeHeader(col2);
          const isHeaderRow =
            [n0, n1, n2].includes("incumplimientos_electricos") ||
            [n0, n1, n2].includes("articulo");
          if (isHeaderRow && nonEmpty.length <= 3) continue;
          // muchas planillas usan: [Indice+Subcategoria, Descripción del incumplimiento, Artículo]
          let titulo = col1 || col0;
          if (!titulo) {
            // construir título con heurística sin contar error si hay contenido
            const fallback = nonEmpty.find((v) => v && v.length > 0) || "";
            if (!fallback) continue; // fila vacía real
            titulo = fallback;
          }
          // Extraer indice/código de col0 si viene como "1. Subcategoria" o similar
          let parsedCodigo = null;
          let parsedSubcat = null;
          const m = col0.match(/^\s*([0-9IVXLCDM]+)[\.)\-\s]+(.+)?$/i); // admite 1. , I. , 1)
          if (m) {
            parsedCodigo = m[1];
            parsedSubcat = (m[2] || "").trim() || null;
          }
          // codigo no es necesario para este formato
          const codigo = null;
          seq += 1;
          const record = {
            codigo,
            titulo: titulo || `Incumplimiento ${seq}`,
            descripcion: col1 || null,
            categoria: col0 || currentCategoria || null,
            subcategoria: null,
            incumplimiento: null,
            severidad: null,
            etiquetas: null,
            fuente: col2 || null,
          };
          try {
            const resp = await upsertNormaRepo(record);
            if (resp.created) created++;
            else if (resp.updated) updated++;
            else created++;
          } catch (e) {
            console.warn(
              "Upsert norma_repo (fallback mode) error:",
              e && e.message ? e.message : e,
              "record=",
              record
            );
            errors++;
          }
          totalRows++;
        }
      }

      res.json({ ok: true, created, updated, errors, total: totalRows });
    } catch (err) {
      console.error("import normas_repo error:", err);
      res.status(500).json({ error: "Error importando catálogo" });
    }
  }
);

// GET /api/normas-repo (público: solo lectura)
router.get(
  "/",
  [
    query("search").optional().isString().trim(),
    query("categoria").optional().isString().trim(),
    query("severidad").optional().isString().trim(),
    query("page").optional().isInt({ min: 1 }).toInt(),
    query("limit").optional().isInt({ min: 1, max: 2000 }).toInt(),
    query("all").optional().isString().trim(),
  ],
  checkValidation,
  async (req, res) => {
    const search = req.query.search ? String(req.query.search) : "";
    const categoria = req.query.categoria ? String(req.query.categoria) : "";
    const severidad = req.query.severidad ? String(req.query.severidad) : "";
    let page = req.query.page || 1;
    let limit = req.query.limit || 20;
    const all = (req.query.all || "").toString().toLowerCase();
    const returnAll = all === "1" || all === "true" || all === "yes";
    if (returnAll) {
      page = 1;
      limit = 2000;
    }
    const offset = (page - 1) * limit;
    try {
      const where = [];
      const params = [];
      if (search) {
        // Dividir por espacios, comas o punto y coma para buscar múltiples palabras clave.
        // Lógica AND: la fila debe contener TODAS las palabras (en cualquier campo).
        const keywords = search
          .split(/[\s,;]+/)
          .filter((k) => k.trim().length > 0);
        if (keywords.length > 0) {
          const keywordConditions = keywords.map(
            () =>
              "(titulo LIKE ? OR descripcion LIKE ? OR incumplimiento LIKE ? OR etiquetas LIKE ? OR codigo LIKE ?)"
          );
          where.push("(" + keywordConditions.join(" AND ") + ")");
          for (const kw of keywords) {
            for (let i = 0; i < 5; i++) params.push(`%${kw}%`);
          }
        }
      }
      if (categoria) {
        // Si la categoría es un número (con o sin punto), filtrar por el prefijo numérico exacto
        const catTrim = categoria.trim();
        const mNum = catTrim.match(/^\d+\.?$/);
        if (mNum) {
          // Extraer el número sin el punto final
          const num = catTrim.replace(/\.$/, "");
          // Comparar el número inicial antes del punto en la columna categoria
          where.push(
            `CASE WHEN instr(categoria, '.') > 0
                  THEN substr(categoria, 1, instr(categoria, '.') - 1)
                  ELSE categoria
             END = ?`
          );
          params.push(num);
        } else {
          // Búsqueda textual estándar
          where.push("categoria LIKE ?");
          params.push(`%${categoria}%`);
        }
      }
      if (severidad) {
        where.push("severidad LIKE ?");
        params.push(`%${severidad}%`);
      }
      const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
      const [countRows] = await pool.query(
        `SELECT COUNT(*) as total FROM normas_repo ${whereSql}`,
        params
      );
      const total = countRows[0]?.total || 0;
      // Ordenar por categoría (no nulas primero) y natural por número inicial (e.g., "2." antes de "10."), luego por título
      let rows;
      if (returnAll) {
        const [r] = await pool.query(
          `SELECT * FROM normas_repo ${whereSql}
           ORDER BY
             (categoria IS NULL OR categoria = '') ASC,
             CASE WHEN instr(categoria, '.') > 0
                  THEN CAST(substr(categoria, 1, instr(categoria, '.') - 1) AS INTEGER)
                  ELSE CAST(categoria AS INTEGER)
             END ASC,
             categoria ASC,
             titulo ASC,
             created_at DESC
           LIMIT ?`,
          [...params, Number(limit)]
        );
        rows = r;
      } else {
        const [r] = await pool.query(
          `SELECT * FROM normas_repo ${whereSql}
           ORDER BY
             (categoria IS NULL OR categoria = '') ASC,
             CASE WHEN instr(categoria, '.') > 0
                  THEN CAST(substr(categoria, 1, instr(categoria, '.') - 1) AS INTEGER)
                  ELSE CAST(categoria AS INTEGER)
             END ASC,
             categoria ASC,
             titulo ASC,
             created_at DESC
           LIMIT ? OFFSET ?`,
          [...params, Number(limit), Number(offset)]
        );
        rows = r;
      }
      res.json({
        items: rows,
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: returnAll ? 1 : Math.max(1, Math.ceil(total / limit)),
      });
    } catch (err) {
      console.error("list normas_repo error:", err);
      res.status(500).json({ error: "Error obteniendo catálogo" });
    }
  }
);

// POST /api/normas-repo (solo admin)
router.post(
  "/",
  requireRole("admin"),
  [body("titulo").isString().trim().isLength({ min: 1 })],
  checkValidation,
  async (req, res) => {
    try {
      const {
        codigo,
        titulo,
        descripcion,
        categoria,
        subcategoria,
        incumplimiento,
        severidad,
        etiquetas,
        fuente,
      } = req.body || {};
      const [result] = await pool.query(
        "INSERT INTO normas_repo (codigo, titulo, descripcion, categoria, subcategoria, incumplimiento, severidad, etiquetas, fuente) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          codigo || null,
          titulo,
          descripcion || null,
          categoria || null,
          subcategoria || null,
          incumplimiento || null,
          severidad || null,
          etiquetas || null,
          fuente || null,
        ]
      );
      const [rows] = await pool.query(
        "SELECT * FROM normas_repo WHERE id = ?",
        [result.insertId]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error("create normas_repo error:", err);
      res.status(500).json({ error: "Error creando registro" });
    }
  }
);

// PUT /api/normas-repo/:id (solo admin)
router.put(
  "/:id",
  requireRole("admin"),
  [param("id").isInt({ min: 1 }).toInt()],
  checkValidation,
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        codigo,
        titulo,
        descripcion,
        categoria,
        subcategoria,
        incumplimiento,
        severidad,
        etiquetas,
        fuente,
      } = req.body || {};
      await pool.query(
        "UPDATE normas_repo SET codigo = COALESCE(?, codigo), titulo = COALESCE(?, titulo), descripcion = COALESCE(?, descripcion), categoria = COALESCE(?, categoria), subcategoria = COALESCE(?, subcategoria), incumplimiento = COALESCE(?, incumplimiento), severidad = COALESCE(?, severidad), etiquetas = COALESCE(?, etiquetas), fuente = COALESCE(?, fuente), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [
          codigo || null,
          titulo || null,
          descripcion || null,
          categoria || null,
          subcategoria || null,
          incumplimiento || null,
          severidad || null,
          etiquetas || null,
          fuente || null,
          id,
        ]
      );
      const [rows] = await pool.query(
        "SELECT * FROM normas_repo WHERE id = ?",
        [id]
      );
      if (!rows || rows.length === 0)
        return res.status(404).json({ error: "No encontrado" });
      res.json(rows[0]);
    } catch (err) {
      console.error("update normas_repo error:", err);
      res.status(500).json({ error: "Error actualizando registro" });
    }
  }
);

// DELETE /api/normas-repo/:id (solo admin)
router.delete(
  "/:id",
  requireRole("admin"),
  [param("id").isInt({ min: 1 }).toInt()],
  checkValidation,
  async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query("DELETE FROM normas_repo WHERE id = ?", [id]);
      res.status(204).send();
    } catch (err) {
      console.error("delete normas_repo error:", err);
      res.status(500).json({ error: "Error eliminando registro" });
    }
  }
);

// POST /api/normas-repo/:id/evidencias (solo admin)
router.post(
  "/:id/evidencias",
  requireRole("admin"),
  [param("id").isInt({ min: 1 }).toInt()],
  (req, res, next) => {
    imageUpload.single("file")(req, res, (err) => {
      if (err)
        return res.status(400).json({
          error: "Error procesando imagen",
          detail: err && err.message ? err.message : String(err),
        });
      next();
    });
  },
  checkValidation,
  async (req, res) => {
    try {
      const { id } = req.params;
      const file = req.file;
      const comentario =
        req.body && req.body.comentario ? String(req.body.comentario) : null;
      if (!file) return res.status(400).json({ error: "Imagen requerida" });
      // verificar que norma exista
      const [rows] = await pool.query(
        "SELECT id FROM normas_repo WHERE id = ?",
        [id]
      );
      if (!rows || rows.length === 0)
        return res.status(404).json({ error: "Norma no encontrada" });

      let finalPath = file.path;
      let thumbPath = null;
      // Procesar con sharp si disponible
      if (sharp) {
        try {
          // re-encode to JPEG with reasonable size
          const outPath = file.path.replace(/\.(png|webp)$/i, ".jpg");
          await sharp(file.path).rotate().jpeg({ quality: 82 }).toFile(outPath);
          // create thumbnail
          const thumbOut = outPath.replace(/\.jpg$/i, ".thumb.jpg");
          await sharp(outPath)
            .resize(480)
            .jpeg({ quality: 70 })
            .toFile(thumbOut);
          // remove original if different
          if (outPath !== file.path) {
            try {
              fs.unlinkSync(file.path);
            } catch {}
          }
          finalPath = outPath;
          thumbPath = thumbOut;
        } catch (e) {
          console.warn(
            "sharp failed, using original image",
            e && e.message ? e.message : e
          );
        }
      }

      const mime = "image/jpeg";
      const size = fs.existsSync(finalPath)
        ? fs.statSync(finalPath).size
        : file.size;
      const [result] = await pool.query(
        "INSERT INTO normas_repo_evidencias (norma_repo_id, comentario, image_path, thumb_path, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?)",
        [id, comentario || null, finalPath, thumbPath || null, mime, size]
      );

      res.status(201).json({
        id: result.insertId,
        normaRepoId: Number(id),
        comentario: comentario || null,
        imageUrl: buildPublicUrl(finalPath),
        thumbUrl: thumbPath ? buildPublicUrl(thumbPath) : null,
        mimeType: mime,
        sizeBytes: size,
      });
    } catch (err) {
      console.error("upload evidencia normas_repo error:", err);
      res.status(500).json({ error: "Error subiendo evidencia" });
    }
  }
);

// GET /api/normas-repo/:id/evidencias (solo lectura)
router.get(
  "/:id/evidencias",
  [param("id").isInt({ min: 1 }).toInt()],
  checkValidation,
  async (req, res) => {
    try {
      const { id } = req.params;
      const [rows] = await pool.query(
        "SELECT * FROM normas_repo_evidencias WHERE norma_repo_id = ? ORDER BY created_at DESC",
        [id]
      );
      const items = rows.map((r) => ({
        id: r.id,
        normaRepoId: r.norma_repo_id,
        comentario: r.comentario,
        imageUrl: buildPublicUrl(r.image_path),
        thumbUrl: r.thumb_path ? buildPublicUrl(r.thumb_path) : null,
        mimeType: r.mime_type,
        sizeBytes: r.size_bytes,
        createdAt: r.created_at,
      }));
      res.json({ items });
    } catch (err) {
      console.error("list evidencias normas_repo error:", err);
      res.status(500).json({ error: "Error obteniendo evidencias" });
    }
  }
);

// DELETE /api/normas-repo/evidencias/:evidenciaId (solo admin)
router.delete(
  "/evidencias/:evidenciaId",
  requireRole("admin"),
  [param("evidenciaId").isInt({ min: 1 }).toInt()],
  checkValidation,
  async (req, res) => {
    try {
      const { evidenciaId } = req.params;
      const [rows] = await pool.query(
        "SELECT image_path, thumb_path FROM normas_repo_evidencias WHERE id = ?",
        [evidenciaId]
      );
      if (!rows || rows.length === 0)
        return res.status(404).json({ error: "Evidencia no encontrada" });
      const img = rows[0];
      await pool.query("DELETE FROM normas_repo_evidencias WHERE id = ?", [
        evidenciaId,
      ]);
      try {
        if (img.image_path && fs.existsSync(img.image_path))
          fs.unlinkSync(img.image_path);
      } catch {}
      try {
        if (img.thumb_path && fs.existsSync(img.thumb_path))
          fs.unlinkSync(img.thumb_path);
      } catch {}
      res.status(204).send();
    } catch (err) {
      console.error("delete evidencia normas_repo error:", err);
      res.status(500).json({ error: "Error eliminando evidencia" });
    }
  }
);

// GET /api/normas-repo/report (PDF)
router.get(
  "/report",
  [
    query("ids").optional().isString().trim(),
    query("search").optional().isString().trim(),
    query("categoria").optional().isString().trim(),
    query("severidad").optional().isString().trim(),
  ],
  checkValidation,
  async (req, res) => {
    // Manejar HEAD requests (solo devolver headers, no generar PDF)
    if (req.method === 'HEAD') {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline; filename=normas_repo.pdf");
      res.setHeader("Cache-Control", "no-cache");
      return res.status(200).end();
    }
    
    try {
      // seleccionar items por ids o por filtros
      let where = [];
      let params = [];
      if (req.query.ids) {
        const ids = String(req.query.ids)
          .split(",")
          .map((s) => Number(s))
          .filter((n) => Number.isInteger(n) && n > 0);
        if (ids.length === 0)
          return res.status(400).json({ error: "ids inválidos" });
        where.push(`id IN (${ids.map(() => "?").join(",")})`);
        params = params.concat(ids);
      } else {
        const search = req.query.search ? String(req.query.search) : "";
        const categoria = req.query.categoria
          ? String(req.query.categoria)
          : "";
        const severidad = req.query.severidad
          ? String(req.query.severidad)
          : "";
        if (search) {
          where.push(
            "(titulo LIKE ? OR descripcion LIKE ? OR incumplimiento LIKE ? OR etiquetas LIKE ? OR codigo LIKE ?)"
          );
          for (let i = 0; i < 5; i++) params.push(`%${search}%`);
        }
        if (categoria) {
          where.push("categoria LIKE ?");
          params.push(`%${categoria}%`);
        }
        if (severidad) {
          where.push("severidad LIKE ?");
          params.push(`%${severidad}%`);
        }
      }

      const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
      // Orden natural por categoría (número inicial antes del punto), luego categoría/texto, luego título
      const [rows] = await pool.query(
        `SELECT * FROM normas_repo ${whereSql}
         ORDER BY
           (categoria IS NULL OR categoria = '') ASC,
           CASE WHEN instr(categoria, '.') > 0
                THEN CAST(substr(categoria, 1, instr(categoria, '.') - 1) AS INTEGER)
                ELSE CAST(categoria AS INTEGER)
           END ASC,
           categoria ASC,
           titulo ASC`,
        params
      );

      // Validar que tenemos datos antes de generar el PDF
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: "No hay datos para generar el PDF" });
      }

      // Crear PDF (igual que en reportes.js)
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline; filename=normas_repo.pdf");
      res.setHeader("Cache-Control", "no-cache");
      
      // Flag para evitar escribir después de que el stream se cierre
      let streamEnded = false;
      let pdfEnded = false;
      
      const doc = new PDFDocument({
        size: "A4",
        margin: 40,
        bufferPages: true,
      });
      
      // Manejar errores del stream de respuesta
      res.on('error', (err) => {
        if (!streamEnded) {
          streamEnded = true;
          console.error("❌ Error en stream de respuesta:", err.message);
        }
      });
      
      // Detectar cuando el stream se cierra
      res.on('finish', () => {
        streamEnded = true;
      });
      
      res.on('close', () => {
        streamEnded = true;
      });
      
      // Manejar errores del documento PDF
      doc.on('error', (err) => {
        console.error("❌ Error en documento PDF:", err.message);
        if (!streamEnded && !res.headersSent) {
          streamEnded = true;
          try {
            res.status(500).json({ error: "Error generando PDF" });
          } catch (e) {
            // Ignorar errores al cerrar
          }
        }
      });
      
      doc.pipe(res);

      // Función segura para verificar si podemos escribir
      const canWrite = () => {
        try {
          return !streamEnded && !pdfEnded && !res.headersSent && !res.writableEnded && res.writable;
        } catch {
          return false;
        }
      };
      
      // Función segura para escribir al documento PDF
      const safeDocWrite = (fn) => {
        if (!canWrite()) return false;
        try {
          fn();
          return true;
        } catch (err) {
          if (err.code === 'ERR_STREAM_WRITE_AFTER_END' || err.message.includes('write after end')) {
            streamEnded = true;
            console.warn("⚠️ Intento de escribir después de que el stream se cerró");
            return false;
          }
          throw err;
        }
      };

      // Encabezado con logo y título
      const pageWidth = doc.page.width;
      const marginL = doc.page.margins.left;
      const usableW = pageWidth - marginL * 2;
      const logoPath = getCompanyLogoPath();
      if (logoPath && canWrite()) {
        safeDocWrite(() => {
          doc.image(logoPath, marginL, marginL - 6, { fit: [64, 64] });
        });
      }
      
      if (!canWrite()) {
        console.warn("⚠️ Stream cerrado antes de generar contenido");
        return;
      }
      
      safeDocWrite(() => {
      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .fillColor("#000")
        .text("Catálogo de Normas / Incumplimientos", marginL, marginL, {
          width: usableW,
          align: "center",
        });
      const sub = `Total: ${rows.length}`;
      doc.moveDown(0.2);
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#555")
        .text(sub, { align: "center" });
      doc.moveDown(0.8);
      });

      if (!canWrite()) return;

      // Render como tabla plana: Categoria | Descripción | Artículo
      // Ajustado a márgenes (ancho usable = 515 aprox en A4 con margen 40)
      const colW = [170, 275, 70]; // suma 515
      const colX = [marginL, marginL + colW[0], marginL + colW[0] + colW[1]];
      let y = doc.y;
      let currentCat = null;
      const drawRow = (cells, styles = {}) => {
        if (!canWrite()) return;
        
        const { header = false } = styles;
        const font = header ? "Helvetica-Bold" : "Helvetica";
        const size = header ? 10 : 9.5;
        
        if (!safeDocWrite(() => {
        doc.font(font).fontSize(size).fillColor("#000");
        })) return;
        
        const startY = y;
        const heights = cells.map((text, i) => {
          try {
            if (!canWrite()) return 16;
          const h = doc.heightOfString(String(text || ""), {
            width: colW[i] - 6,
          });
          return Math.max(16, h + 6);
          } catch (err) {
            return 16;
          }
        });
        const rowH = heights.length > 0 ? Math.max(...heights) : 16;
        
        // Page break dinámico según margen inferior
        const bottomLimit = doc.page.height - doc.page.margins.bottom - 10;
        if (y + rowH > bottomLimit) {
          if (!safeDocWrite(() => {
          doc.addPage();
          y = doc.page.margins.top;
          })) {
            return;
        }
        }
        
        if (!canWrite()) return;
        
        // Text
        cells.forEach((text, i) => {
          safeDocWrite(() => {
          doc.text(String(text || ""), colX[i] + 3, y + 3, {
            width: colW[i] - 6,
          });
        });
        });
        
        if (!canWrite()) return;
        
        // Borders
        safeDocWrite(() => {
        doc.strokeColor("#cccccc");
        doc.lineWidth(0.5);
        doc.rect(colX[0], y, colW[0], rowH).stroke();
        doc.rect(colX[1], y, colW[1], rowH).stroke();
        doc.rect(colX[2], y, colW[2], rowH).stroke();
        y += rowH;
        });
      };

      // Header row
      if (canWrite()) {
      drawRow(["Categoría", "Descripción", "Artículo"], { header: true });
      }
      
      // Data rows
      if (canWrite()) {
      rows.forEach((r) => {
          if (canWrite()) {
        drawRow([
          r.categoria || "",
          r.descripcion || r.titulo || "",
          r.fuente || "",
        ]);
          }
        });
      }

      // Finalizar el documento solo si no se cerró el stream
      if (!streamEnded && !pdfEnded) {
        pdfEnded = true;
        try {
      doc.end();
    } catch (err) {
          console.error("❌ Error cerrando documento PDF:", err.message);
          if (!res.headersSent) {
            try {
              res.status(500).json({ error: "Error finalizando PDF" });
            } catch (e) {
              // Ignorar errores al cerrar
            }
          }
        }
      }
    } catch (err) {
      console.error("❌ Error generando PDF de normas_repo:", err);
      console.error("❌ Error message:", err?.message);
      console.error("❌ Error stack:", err?.stack);
      // Asegurarse de que la respuesta se cierre correctamente
      if (!res.headersSent) {
        try {
      res.status(500).json({ error: "Error generando PDF" });
        } catch (e) {
          console.error("Error enviando respuesta de error:", e);
          try {
            res.end();
          } catch (e2) {
            console.error("Error cerrando respuesta:", e2);
          }
        }
      } else {
        try {
          res.end();
        } catch (e) {
          console.error("Error cerrando respuesta después de headers:", e);
        }
      }
    }
  }
);

module.exports = router;

