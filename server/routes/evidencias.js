const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const { body, param, query, validationResult } = require('express-validator');
const pool = require('../models/db');
const { getUploadsBase } = require('../lib/userDataPath');

const router = express.Router();

function ensureUploadsDir() {
  const base = getUploadsBase();
  fs.mkdirSync(base, { recursive: true });
  return base;
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const base = ensureUploadsDir();
    const now = new Date();
    const dir = path.join(base, 'evidencias', String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || (file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/webp' ? '.webp' : '.jpg');
    const unique = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    cb(null, unique + ext);
  }
});

function fileFilter(req, file, cb) {
  const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
  if (!ok) return cb(new Error('Tipo de archivo no permitido'));
  cb(null, true);
}

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const upload = multer({ storage, limits: { fileSize: MAX_FILE_SIZE }, fileFilter });

const checkValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// Helper: construir URL pública desde image_path
function buildPublicUrl(imagePathAbs) {
  const base = getUploadsBase();
  const rel = path.relative(base, imagePathAbs).replace(/\\/g, '/');
  return `/uploads/${rel}`;
}

// Hash de archivo para detectar duplicados (SHA256)
function computeFileHash(absPath) {
  try {
    const buf = fs.readFileSync(absPath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}

// Detectar tipo de evidencia (heurística por nombre o comentario)
function detectEvidenceType(originalName, providedTipo, comentario) {
  if (providedTipo && typeof providedTipo === 'string') return providedTipo.toUpperCase();
  const name = String(originalName || '').toLowerCase();
  const comm = String(comentario || '').toLowerCase();
  const hay = (re) => re.test(name) || re.test(comm);
  if (hay(/\b(institu|portada)\b/) || /^\s*\[inst/i.test(comm)) return 'INSTITUCIONAL';
  if (hay(/\b(tecni|detalle|close(up)?|macro)\b/)) return 'TECNICA';
  if (hay(/\b(incumpl|falla|no conform|defecto|riesgo)\b/)) return 'INCUMPLIMIENTO';
  return 'GENERAL';
}

// Normaliza comentario para claves de grupo
function normalizeComment(c) {
  return String(c || '')
    .replace(/^\s*\[(INSTITUCION|PORTADA)\]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Comprimir/redimensionar imagen para reducir peso con mínima pérdida de calidad (Sharp)
const MAX_DIMENSION = 2400; // lado largo máximo en px
const JPEG_QUALITY = 90;
const WEBP_QUALITY = 90;
async function compressEvidenceImage(filePath, mimeType) {
  try {
    const sharp = require('sharp');
    let pipeline = sharp(filePath);
    const meta = await pipeline.metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;
    const needResize = (w > MAX_DIMENSION || h > MAX_DIMENSION);
    if (needResize) {
      pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true });
    }
    const mime = String(mimeType || '').toLowerCase();
    if (mime.includes('jpeg') || mime.includes('jpg')) {
      pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });
    } else if (mime.includes('webp')) {
      pipeline = pipeline.webp({ quality: WEBP_QUALITY });
    } else if (mime.includes('png')) {
      pipeline = pipeline.png({ compressionLevel: 9 });
    }
    const buf = await pipeline.toBuffer();
    fs.writeFileSync(filePath, buf);
    return { size: buf.length };
  } catch (err) {
    console.warn('compressEvidenceImage:', err && err.message ? err.message : err);
    return null; // fallback: no cambiar tamaño
  }
}

// Construye clave de grupo estable a partir de tarea+comentario
function buildGroupKey(tareaId, comentario, sequence = 0) {
  const t = tareaId ? Number(tareaId) : 0;
  const cm = normalizeComment(comentario);
  // sequence permite dividir grupos cuando exceden el máximo (3 imágenes). 0 = grupo base
  return `t${t}|c${cm}|s${sequence}`;
}

// Middleware para capturar errores de multer y responder 400 con detalle
function handleMulterSingle(field) {
  return (req, res, next) => {
    upload.single(field)(req, res, (err) => {
      if (err) {
        console.warn('multer error:', err && err.message ? err.message : err);
        return res.status(400).json({ error: 'Error procesando archivo', detail: err && err.message ? err.message : String(err) });
      }
      next();
    });
  };
}

// POST /api/evidencias/upload
router.post(
  '/upload',
  handleMulterSingle('file'),
  [
    body('proyectoId').isInt({ min: 1 }).toInt(),
    body('tareaId').optional().isInt({ min: 1 }).toInt(),
    body('tipo').optional().isString().isLength({ max: 50 }),
    // La categoría (clasificación de severidad) puede venir opcional
    body('categoria').optional().isString().isIn(['OK', 'LEVE', 'CRITICO']),
    body('comentario').optional().isString().trim().isLength({ max: 1000 })
  ],
  checkValidation,
  async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'Imagen requerida' });

      const compressed = await compressEvidenceImage(file.path, file.mimetype);
      if (compressed) file.size = compressed.size;

  const { proyectoId, tareaId, comentario } = req.body;
  // Si viene categoria, se acepta; si no, usar 'OK' por compatibilidad con el esquema NOT NULL
  const categoria = (req.body && req.body.categoria) ? String(req.body.categoria) : 'OK';
  const pId = Number(proyectoId);
  const tId = (tareaId === undefined || tareaId === null || tareaId === '' ? null : Number(tareaId));
  if (!Number.isInteger(pId) || pId < 1) return res.status(400).json({ error: 'proyectoId inválido' });
  if (tId !== null && (!Number.isInteger(tId) || tId < 1)) return res.status(400).json({ error: 'tareaId inválido' });

      // Validar proyecto
  const [proy] = await pool.query('SELECT id FROM proyectos WHERE id = ?', [pId]);
      if (!proy || proy.length === 0) return res.status(400).json({ error: 'Proyecto no encontrado' });

      // Validar tarea si viene y que pertenezca al proyecto
      if (tId) {
        const [tar] = await pool.query('SELECT id FROM tareas WHERE id = ? AND proyecto_id = ?', [tId, pId]);
        if (!tar || tar.length === 0) return res.status(400).json({ error: 'La tarea no pertenece al proyecto' });
      }

  const imagePath = file.path; // absoluto
      const mime = file.mimetype;
      const size = file.size;
      const createdBy = null; // Si implementas auth con req.user.id, reemplaza aquí

      // Log para depuración
      console.log('EVIDENCIA INSERT payload =>', { proyectoId: pId, tareaId: tId, categoria, comentario, imagePath, mime, size, createdBy });

      const evidenceType = detectEvidenceType(file.originalname, req.body.tipo, comentario);
      // Determinar secuencia para no superar 3 imágenes por grupo
      let sequence = 0;
      try {
        const [countRows] = await pool.query('SELECT COUNT(*) as cnt FROM evidencias WHERE group_key LIKE ?', [`t${tId ? Number(tId) : 0}|c${normalizeComment(comentario)}|s%`]);
        // Revisar cada secuencia existente y encontrar una con <3 imágenes
        const seqCounts = {};
        const [rowsSeq] = await pool.query('SELECT group_key, COUNT(*) as cnt FROM evidencias WHERE group_key LIKE ? GROUP BY group_key', [`t${tId ? Number(tId) : 0}|c${normalizeComment(comentario)}|s%`]);
        for (const r of rowsSeq) {
          const m = /\|s(\d+)$/.exec(r.group_key);
          if (m) seqCounts[m[1]] = r.cnt;
        }
        while (sequence < 1000 && seqCounts[String(sequence)] >= 3) sequence++;
      } catch {}
      const groupKey = buildGroupKey(tId, comentario, sequence);
      const fileHash = computeFileHash(imagePath);
      // Evitar duplicados dentro del mismo grupo (mismo hash)
      if (fileHash) {
        const [dupRows] = await pool.query('SELECT id FROM evidencias WHERE group_key = ? AND file_hash = ?', [groupKey, fileHash]);
        if (dupRows && dupRows.length) {
          return res.status(409).json({ error: 'Duplicado detectado', duplicateId: dupRows[0].id });
        }
      }
      const [maxRows] = await pool.query('SELECT COALESCE(MAX(sort_order),0)+1 AS next_order FROM evidencias WHERE proyecto_id = ?', [pId]);
      const sortOrder = (maxRows && maxRows[0] && maxRows[0].next_order != null) ? maxRows[0].next_order : 1;
      const [result] = await pool.query(
        'INSERT INTO evidencias (proyecto_id, tarea_id, categoria, evidence_type, comentario, image_path, file_hash, mime_type, size_bytes, created_by, group_key, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ,[pId, tId || null, categoria || 'OK', evidenceType, comentario || null, imagePath, fileHash, mime, size, createdBy, groupKey, sortOrder]
      );

      const id = result.insertId;
      const relUrl = buildPublicUrl(imagePath);
      const absUrl = `${req.protocol}://${req.get('host')}${relUrl.startsWith('/') ? relUrl : ('/' + relUrl)}`;
      return res.status(201).json({
        id,
        proyectoId: pId,
        tareaId: tId,
        tipo: evidenceType,
        categoria,
        comentario: comentario || null,
        imageUrl: absUrl,
        mimeType: mime,
        sizeBytes: size,
        createdBy,
        groupKey
      });
    } catch (err) {
      console.error('upload evidencia error:', err && err.stack ? err.stack : err);
      res.status(500).json({ error: 'Error al subir evidencia', detail: err && err.message ? err.message : String(err), code: err && err.code ? err.code : undefined });
    }
    }
  );

