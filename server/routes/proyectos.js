const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const router = express.Router();
const pool = require('../models/db');

// Helper validación
const checkValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// Listar proyectos con paginación, búsqueda y progreso
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim()
  ],
  checkValidation,
  async (req, res) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    const search = req.query.search ? `%${req.query.search}%` : '%';
    const offset = (page - 1) * limit;

    try {
      const [countRows] = await pool.query(
        'SELECT COUNT(*) AS total FROM proyectos WHERE nombre LIKE ? OR cliente LIKE ?',
        [search, search]
      );
      const total = countRows[0]?.total || 0;
      
      // Obtener proyectos con progreso calculado
      const [rows] = await pool.query(`
        SELECT 
          p.*,
          COALESCE(AVG(t.progreso), 0) as progreso_general,
          COUNT(t.id) as total_tareas,
          COUNT(CASE WHEN t.progreso = 100 THEN 1 END) as tareas_completadas,
          (SELECT COUNT(*) FROM fases f WHERE f.proyecto_id = p.id) as total_fases,
          (SELECT COUNT(*) FROM fases f WHERE f.proyecto_id = p.id AND f.estado = 'Completado') as fases_completadas
        FROM proyectos p 
        LEFT JOIN tareas t ON p.id = t.proyecto_id 
        WHERE p.nombre LIKE ? OR p.cliente LIKE ? 
        GROUP BY p.id 
        ORDER BY p.id DESC 
        LIMIT ? OFFSET ?
      `, [search, search, Number(limit), Number(offset)]);
      
      res.json({
        data: rows,
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al obtener proyectos' });
    }
  }
);

// Obtener proyecto por id con fases y tareas
router.get(
  '/:id',
  [param('id').isInt({ min: 1 }).toInt()],
  checkValidation,
  async (req, res) => {
    const { id } = req.params;
    try {
      // Obtener proyecto
      const [proyectoRows] = await pool.query('SELECT * FROM proyectos WHERE id = ?', [id]);
      if (proyectoRows.length === 0) return res.status(404).json({ error: 'Proyecto no encontrado' });
      
      const proyecto = proyectoRows[0];
      
      // Obtener fases del proyecto
      const [fasesRows] = await pool.query(
        'SELECT * FROM fases WHERE proyecto_id = ? ORDER BY id',
        [id]
      );
      
      // Obtener tareas del proyecto con información del responsable
      const [tareasRows] = await pool.query(`
        SELECT 
          t.*,
          u.nombre as responsable_nombre,
          u.email as responsable_email
        FROM tareas t 
        LEFT JOIN usuarios u ON t.responsable = u.id 
        WHERE t.proyecto_id = ? 
        ORDER BY t.id DESC
      `, [id]);
      
      proyecto.fases = fasesRows;
      proyecto.tareas = tareasRows;
      
      res.json(proyecto);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al obtener proyecto' });
    }
  }
);

// Crear proyecto con fases automáticas
router.post(
  '/',
  [
    body('nombre').isString().trim().isLength({ min: 1, max: 100 }),
    body('cliente').isString().trim().isLength({ min: 1, max: 100 }),
    body('fecha_inicio').optional().isISO8601().toDate(),
    body('fecha_fin').optional().isISO8601().toDate()
  ],
  checkValidation,
  async (req, res) => {
    const { nombre, cliente, fecha_inicio, fecha_fin } = req.body;
    try {
      // Crear proyecto
      const [result] = await pool.query(
        'INSERT INTO proyectos (nombre, cliente, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)',
        [nombre, cliente, fecha_inicio || null, fecha_fin || null]
      );
      
      const proyectoId = result.insertId;
      
      // Crear fases automáticas
      const fases = ['Planificación', 'Ejecución', 'Cierre'];
      for (const fase of fases) {
        await pool.query(
          'INSERT INTO fases (proyecto_id, nombre, estado) VALUES (?, ?, ?)',
          [proyectoId, fase, 'Pendiente']
        );
      }
      
      // Obtener proyecto completo con fases
      const [rows] = await pool.query('SELECT * FROM proyectos WHERE id = ?', [proyectoId]);
      
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al crear proyecto' });
    }
  }
);

// Actualizar
router.put(
  '/:id',
  [
    param('id').isInt({ min: 1 }).toInt(),
    body('nombre').optional().isString().trim().isLength({ min: 1, max: 100 }),
    body('cliente').optional().isString().trim().isLength({ min: 1, max: 100 }),
    body('fecha_inicio').optional().isISO8601().toDate(),
    body('fecha_fin').optional().isISO8601().toDate()
  ],
  checkValidation,
  async (req, res) => {
    const { id } = req.params;
    const { nombre, cliente, fecha_inicio, fecha_fin } = req.body;
    try {
      const [result] = await pool.query(
        'UPDATE proyectos SET nombre = COALESCE(?, nombre), cliente = COALESCE(?, cliente), fecha_inicio = COALESCE(?, fecha_inicio), fecha_fin = COALESCE(?, fecha_fin) WHERE id = ?',
        [nombre, cliente, fecha_inicio || null, fecha_fin || null, id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Proyecto no encontrado' });
      const [rows] = await pool.query('SELECT * FROM proyectos WHERE id = ?', [id]);
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al actualizar proyecto' });
    }
  }
);

// Eliminar
router.delete(
  '/:id',
  [param('id').isInt({ min: 1 }).toInt()],
  checkValidation,
  async (req, res) => {
    const { id } = req.params;
    try {
      const [result] = await pool.query('DELETE FROM proyectos WHERE id = ?', [id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Proyecto no encontrado' });
      res.json({ message: 'Proyecto eliminado' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al eliminar proyecto' });
    }
  }
);

// ===== RUTAS PARA FASES =====

// Actualizar estado de fase
router.put(
  '/:proyectoId/fases/:faseId',
  [
    param('proyectoId').isInt({ min: 1 }).toInt(),
    param('faseId').isInt({ min: 1 }).toInt(),
    body('estado').isString().isIn(['Pendiente', 'En progreso', 'Completado']),
    body('fecha_inicio').optional().isISO8601().toDate(),
    body('fecha_fin').optional().isISO8601().toDate()
  ],
  checkValidation,
  async (req, res) => {
    const { proyectoId, faseId } = req.params;
    const { estado, fecha_inicio, fecha_fin } = req.body;
    
    try {
      const [result] = await pool.query(
        'UPDATE fases SET estado = ?, fecha_inicio = COALESCE(?, fecha_inicio), fecha_fin = COALESCE(?, fecha_fin) WHERE id = ? AND proyecto_id = ?',
        [estado, fecha_inicio, fecha_fin, faseId, proyectoId]
      );
      
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Fase no encontrada' });
      
      const [rows] = await pool.query('SELECT * FROM fases WHERE id = ?', [faseId]);
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al actualizar fase' });
    }
  }
);

module.exports = router;