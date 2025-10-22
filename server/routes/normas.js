const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { body, param, query, validationResult } = require('express-validator');
const pool = require('../models/db');

let pdfParse = null;
try { pdfParse = require('pdf-parse'); } catch { /* opcional */ }

const router = express.Router();

function getUploadsBase() {
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
    const dir = path.join(getUploadsBase(), 'normas', String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || (file.mimetype === 'application/pdf' ? '.pdf' : file.mimetype === 'text/plain' ? '.txt' : '');
    const unique = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    cb(null, unique + ext);
  }
});

function fileFilter(req, file, cb) {
  const ok = ['application/pdf', 'text/plain'].includes(file.mimetype);
  if (!ok) return cb(new Error('Tipo de archivo no permitido (solo PDF o TXT)'));
  cb(null, true);
}

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 }, fileFilter });

const checkValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

function buildPublicUrl(absPath) {
  const base = getUploadsBase();
  const rel = path.relative(base, absPath).replace(/\\/g, '/');
  return `/uploads/${rel}`;
}

async function extractTextIfPossible(filePath, mime) {
  try {
    if (mime === 'text/plain') {
      return fs.readFileSync(filePath, 'utf8').slice(0, 100000);
    }
    if (mime === 'application/pdf' && pdfParse) {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return (data && data.text ? data.text : '').slice(0, 200000);
    }
  } catch {
    // ignore
  }
  return null;
}

// POST /api/normas/upload
router.post(
  '/upload',
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: 'Error procesando archivo', detail: err && err.message ? err.message : String(err) });
      }
      next();
    });
  },
  [
    body('titulo').isString().trim().isLength({ min: 1, max: 200 }),
    body('descripcion').optional().isString().trim().isLength({ max: 2000 }),
    body('etiquetas').optional().isString().trim().isLength({ max: 500 }),
    body('proyectoId').optional().isInt({ min: 1 }).toInt(),
    body('tareaId').optional().isInt({ min: 1 }).toInt(),
  ],
  checkValidation,
  async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'Archivo requerido' });
      const { titulo } = req.body;
      const descripcion = req.body.descripcion ? String(req.body.descripcion) : null;
      const etiquetas = req.body.etiquetas ? String(req.body.etiquetas) : null;
      const proyectoId = req.body.proyectoId || null;
      const tareaId = req.body.tareaId || null;

      // Extraer texto para búsqueda
      const texto = await extractTextIfPossible(file.path, file.mimetype);

      const [result] = await pool.query(
        'INSERT INTO normas (titulo, descripcion, etiquetas, file_path, file_name, mime_type, size_bytes, texto_extraido) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [titulo, descripcion, etiquetas, file.path, file.originalname, file.mimetype, file.size, texto || null]
      );

      const normaId = result.insertId;

      if (proyectoId) {
        await pool.query('INSERT OR IGNORE INTO proyecto_normas (proyecto_id, norma_id) VALUES (?, ?)', [proyectoId, normaId]);
      }
      if (tareaId) {
        await pool.query('INSERT OR IGNORE INTO tarea_normas (tarea_id, norma_id) VALUES (?, ?)', [tareaId, normaId]);
      }

      const fileUrl = buildPublicUrl(file.path);
      res.status(201).json({ id: normaId, titulo, descripcion, etiquetas, fileUrl, mimeType: file.mimetype, sizeBytes: file.size });
    } catch (err) {
      console.error('upload norma error:', err);
      res.status(500).json({ error: 'Error al subir norma' });
    }
  }
);