// POST /api/evidencias/upload-multiple  -> múltiples fotos a un mismo grupo
router.post(
  '/upload-multiple',
  (req, res, next) => {
    // Hasta 20 imágenes por lote
    upload.array('files', 20)(req, res, (err) => {
      if (err) {
        console.warn('multer error (multi):', err && err.message ? err.message : err);
        return res.status(400).json({ error: 'Error procesando archivos', detail: err && err.message ? err.message : String(err) });
      }
      next();
    });
  },
  [
    body('proyectoId').isInt({ min: 1 }).toInt(),
    body('tareaId').optional().isInt({ min: 1 }).toInt(),
    body('tipo').optional().isString().isLength({ max: 50 }),
    body('comentario').optional().isString().trim().isLength({ max: 1000 })
  ],
  checkValidation,
  async (req, res) => {
    try {
      // Invertir orden para respetar el orden de selección del usuario (primera seleccionada = primera en lista)
      const files = Array.isArray(req.files) ? [...req.files].reverse() : [];
      if (files.length === 0) return res.status(400).json({ error: 'Se requiere al menos una imagen' });
  const { proyectoId, tareaId, comentario } = req.body;
      const pId = Number(proyectoId);
      const tId = (tareaId === undefined || tareaId === null || tareaId === '' ? null : Number(tareaId));
      const categoria = 'OK';

      const [[proy], [tar]] = await Promise.all([
        pool.query('SELECT id FROM proyectos WHERE id = ?', [pId]),
        tId ? pool.query('SELECT id FROM tareas WHERE id = ? AND proyecto_id = ?', [tId, pId]) : Promise.resolve([[[]]])
      ]);
      if (!proy || proy.length === 0) return res.status(400).json({ error: 'Proyecto no encontrado' });
      if (tId && (!tar || tar.length === 0)) return res.status(400).json({ error: 'La tarea no pertenece al proyecto' });

      // Para múltiples: distribuir archivos en subgrupos de máx 3
      const baseT = tId ? Number(tId) : 0;
      const baseCommentNorm = normalizeComment(comentario);
      // Obtener conteo actual por secuencia
      const [rowsSeq] = await pool.query('SELECT group_key, COUNT(*) as cnt FROM evidencias WHERE group_key LIKE ? GROUP BY group_key', [`t${baseT}|c${baseCommentNorm}|s%`]);
      const seqCounts = {};
      for (const r of rowsSeq) {
        const m = /\|s(\d+)$/.exec(r.group_key);
        if (m) seqCounts[m[1]] = r.cnt;
      }
      function nextSequenceSlot() {
        let seq = 0;
        while (seq < 1000 && seqCounts[String(seq)] >= 3) seq++;
        if (!seqCounts[String(seq)]) seqCounts[String(seq)] = 0;
        return seq;
      }
      let currentSeq = nextSequenceSlot();
      let currentCount = seqCounts[String(currentSeq)] || 0;
      const out = [];
      const createdBy = null;
      const [maxOrderRows] = await pool.query('SELECT COALESCE(MAX(sort_order),0) AS max_order FROM evidencias WHERE proyecto_id = ?', [pId]);
      let nextSortOrder = (maxOrderRows && maxOrderRows[0] && maxOrderRows[0].max_order != null) ? maxOrderRows[0].max_order + 1 : 1;
      for (const f of files) {
        if (currentCount >= 3) {
          currentSeq = nextSequenceSlot();
          currentCount = seqCounts[String(currentSeq)] || 0;
        }
        const compressed = await compressEvidenceImage(f.path, f.mimetype);
        if (compressed) f.size = compressed.size;
        const groupKey = buildGroupKey(tId, comentario, currentSeq);
        currentCount++;
        seqCounts[String(currentSeq)] = currentCount;
        const evidenceType = detectEvidenceType(f.originalname, req.body.tipo, comentario);
        const fileHash = computeFileHash(f.path);
        if (fileHash) {
          const [dupRows] = await pool.query('SELECT id FROM evidencias WHERE group_key = ? AND file_hash = ?', [groupKey, fileHash]);
          if (dupRows && dupRows.length) {
            out.push({ duplicate: true, duplicateId: dupRows[0].id, imageOriginalName: f.originalname });
            continue;
          }
        }
        const [r] = await pool.query(
          'INSERT INTO evidencias (proyecto_id, tarea_id, categoria, evidence_type, comentario, image_path, file_hash, mime_type, size_bytes, created_by, group_key, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ,[pId, tId || null, categoria, evidenceType, comentario || null, f.path, fileHash, f.mimetype, f.size, createdBy, groupKey, nextSortOrder]
        );
        nextSortOrder++;
        const id = r.insertId;
        const relUrl = buildPublicUrl(f.path);
        const absUrl = `${req.protocol}://${req.get('host')}${relUrl.startsWith('/') ? relUrl : ('/' + relUrl)}`;
        out.push({ id, proyectoId: pId, tareaId: tId, categoria, tipo: evidenceType, comentario: comentario || null, imageUrl: absUrl, mimeType: f.mimetype, sizeBytes: f.size, createdBy, groupKey });
      }
      res.status(201).json({ items: out });
    } catch (err) {
      console.error('upload-multiple evidencias error:', err);
      res.status(500).json({ error: 'Error al subir evidencias' });
    }
  }
);

