const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { body, param, query, validationResult } = require('express-validator');
const pool = require('../models/db');

const router = express.Router();

// Directorio base para uploads
function getUploadsBase() {
  // En desarrollo: dentro de data/uploads. En prod: en carpeta de datos del usuario
  if (process.env.NODE_ENV === 'production') {
    const userDataPath = process.env.APPDATA || process.env.HOME || __dirname;
    const base = path.join(userDataPath, 'GestionProyectos', 'uploads');
    fs.mkdirSync(base, { recursive: true });
    return base;
  }
  const base = path.join(__dirname, '..', '..', 'data', 'uploads');
  fs.mkdirSync(base, { recursive: true });
  return base;
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const now = new Date();
    const dir = path.join(getUploadsBase(), 'evidencias', String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
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

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter });

const checkValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// Helper: construir URL pública desde image_path
function buildPublicUrl(imagePathAbs) {
  // Buscar la porción después de uploads para montar como /uploads/...
  const base = getUploadsBase();
  const rel = path.relative(base, imagePathAbs).replace(/\\/g, '/');
  return `/uploads/${rel}`;
}

// Normaliza comentario para claves de grupo
function normalizeComment(c) {
  return String(c || '')
    .replace(/^\s*\[(INSTITUCION|PORTADA)\]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Construye clave de grupo estable a partir de tarea+comentario
function buildGroupKey(tareaId, comentario) {
  const t = tareaId ? Number(tareaId) : 0;
  const cm = normalizeComment(comentario);
  return `t${t}|c${cm}`;
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
    // La categoría de la evidencia ya no es obligatoria; el estado se maneja por incumplimiento asociado
    body('categoria').optional().isString().isIn(['OK', 'LEVE', 'CRITICO']),
    body('comentario').optional().isString().trim().isLength({ max: 1000 })
  ],
  checkValidation,
  async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'Imagen requerida' });

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

      const groupKey = buildGroupKey(tId, comentario);
      const [result] = await pool.query(
        'INSERT INTO evidencias (proyecto_id, tarea_id, categoria, comentario, image_path, mime_type, size_bytes, created_by, group_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [pId, tId || null, categoria || 'OK', comentario || null, imagePath, mime, size, createdBy, groupKey]
      );

      const id = result.insertId;
      const relUrl = buildPublicUrl(imagePath);
      const absUrl = `${req.protocol}://${req.get('host')}${relUrl.startsWith('/') ? relUrl : ('/' + relUrl)}`;
      return res.status(201).json({
        id,
        proyectoId: pId,
        tareaId: tId,
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
    body('comentario').optional().isString().trim().isLength({ max: 1000 })
  ],
  checkValidation,
  async (req, res) => {
    try {
      const files = req.files || [];
      if (!Array.isArray(files) || files.length === 0) return res.status(400).json({ error: 'Se requiere al menos una imagen' });
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

      const groupKey = buildGroupKey(tId, comentario);
      const createdBy = null;
      const out = [];
      for (const f of files) {
        const [r] = await pool.query(
          'INSERT INTO evidencias (proyecto_id, tarea_id, categoria, comentario, image_path, mime_type, size_bytes, created_by, group_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [pId, tId || null, categoria, comentario || null, f.path, f.mimetype, f.size, createdBy, groupKey]
        );
        const id = r.insertId;
        const relUrl = buildPublicUrl(f.path);
        const absUrl = `${req.protocol}://${req.get('host')}${relUrl.startsWith('/') ? relUrl : ('/' + relUrl)}`;
        out.push({ id, proyectoId: pId, tareaId: tId, categoria, comentario: comentario || null, imageUrl: absUrl, mimeType: f.mimetype, sizeBytes: f.size, createdBy, groupKey });
      }
      res.status(201).json({ items: out, groupKey });
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
    query('group').optional().isIn(['true','false']),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
  ],
  checkValidation,
  async (req, res) => {
    const { proyectoId, tareaId, categoria } = req.query;
    const wantGroups = String(req.query.group || 'false') === 'true';
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const offset = (page - 1) * limit;

    try {
      const where = ['proyecto_id = ?'];
      const params = [proyectoId];
      if (tareaId) { where.push('tarea_id = ?'); params.push(tareaId); }
      if (categoria) { where.push('categoria = ?'); params.push(categoria); }
      const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
      if (!wantGroups) {
        const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM evidencias ${whereSql}`, params);
        const total = countRows[0]?.total || 0;
        const [rows] = await pool.query(
          `SELECT * FROM evidencias ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
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
        `SELECT id, proyecto_id, tarea_id, comentario, image_path, mime_type, size_bytes, created_at, group_key
         FROM evidencias ${whereSql} ORDER BY created_at DESC`,
        params
      );
      const map = new Map();
      for (const r of rows) {
        // Omitir evidencias institucionales en el modo agrupado
        if (/^\s*\[(INSTITUCION|PORTADA)\]/i.test(String(r.comentario || ''))) continue;
        const key = r.group_key || buildGroupKey(r.tarea_id, r.comentario);
        if (!map.has(key)) map.set(key, { groupKey: key, proyectoId: r.proyecto_id, tareaId: r.tarea_id, comentario: normalizeComment(r.comentario), evidenciaIds: [], images: [] });
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
    const { categoria, comentario } = req.body;
    try {
      const [result] = await pool.query(
        'UPDATE evidencias SET categoria = COALESCE(?, categoria), comentario = COALESCE(?, comentario), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [categoria || null, comentario || null, id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Evidencia no encontrada' });
      const [rows] = await pool.query('SELECT * FROM evidencias WHERE id = ?', [id]);
      const r = rows[0];
      res.json({
        id: r.id,
        proyectoId: r.proyecto_id,
        tareaId: r.tarea_id,
        categoria: r.categoria,
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