// GET /api/normas
router.get(
  '/',
  [
    query('search').optional().isString().trim(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  checkValidation,
  async (req, res) => {
    const search = req.query.search ? String(req.query.search).trim() : '';
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const offset = (page - 1) * limit;
    try {
      let where = '';
      const params = [];
      if (search) {
        where = `WHERE (titulo LIKE ? OR descripcion LIKE ? OR etiquetas LIKE ? OR (texto_extraido IS NOT NULL AND texto_extraido LIKE ?))`;
        for (let i = 0; i < 4; i++) params.push(`%${search}%`);
      }
      const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM normas ${where}`, params);
      const total = countRows[0]?.total || 0;

      const [rows] = await pool.query(`SELECT * FROM normas ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, Number(limit), Number(offset)]);
      const items = rows.map(r => ({
        id: r.id,
        titulo: r.titulo,
        descripcion: r.descripcion,
        etiquetas: r.etiquetas,
        fileUrl: buildPublicUrl(r.file_path),
        mimeType: r.mime_type,
        sizeBytes: r.size_bytes,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      res.json({ items, page: Number(page), limit: Number(limit), total, totalPages: Math.max(1, Math.ceil(total / limit)) });
    } catch (err) {
      console.error('list normas error:', err);
      res.status(500).json({ error: 'Error al obtener normas' });
    }
  }
);

// GET /api/normas/by-project/:proyectoId
router.get(
  '/by-project/:proyectoId',
  [param('proyectoId').isInt({ min: 1 }).toInt()],
  checkValidation,
  async (req, res) => {
    const { proyectoId } = req.params;
    try {
      const [rows] = await pool.query(
        `SELECT n.* FROM normas n INNER JOIN proyecto_normas pn ON pn.norma_id = n.id WHERE pn.proyecto_id = ? ORDER BY n.created_at DESC`,
        [proyectoId]
      );
      const items = rows.map(r => ({
        id: r.id,
        titulo: r.titulo,
        descripcion: r.descripcion,
        etiquetas: r.etiquetas,
        fileUrl: buildPublicUrl(r.file_path),
        mimeType: r.mime_type,
        sizeBytes: r.size_bytes,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      res.json(items);
    } catch (err) {
      console.error('by-project normas error:', err);
      res.status(500).json({ error: 'Error al obtener normas del proyecto' });
    }
  }
);

// GET /api/normas/by-task/:tareaId
router.get(
  '/by-task/:tareaId',
  [param('tareaId').isInt({ min: 1 }).toInt()],
  checkValidation,
  async (req, res) => {
    const { tareaId } = req.params;
    try {
      const [rows] = await pool.query(
        `SELECT n.* FROM normas n INNER JOIN tarea_normas tn ON tn.norma_id = n.id WHERE tn.tarea_id = ? ORDER BY n.created_at DESC`,
        [tareaId]
      );
      const items = rows.map(r => ({
        id: r.id,
        titulo: r.titulo,
        descripcion: r.descripcion,
        etiquetas: r.etiquetas,
        fileUrl: buildPublicUrl(r.file_path),
        mimeType: r.mime_type,
        sizeBytes: r.size_bytes,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      res.json(items);
    } catch (err) {
      console.error('by-task normas error:', err);
      res.status(500).json({ error: 'Error al obtener normas de la tarea' });
    }
  }
);

// POST /api/normas/:id/attach
router.post(
  '/:id/attach',
  [
    param('id').isInt({ min: 1 }).toInt(),
    body('proyectoId').optional().isInt({ min: 1 }).toInt(),
    body('tareaId').optional().isInt({ min: 1 }).toInt(),
  ],
  checkValidation,
  async (req, res) => {
    const { id } = req.params;
    const { proyectoId, tareaId } = req.body;
    if (!proyectoId && !tareaId) return res.status(400).json({ error: 'proyectoId o tareaId requerido' });
    try {
      if (proyectoId) await pool.query('INSERT OR IGNORE INTO proyecto_normas (proyecto_id, norma_id) VALUES (?, ?)', [proyectoId, id]);
      if (tareaId) await pool.query('INSERT OR IGNORE INTO tarea_normas (tarea_id, norma_id) VALUES (?, ?)', [tareaId, id]);
      res.json({ ok: true });
    } catch (err) {
      console.error('attach norma error:', err);
      res.status(500).json({ error: 'Error al asociar norma' });
    }
  }
);

// POST /api/normas/:id/detach
router.post(
  '/:id/detach',
  [
    param('id').isInt({ min: 1 }).toInt(),
    body('proyectoId').optional().isInt({ min: 1 }).toInt(),
    body('tareaId').optional().isInt({ min: 1 }).toInt(),
  ],
  checkValidation,
  async (req, res) => {
    const { id } = req.params;
    const { proyectoId, tareaId } = req.body;
    if (!proyectoId && !tareaId) return res.status(400).json({ error: 'proyectoId o tareaId requerido' });
    try {
      if (proyectoId) await pool.query('DELETE FROM proyecto_normas WHERE proyecto_id = ? AND norma_id = ?', [proyectoId, id]);
      if (tareaId) await pool.query('DELETE FROM tarea_normas WHERE tarea_id = ? AND norma_id = ?', [tareaId, id]);
      res.json({ ok: true });
    } catch (err) {
      console.error('detach norma error:', err);
      res.status(500).json({ error: 'Error al desasociar norma' });
    }
  }
);

// DELETE /api/normas/:id
router.delete(
  '/:id',
  [param('id').isInt({ min: 1 }).toInt()],
  checkValidation,
  async (req, res) => {
    const { id } = req.params;
    try {
      const [rows] = await pool.query('SELECT file_path FROM normas WHERE id = ?', [id]);
      if (!rows || rows.length === 0) return res.status(404).json({ error: 'Norma no encontrada' });
      const filePath = rows[0].file_path;
      await pool.query('DELETE FROM normas WHERE id = ?', [id]);
      try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
      res.status(204).send();
    } catch (err) {
      console.error('delete norma error:', err);
      res.status(500).json({ error: 'Error al eliminar norma' });
    }
  }
);

module.exports = router;