// GET /api/evidencias
router.get(
  '/',
  [
    query('proyectoId').isInt({ min: 1 }).toInt(),
    query('tareaId').optional().isInt({ min: 1 }).toInt(),
  query('categoria').optional().isIn(['OK', 'LEVE', 'CRITICO']),
  query('tipo').optional().isString().isLength({ max: 50 }),
    query('group').optional().isIn(['true','false']),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 500 }).toInt()
  ],
  checkValidation,
  async (req, res) => {
  const { proyectoId, tareaId, categoria, tipo } = req.query;
    const wantGroups = String(req.query.group || 'false') === 'true';
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const offset = (page - 1) * limit;

    try {
      const where = ['proyecto_id = ?'];
      const params = [proyectoId];
      if (tareaId) { where.push('tarea_id = ?'); params.push(tareaId); }
  if (categoria) { where.push('categoria = ?'); params.push(categoria); }
  if (tipo) { where.push('evidence_type = ?'); params.push(String(tipo)); }
      const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
      if (!wantGroups) {
        const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM evidencias ${whereSql}`, params);
        const total = countRows[0]?.total || 0;
        // order=recent → panel: inverso al PDF (sort_order DESC = más reciente primero); sin recent → orden reporte (sort_order ASC)
        const orderRecent = String(req.query.order || '').toLowerCase() === 'recent';
        const orderClause = orderRecent
          ? 'ORDER BY CAST(COALESCE(sort_order, 0) AS INTEGER) DESC, created_at DESC'
          : 'ORDER BY CAST(COALESCE(sort_order, 999999) AS INTEGER) ASC, created_at ASC';
        const [rows] = await pool.query(
          `SELECT * FROM evidencias ${whereSql} ${orderClause} LIMIT ? OFFSET ?`,
          [...params, Number(limit), Number(offset)]
        );
        const items = rows.map(r => {
          const relUrl = buildPublicUrl(r.image_path);
          const absUrl = `${req.protocol}://${req.get('host')}${relUrl.startsWith('/') ? relUrl : ('/' + relUrl)}`;
          return {
            id: r.id,
            proyectoId: r.proyecto_id,
            tareaId: r.tarea_id,
            categoria: r.categoria,
            tipo: r.evidence_type,
            comentario: r.comentario,
            imageUrl: absUrl,
            mimeType: r.mime_type,
            sizeBytes: r.size_bytes,
            createdBy: r.created_by,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            groupKey: r.group_key || buildGroupKey(r.tarea_id, r.comentario)
          };
        });
        return res.json({ items, page: Number(page), limit: Number(limit), total, totalPages: Math.max(1, Math.ceil(total / limit)) });
      }

      // Modo agrupado
      const [rows] = await pool.query(
        `SELECT id, proyecto_id, tarea_id, comentario, image_path, mime_type, size_bytes, created_at, group_key, evidence_type
         FROM evidencias ${whereSql} ORDER BY CAST(COALESCE(sort_order, 999999) AS INTEGER) ASC, created_at ASC`,
        params
      );
      const map = new Map();
      for (const r of rows) {
        // Omitir evidencias institucionales en el modo agrupado
        if (/^\s*\[(INSTITUCION|PORTADA)\]/i.test(String(r.comentario || ''))) continue;
        const key = r.group_key || buildGroupKey(r.tarea_id, r.comentario);
        if (!map.has(key)) map.set(key, { groupKey: key, proyectoId: r.proyecto_id, tareaId: r.tarea_id, comentario: normalizeComment(r.comentario), evidenciaIds: [], images: [], tipo: r.evidence_type });
        const g = map.get(key);
        g.evidenciaIds.push(r.id);
        if (g.images.length < 3) {
          const relUrl = buildPublicUrl(r.image_path);
          const absUrl = `${req.protocol}://${req.get('host')}${relUrl.startsWith('/') ? relUrl : ('/' + relUrl)}`;
          g.images.push(absUrl);
        }
      }
      const groups = Array.from(map.values());

      // obtener conteo de normas por grupo (únicas por norma_repo_id)
      const allIds = groups.flatMap(g => g.evidenciaIds);
      let normsByEvid = {};
      if (allIds.length) {
        const placeholders = allIds.map(() => '?').join(',');
        const [links] = await pool.query(
          `SELECT evidencia_id, norma_repo_id FROM evidencias_normas_repo WHERE evidencia_id IN (${placeholders})`,
          allIds
        );
        normsByEvid = links.reduce((acc, r) => {
          (acc[r.evidencia_id] = acc[r.evidencia_id] || new Set()).add(r.norma_repo_id);
          return acc;
        }, {});
      }
      const items = groups.map(g => {
        const uniq = new Set();
        for (const id of g.evidenciaIds) {
          for (const n of (normsByEvid[id] || [])) uniq.add(n);
        }
        return { ...g, normasCount: uniq.size, count: g.evidenciaIds.length };
      });
      res.json({ items, total: items.length, page: 1, limit: items.length, totalPages: 1 });
    } catch (err) {
      console.error('list evidencias error:', err);
      res.status(500).json({ error: 'Error al obtener evidencias' });
    }
  }
);

