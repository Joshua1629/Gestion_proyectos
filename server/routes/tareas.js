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

// ===== RUTAS PARA TAREAS =====

// Listar tareas de un proyecto
router.get(
  '/proyecto/:proyectoId',
  [
    param('proyectoId').isInt({ min: 1 }).toInt(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
  ],
  checkValidation,
  async (req, res) => {
    const { proyectoId } = req.params;
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const offset = (page - 1) * limit;

    try {
      const [countRows] = await pool.query(
        'SELECT COUNT(*) AS total FROM tareas WHERE proyecto_id = ?',
        [proyectoId]
      );
      const total = countRows[0]?.total || 0;
      
      const [rows] = await pool.query(`
        SELECT 
          t.*,
          u.nombre as responsable_nombre,
          u.email as responsable_email,
          (SELECT COUNT(*) FROM comentarios c WHERE c.tarea_id = t.id) as total_comentarios
        FROM tareas t 
        LEFT JOIN usuarios u ON t.responsable = u.id 
        WHERE t.proyecto_id = ? 
        ORDER BY t.id DESC 
        LIMIT ? OFFSET ?
      `, [proyectoId, Number(limit), Number(offset)]);
      
      res.json({
        data: rows,
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al obtener tareas' });
    }
  }
);

// Obtener tarea por id con comentarios
router.get(
  '/:id',
  [param('id').isInt({ min: 1 }).toInt()],
  checkValidation,
  async (req, res) => {
    const { id } = req.params;
    try {
      // Obtener tarea con información del responsable
      const [tareaRows] = await pool.query(`
        SELECT 
          t.*,
          u.nombre as responsable_nombre,
          u.email as responsable_email
        FROM tareas t 
        LEFT JOIN usuarios u ON t.responsable = u.id 
        WHERE t.id = ?
      `, [id]);
      
      if (tareaRows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
      
      const tarea = tareaRows[0];
      
      // Obtener comentarios de la tarea
      const [comentariosRows] = await pool.query(`
        SELECT 
          c.*,
          u.nombre as usuario_nombre,
          u.email as usuario_email
        FROM comentarios c 
        LEFT JOIN usuarios u ON c.usuario_id = u.id 
        WHERE c.tarea_id = ? 
        ORDER BY c.fecha_comentario ASC
      `, [id]);
      
      tarea.comentarios = comentariosRows;
      
      res.json(tarea);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al obtener tarea' });
    }
  }
);

// Crear tarea
router.post(
  '/',
  [
    body('proyecto_id').isInt({ min: 1 }),
    body('nombre').isString().trim().isLength({ min: 1, max: 100 }),
    body('responsable').optional().isInt({ min: 1 }),
    body('prioridad').optional().isString().isIn(['Baja', 'Media', 'Alta']),
    body('fecha_limite').optional().isISO8601().toDate(),
    body('progreso').optional().isInt({ min: 0, max: 100 })
  ],
  checkValidation,
  async (req, res) => {
    const { proyecto_id, nombre, responsable, prioridad, fecha_limite, progreso } = req.body;
    
    try {
      // Verificar que el proyecto existe
      const [proyectoRows] = await pool.query('SELECT id FROM proyectos WHERE id = ?', [proyecto_id]);
      if (proyectoRows.length === 0) return res.status(400).json({ error: 'Proyecto no encontrado' });
      
      const [result] = await pool.query(
        'INSERT INTO tareas (proyecto_id, nombre, responsable, prioridad, fecha_limite, progreso) VALUES (?, ?, ?, ?, ?, ?)',
        [proyecto_id, nombre, responsable || null, prioridad || 'Media', fecha_limite || null, progreso || 0]
      );
      
      // Obtener tarea completa
      const [rows] = await pool.query(`
        SELECT 
          t.*,
          u.nombre as responsable_nombre,
          u.email as responsable_email
        FROM tareas t 
        LEFT JOIN usuarios u ON t.responsable = u.id 
        WHERE t.id = ?
      `, [result.insertId]);
      
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al crear tarea' });
    }
  }
);

// Actualizar tarea
router.put(
  '/:id',
  [
    param('id').isInt({ min: 1 }).toInt(),
    body('nombre').optional().isString().trim().isLength({ min: 1, max: 100 }),
    body('responsable').optional().isInt({ min: 1 }),
    body('prioridad').optional().isString().isIn(['Baja', 'Media', 'Alta']),
    body('fecha_limite').optional().isISO8601().toDate(),
    body('progreso').optional().isInt({ min: 0, max: 100 })
  ],
  checkValidation,
  async (req, res) => {
    const { id } = req.params;
    const { nombre, responsable, prioridad, fecha_limite, progreso } = req.body;
    
    try {
      const [result] = await pool.query(
        'UPDATE tareas SET nombre = COALESCE(?, nombre), responsable = COALESCE(?, responsable), prioridad = COALESCE(?, prioridad), fecha_limite = COALESCE(?, fecha_limite), progreso = COALESCE(?, progreso) WHERE id = ?',
        [nombre, responsable, prioridad, fecha_limite, progreso, id]
      );
      
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
      
      // Obtener tarea actualizada
      const [rows] = await pool.query(`
        SELECT 
          t.*,
          u.nombre as responsable_nombre,
          u.email as responsable_email
        FROM tareas t 
        LEFT JOIN usuarios u ON t.responsable = u.id 
        WHERE t.id = ?
      `, [id]);
      
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al actualizar tarea' });
    }
  }
);

// Eliminar tarea
router.delete(
  '/:id',
  [param('id').isInt({ min: 1 }).toInt()],
  checkValidation,
  async (req, res) => {
    const { id } = req.params;
    try {
      const [result] = await pool.query('DELETE FROM tareas WHERE id = ?', [id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
      res.json({ message: 'Tarea eliminada correctamente' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al eliminar tarea' });
    }
  }
);

// ===== RUTAS PARA COMENTARIOS =====

// Agregar comentario a una tarea
router.post(
  '/:tareaId/comentarios',
  [
    param('tareaId').isInt({ min: 1 }).toInt(),
    body('usuario_id').isInt({ min: 1 }),
    body('comentario').isString().trim().isLength({ min: 1, max: 1000 })
  ],
  checkValidation,
  async (req, res) => {
    const { tareaId } = req.params;
    const { usuario_id, comentario } = req.body;
    
    try {
      // Verificar que la tarea existe
      const [tareaRows] = await pool.query('SELECT id FROM tareas WHERE id = ?', [tareaId]);
      if (tareaRows.length === 0) return res.status(400).json({ error: 'Tarea no encontrada' });
      
      const [result] = await pool.query(
        'INSERT INTO comentarios (tarea_id, usuario_id, comentario) VALUES (?, ?, ?)',
        [tareaId, usuario_id, comentario]
      );
      
      // Obtener comentario con información del usuario
      const [rows] = await pool.query(`
        SELECT 
          c.*,
          u.nombre as usuario_nombre,
          u.email as usuario_email
        FROM comentarios c 
        LEFT JOIN usuarios u ON c.usuario_id = u.id 
        WHERE c.id = ?
      `, [result.insertId]);
      
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al agregar comentario' });
    }
  }
);

// Obtener comentarios de una tarea
router.get(
  '/:tareaId/comentarios',
  [
    param('tareaId').isInt({ min: 1 }).toInt(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt()
  ],
  checkValidation,
  async (req, res) => {
    const { tareaId } = req.params;
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const offset = (page - 1) * limit;

    try {
      const [countRows] = await pool.query(
        'SELECT COUNT(*) AS total FROM comentarios WHERE tarea_id = ?',
        [tareaId]
      );
      const total = countRows[0]?.total || 0;
      
      const [rows] = await pool.query(`
        SELECT 
          c.*,
          u.nombre as usuario_nombre,
          u.email as usuario_email
        FROM comentarios c 
        LEFT JOIN usuarios u ON c.usuario_id = u.id 
        WHERE c.tarea_id = ? 
        ORDER BY c.fecha_comentario DESC 
        LIMIT ? OFFSET ?
      `, [tareaId, Number(limit), Number(offset)]);
      
      res.json({
        data: rows,
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al obtener comentarios' });
    }
  }
);

// Obtener lista de usuarios para asignación
router.get('/usuarios/lista', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, nombre, email FROM usuarios ORDER BY nombre');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

module.exports = router;