// PUT /api/evidencias/swap — intercambiar orden de dos evidencias; en el reporte solo cambian esas dos posiciones
router.put('/swap', [
  body('proyectoId').isInt({ min: 1 }).toInt(),
  body('id1').isInt({ min: 1 }).toInt(),
  body('id2').isInt({ min: 1 }).toInt()
], checkValidation, async (req, res) => {
  try {
    const { proyectoId, id1, id2 } = req.body;
    if (id1 === id2) return res.status(400).json({ error: 'Los dos IDs deben ser distintos' });
    const [rows] = await pool.query(
      'SELECT id, sort_order FROM evidencias WHERE proyecto_id = ? AND id IN (?, ?)',
      [proyectoId, id1, id2]
    );
    if (!rows || rows.length !== 2) {
      return res.status(400).json({ error: 'Ambas evidencias deben pertenecer al proyecto' });
    }
    const byId = {};
    rows.forEach((r) => {
      const id = r.id;
      byId[id] = byId[Number(id)] = r;
    });
    const row1 = byId[id1] || byId[Number(id1)];
    const row2 = byId[id2] || byId[Number(id2)];
    let order1 = row1 && (row1.sort_order != null) ? Number(row1.sort_order) : null;
    let order2 = row2 && (row2.sort_order != null) ? Number(row2.sort_order) : null;
    if (order1 == null || order2 == null) {
      const [maxRows] = await pool.query('SELECT COALESCE(MAX(sort_order),0) AS m FROM evidencias WHERE proyecto_id = ?', [proyectoId]);
      const maxRow = maxRows && maxRows[0];
      const base = (maxRow && maxRow.m != null) ? Number(maxRow.m) + 1 : 1;
      if (order1 == null) order1 = base;
      if (order2 == null) order2 = base + 1;
    }
    const o1 = Number(order1);
    const o2 = Number(order2);
    await pool.query('UPDATE evidencias SET sort_order = ? WHERE id = ? AND proyecto_id = ?', [o2, id1, proyectoId]);
    await pool.query('UPDATE evidencias SET sort_order = ? WHERE id = ? AND proyecto_id = ?', [o1, id2, proyectoId]);
    console.log('[evidencias/swap] aplicado: proyectoId=%s id1=%s -> sort_order=%s, id2=%s -> sort_order=%s', proyectoId, id1, o2, id2, o1);
    res.json({ ok: true, id1, id2 });
  } catch (err) {
    console.error('swap evidencias error:', err);
    res.status(500).json({ error: 'Error al intercambiar evidencias' });
  }
});

// PUT /api/evidencias/reorder — orden manual completo (orderedIds = [id1, id2, ...]); se mantiene por compatibilidad
router.put('/reorder', [
  body('proyectoId').isInt({ min: 1 }).toInt(),
  body('orderedIds').isArray(),
  body('orderedIds.*').isInt({ min: 1 }).toInt()
], checkValidation, async (req, res) => {
  try {
    const { proyectoId, orderedIds } = req.body;
    if (!orderedIds || orderedIds.length === 0) return res.status(400).json({ error: 'orderedIds no puede estar vacío' });
    const placeholders = orderedIds.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT id FROM evidencias WHERE proyecto_id = ? AND id IN (${placeholders})`,
      [proyectoId, ...orderedIds]
    );
    const foundIds = new Set((rows || []).map((r) => r.id));
    if (foundIds.size !== orderedIds.length) {
      return res.status(400).json({ error: 'Algunos IDs no pertenecen al proyecto o no existen' });
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await pool.query('UPDATE evidencias SET sort_order = ? WHERE id = ? AND proyecto_id = ?', [i + 1, orderedIds[i], proyectoId]);
    }
    res.json({ ok: true, orderedIds });
  } catch (err) {
    console.error('reorder evidencias error:', err);
    res.status(500).json({ error: 'Error al reordenar evidencias' });
  }
});

// Nuevo endpoint agrupado por tipo de evidencia -> devuelve { tipo, groups: [...] }
router.get('/by-tipo', [
  query('proyectoId').isInt({ min: 1 }).toInt(),
  query('tareaId').optional().isInt({ min: 1 }).toInt()
], checkValidation, async (req, res) => {
  const { proyectoId, tareaId } = req.query;
  try {
    const where = ['proyecto_id = ?'];
    const params = [proyectoId];
    if (tareaId) { where.push('tarea_id = ?'); params.push(tareaId); }
    const whereSql = 'WHERE ' + where.join(' AND ');
    const [rows] = await pool.query(`SELECT id, proyecto_id, tarea_id, comentario, image_path, mime_type, size_bytes, created_at, group_key, evidence_type FROM evidencias ${whereSql} ORDER BY created_at DESC`, params);
    const byTipo = new Map();
    for (const r of rows) {
      const tipo = r.evidence_type || 'GENERAL';
      const key = r.group_key || buildGroupKey(r.tarea_id, r.comentario);
      if (!byTipo.has(tipo)) byTipo.set(tipo, new Map());
      const tipoMap = byTipo.get(tipo);
      if (!tipoMap.has(key)) tipoMap.set(key, { groupKey: key, proyectoId: r.proyecto_id, tareaId: r.tarea_id, comentario: normalizeComment(r.comentario), evidenciaIds: [], images: [], tipo });
      const g = tipoMap.get(key);
      g.evidenciaIds.push(r.id);
      if (g.images.length < 4) { // para vista por tipo mostramos hasta 4
        const relUrl = buildPublicUrl(r.image_path);
        const absUrl = `${req.protocol}://${req.get('host')}${relUrl.startsWith('/') ? relUrl : ('/' + relUrl)}`;
        g.images.push(absUrl);
      }
    }
    const items = Array.from(byTipo.entries()).map(([tipo, m]) => ({ tipo, groups: Array.from(m.values()).map(g => ({ ...g, count: g.evidenciaIds.length })) }));
    res.json({ items });
  } catch (err) {
    console.error('list evidencias by-tipo error:', err);
    res.status(500).json({ error: 'Error agrupando por tipo' });
  }
});

// Obtener todas las evidencias de un grupo
router.get('/groups/:groupKey', [param('groupKey').isString().isLength({ min: 1 })], checkValidation, async (req, res) => {
  const { groupKey } = req.params;
  try {
    const [rows] = await pool.query('SELECT * FROM evidencias WHERE group_key = ? ORDER BY created_at ASC', [groupKey]);
    const items = rows.map(r => ({
      id: r.id,
      proyectoId: r.proyecto_id,
      tareaId: r.tarea_id,
      categoria: r.categoria,
      tipo: r.evidence_type,
      comentario: r.comentario,
      imageUrl: buildPublicUrl(r.image_path),
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      groupKey: r.group_key
    }));
    res.json({ items });
  } catch (err) {
    console.error('list evidencias by group error:', err);
    res.status(500).json({ error: 'Error listando evidencias del grupo' });
  }
});

// PATCH /api/evidencias/:id
router.patch(
  '/:id',
  [
    param('id').isInt({ min: 1 }).toInt(),
    body('categoria').optional().isIn(['OK', 'LEVE', 'CRITICO']),
    body('comentario').optional().isString().trim().isLength({ max: 1000 })
  ],
  checkValidation,
  async (req, res) => {
    const { id } = req.params;
    const { categoria } = req.body;
    // Permitir borrar comentario enviando "" explícitamente
    const comentarioProvided = 'comentario' in req.body;
    const comentarioValue = comentarioProvided ? (req.body.comentario || null) : undefined;
    try {
      // Construir query dinámicamente para soportar borrar comentario
      let query = 'UPDATE evidencias SET updated_at = CURRENT_TIMESTAMP';
      const params = [];
      if (categoria) {
        query += ', categoria = ?';
        params.push(categoria);
      }
      if (comentarioProvided) {
        query += ', comentario = ?';
        params.push(comentarioValue);
      }
      query += ' WHERE id = ?';
      params.push(id);
      
      const [result] = await pool.query(query, params);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Evidencia no encontrada' });
      const [rows] = await pool.query('SELECT * FROM evidencias WHERE id = ?', [id]);
      const r = rows[0];
      res.json({
        id: r.id,
        proyectoId: r.proyecto_id,
        tareaId: r.tarea_id,
        categoria: r.categoria,
        tipo: r.evidence_type,
        comentario: r.comentario,
        imageUrl: buildPublicUrl(r.image_path),
        mimeType: r.mime_type,
        sizeBytes: r.size_bytes,
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      });
    } catch (err) {
      console.error('update evidencia error:', err);
      res.status(500).json({ error: 'Error al actualizar evidencia' });
    }
  }
);

// DELETE /api/evidencias/:id
router.delete(
  '/:id',
  [param('id').isInt({ min: 1 }).toInt()],
  checkValidation,
  async (req, res) => {
    const { id } = req.params;
    try {
      const [rows] = await pool.query('SELECT image_path FROM evidencias WHERE id = ?', [id]);
      if (!rows || rows.length === 0) return res.status(404).json({ error: 'Evidencia no encontrada' });
      const imagePath = rows[0].image_path;

      const [result] = await pool.query('DELETE FROM evidencias WHERE id = ?', [id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Evidencia no encontrada' });

      // Intentar eliminar el archivo físico
      try { if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath); } catch {}

      res.status(204).send();
    } catch (err) {
      console.error('delete evidencia error:', err);
      res.status(500).json({ error: 'Error al eliminar evidencia' });
    }
  }
);

// Exportar evidencias de un tipo a PDF
router.get('/export/pdf', [
  query('proyectoId').isInt({ min: 1 }).toInt(),
  query('tipo').isString().isLength({ min: 1, max: 50 })
], checkValidation, async (req, res) => {
  const { proyectoId, tipo } = req.query;
  try {
    const [rows] = await pool.query('SELECT id, comentario, image_path, evidence_type, tarea_id FROM evidencias WHERE proyecto_id = ? AND evidence_type = ? ORDER BY created_at ASC', [proyectoId, tipo]);
    if (!rows.length) return res.status(404).json({ error: 'Sin evidencias para ese tipo' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="evidencias_${tipo}_${proyectoId}.pdf"`);
    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);
    doc.fontSize(18).text(`Reporte de evidencias: ${tipo}`, { underline: true });
    doc.moveDown();
    for (const r of rows) {
      doc.fontSize(12).text(`ID ${r.id} · Tarea: ${r.tarea_id || '—'}`);
      if (r.comentario) doc.fontSize(10).text(r.comentario, { width: 500 });
      try {
        if (r.image_path && fs.existsSync(r.image_path)) {
          const ext = path.extname(r.image_path).toLowerCase();
            // Ajuste de ancho
          const imgOpts = { fit: [500, 300], align: 'center' };
          doc.image(r.image_path, imgOpts);
        }
      } catch {}
      doc.moveDown();
      if (doc.y > doc.page.height - 120) doc.addPage();
    }
    doc.end();
  } catch (err) {
    console.error('export pdf evidencias error:', err);
    res.status(500).json({ error: 'Error exportando PDF' });
  }
});

module.exports = router;
 
// ======== Asociaciones Evidencia ⇄ Normas-Repo ========

// Utilidades para grupos
async function getEvidenceIdsByGroupKey(db, groupKey) {
  const [rows] = await db.query('SELECT id, image_path FROM evidencias WHERE group_key = ?', [groupKey]);
  return rows || [];
}

function maxSeverity(a, b) {
  const rank = { 'OK': 0, 'LEVE': 1, 'CRITICO': 2 };
  return (rank[a] || 0) >= (rank[b] || 0) ? a : b;
}

// Listar normas por grupo (únicas)
router.get(
  '/groups/:groupKey/normas-repo',
  [param('groupKey').isString().isLength({ min: 1 })],
  checkValidation,
  async (req, res) => {
    const { groupKey } = req.params;
    try {
      const evids = await getEvidenceIdsByGroupKey(pool, groupKey);
      if (!evids.length) return res.json({ items: [] });
      const ids = evids.map(e => e.id);
      const placeholders = ids.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT enr.evidencia_id, enr.norma_repo_id AS id, nr.titulo, nr.descripcion, nr.categoria, nr.fuente, enr.clasificacion, enr.observacion
         FROM evidencias_normas_repo enr INNER JOIN normas_repo nr ON nr.id = enr.norma_repo_id
         WHERE enr.evidencia_id IN (${placeholders})`
        , ids);
      // Deduplicar por norma_repo y tomar max severidad
      const byId = new Map();
      for (const r of rows) {
        if (!byId.has(r.id)) byId.set(r.id, r);
        else {
          const prev = byId.get(r.id);
          prev.clasificacion = maxSeverity(prev.clasificacion || 'LEVE', r.clasificacion || 'LEVE');
          byId.set(r.id, prev);
        }
      }
      res.json({ items: Array.from(byId.values()) });
    } catch (err) {
      console.error('list group normas-repo error:', err);
      res.status(500).json({ error: 'Error obteniendo normas del grupo' });
    }
  }
);

// Asociar norma a todas las evidencias del grupo
router.post(
  '/groups/:groupKey/normas-repo',
  [
    param('groupKey').isString().isLength({ min: 1 }),
    body('normaRepoId').isInt({ min: 1 }).toInt(),
    body('clasificacion').optional().isIn(['OK','LEVE','CRITICO']),
    body('observacion').optional().isString().isLength({ max: 1000 })
  ],
  checkValidation,
  async (req, res) => {
    const { groupKey } = req.params;
    const { normaRepoId, clasificacion, observacion } = req.body;
    try {
      const evids = await getEvidenceIdsByGroupKey(pool, groupKey);
      if (!evids.length) return res.status(404).json({ error: 'Grupo no encontrado' });
      for (const e of evids) {
        await pool.query(
          `INSERT INTO evidencias_normas_repo (evidencia_id, norma_repo_id, clasificacion, observacion)
           VALUES (?, ?, COALESCE(?, 'LEVE'), COALESCE(?, NULL))
           ON CONFLICT(evidencia_id, norma_repo_id)
           DO UPDATE SET clasificacion = COALESCE(excluded.clasificacion, evidencias_normas_repo.clasificacion),
                         observacion = COALESCE(excluded.observacion, evidencias_normas_repo.observacion),
                         updated_at = CURRENT_TIMESTAMP`,
          [e.id, normaRepoId, clasificacion || null, observacion || null]
        );
      }
      // devolver agregado actual
      const r = await pool.query('SELECT 1'); // no usado; solo para mantener simetría
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error('attach group norma-repo error:', err);
      res.status(500).json({ error: 'Error asociando norma al grupo' });
    }
  }
);

// Eliminar asociación para todo el grupo
router.delete(
  '/groups/:groupKey/normas-repo/:normaRepoId',
  [param('groupKey').isString().isLength({ min: 1 }), param('normaRepoId').isInt({ min: 1 }).toInt()],
  checkValidation,
  async (req, res) => {
    const { groupKey, normaRepoId } = req.params;
    try {
      const evids = await getEvidenceIdsByGroupKey(pool, groupKey);
      if (!evids.length) return res.status(404).json({ error: 'Grupo no encontrado' });
      const ids = evids.map(e => e.id);
      const placeholders = ids.map(() => '?').join(',');
      await pool.query(`DELETE FROM evidencias_normas_repo WHERE norma_repo_id = ? AND evidencia_id IN (${placeholders})`, [normaRepoId, ...ids]);
      res.status(204).send();
    } catch (err) {
      console.error('detach group norma-repo error:', err);
      res.status(500).json({ error: 'Error eliminando asociación del grupo' });
    }
  }
);

// Eliminar todas las evidencias de un grupo
router.delete(
  '/groups/:groupKey',
  [param('groupKey').isString().isLength({ min: 1 })],
  checkValidation,
  async (req, res) => {
    const { groupKey } = req.params;
    try {
      const evids = await getEvidenceIdsByGroupKey(pool, groupKey);
      if (!evids.length) return res.status(404).json({ error: 'Grupo no encontrado' });
      const ids = evids.map(e => e.id);
      const placeholders = ids.map(() => '?').join(',');
      // eliminar asociaciones primero por FK
      await pool.query(`DELETE FROM evidencias_normas_repo WHERE evidencia_id IN (${placeholders})`, ids);
      // guardar rutas para borrar archivos
      const paths = evids.map(e => e.image_path).filter(Boolean);
      await pool.query(`DELETE FROM evidencias WHERE id IN (${placeholders})`, ids);
      // borrar archivos físicos de forma tolerante
      for (const p of paths) { try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch {} }
      res.status(204).send();
    } catch (err) {
      console.error('delete group error:', err);
      res.status(500).json({ error: 'Error eliminando grupo' });
    }
  }
);

// Listar normas/incumplimientos asociados a una evidencia
router.get(
  '/:id/normas-repo',
  [param('id').isInt({ min: 1 }).toInt()],
  checkValidation,
  async (req, res) => {
    const { id } = req.params;
    try {
      const [rows] = await pool.query(
        `SELECT enr.norma_repo_id AS id,
                nr.titulo,
                nr.descripcion,
                nr.categoria,
                nr.fuente,
                enr.clasificacion,
                enr.observacion
         FROM evidencias_normas_repo enr
         INNER JOIN normas_repo nr ON nr.id = enr.norma_repo_id
         WHERE enr.evidencia_id = ?
         ORDER BY nr.categoria, nr.titulo`,
        [id]
      );
      res.json({ items: rows });
    } catch (err) {
      console.error('list evidencia normas-repo error:', err);
      res.status(500).json({ error: 'Error obteniendo asociaciones' });
    }
  }
);

// Asociar/actualizar una norma del repositorio a la evidencia
router.post(
  '/:id/normas-repo',
  [
    param('id').isInt({ min: 1 }).toInt(),
    body('normaRepoId').isInt({ min: 1 }).toInt(),
    body('clasificacion').optional().isIn(['OK','LEVE','CRITICO']),
    body('observacion').optional().isString().isLength({ max: 1000 })
  ],
  checkValidation,
  async (req, res) => {
    const { id } = req.params;
    const { normaRepoId, clasificacion, observacion } = req.body;
    try {
      // verificar existencia
      const [[evRows],[nrRows]] = await Promise.all([
        pool.query('SELECT id FROM evidencias WHERE id = ?', [id]),
        pool.query('SELECT id FROM normas_repo WHERE id = ?', [normaRepoId])
      ]);
      if (!evRows || evRows.length === 0) return res.status(404).json({ error: 'Evidencia no encontrada' });
      if (!nrRows || nrRows.length === 0) return res.status(404).json({ error: 'Norma de repositorio no encontrada' });

      await pool.query(
        `INSERT INTO evidencias_normas_repo (evidencia_id, norma_repo_id, clasificacion, observacion)
         VALUES (?, ?, COALESCE(?, 'LEVE'), COALESCE(?, NULL))
         ON CONFLICT(evidencia_id, norma_repo_id)
         DO UPDATE SET clasificacion = COALESCE(excluded.clasificacion, evidencias_normas_repo.clasificacion),
                       observacion = COALESCE(excluded.observacion, evidencias_normas_repo.observacion),
                       updated_at = CURRENT_TIMESTAMP`,
        [id, normaRepoId, clasificacion || null, observacion || null]
      );

      const [rows] = await pool.query(
        `SELECT enr.norma_repo_id AS id, nr.titulo, nr.descripcion, nr.categoria, nr.fuente, enr.clasificacion, enr.observacion
         FROM evidencias_normas_repo enr INNER JOIN normas_repo nr ON nr.id = enr.norma_repo_id
         WHERE enr.evidencia_id = ? AND enr.norma_repo_id = ?`,
        [id, normaRepoId]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error('attach evidencia norma-repo error:', err);
      res.status(500).json({ error: 'Error asociando norma a evidencia' });
    }
  }
);

// Eliminar asociación
router.delete(
  '/:id/normas-repo/:normaRepoId',
  [param('id').isInt({ min: 1 }).toInt(), param('normaRepoId').isInt({ min: 1 }).toInt()],
  checkValidation,
  async (req, res) => {
    const { id, normaRepoId } = req.params;
    try {
      await pool.query('DELETE FROM evidencias_normas_repo WHERE evidencia_id = ? AND norma_repo_id = ?', [id, normaRepoId]);
      res.status(204).send();
    } catch (err) {
      console.error('detach evidencia norma-repo error:', err);
      res.status(500).json({ error: 'Error eliminando asociación' });
    }
  }
);
