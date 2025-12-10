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
      // Usar subconsultas para evitar problemas con GROUP BY en SQLite
      const [rows] = await pool.query(`
        SELECT 
          p.*,
          COALESCE(p.fecha_inicio, (SELECT MIN(fecha_inicio) FROM fases WHERE proyecto_id = p.id)) as fecha_inicio,
          COALESCE(p.fecha_fin, (SELECT MAX(fecha_fin) FROM fases WHERE proyecto_id = p.id)) as fecha_fin,
          COALESCE((SELECT AVG(progreso) FROM tareas WHERE proyecto_id = p.id), 0) as progreso_general,
          (SELECT COUNT(*) FROM tareas WHERE proyecto_id = p.id) as total_tareas,
          (SELECT COUNT(*) FROM tareas WHERE proyecto_id = p.id AND progreso = 100) as tareas_completadas,
          (SELECT COUNT(*) FROM fases WHERE proyecto_id = p.id) as total_fases,
          (SELECT COUNT(*) FROM fases WHERE proyecto_id = p.id AND estado = 'Completado') as fases_completadas
        FROM proyectos p 
        WHERE p.nombre LIKE ? OR p.cliente LIKE ? 
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
      console.error('❌ Error en GET /api/proyectos:', err);
      console.error('❌ Error message:', err?.message);
      console.error('❌ Error stack:', err?.stack);
      res.status(500).json({ 
        error: 'Error al obtener proyectos',
        detail: err?.message || String(err)
      });
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

      // Agregar agregados/indicadores para que el frontend muestre valores reales
      try {
        const totalTareas = Array.isArray(tareasRows) ? tareasRows.length : 0;
        const tareasCompletadas = Array.isArray(tareasRows)
          ? tareasRows.filter(t => Number(t.progreso) === 100).length
          : 0;
        const totalFases = Array.isArray(fasesRows) ? fasesRows.length : 0;
        const fasesCompletadas = Array.isArray(fasesRows)
          ? fasesRows.filter(f => f.estado === 'Completado').length
          : 0;

        // Promedio de progreso de tareas como porcentaje 0-100
        const progresoPromedio = Array.isArray(tareasRows) && tareasRows.length > 0
          ? Math.round(
              tareasRows.reduce((acc, t) => acc + (Number(t.progreso) || 0), 0) /
              tareasRows.length
            )
          : 0;

        proyecto.total_tareas = totalTareas;
        proyecto.tareas_completadas = tareasCompletadas;
        proyecto.total_fases = totalFases;
        proyecto.fases_completadas = fasesCompletadas;
        proyecto.progreso_general = progresoPromedio;
      } catch (aggErr) {
        // No bloquear la respuesta si algo falla en cálculo de agregados
        console.warn('Error calculando agregados del proyecto:', aggErr && aggErr.message ? aggErr.message : aggErr);
        proyecto.total_tareas = proyecto.total_tareas || 0;
        proyecto.tareas_completadas = proyecto.tareas_completadas || 0;
        proyecto.total_fases = proyecto.total_fases || 0;
        proyecto.fases_completadas = proyecto.fases_completadas || 0;
        proyecto.progreso_general = proyecto.progreso_general || 0;
      }

      // Si el proyecto no tiene fechas, intentar derivarlas desde las fases (mínima inicio, máxima fin)
      try {
        if ((!proyecto.fecha_inicio || proyecto.fecha_inicio === '') && Array.isArray(fasesRows) && fasesRows.length > 0) {
          const inicio = fasesRows.reduce((acc, f) => {
            if (!f || !f.fecha_inicio) return acc;
            if (!acc) return f.fecha_inicio;
            return new Date(f.fecha_inicio) < new Date(acc) ? f.fecha_inicio : acc;
          }, null);
          if (inicio) proyecto.fecha_inicio = inicio;
        }

        if ((!proyecto.fecha_fin || proyecto.fecha_fin === '') && Array.isArray(fasesRows) && fasesRows.length > 0) {
          const fin = fasesRows.reduce((acc, f) => {
            if (!f || !f.fecha_fin) return acc;
            if (!acc) return f.fecha_fin;
            return new Date(f.fecha_fin) > new Date(acc) ? f.fecha_fin : acc;
          }, null);
          if (fin) proyecto.fecha_fin = fin;
        }
      } catch (err) {
        // Si algo falla al parsear fechas no obstructamos la respuesta
        console.warn('Error deriving project dates from fases:', err && err.message ? err.message : err);
      }
      
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
    body('cedula_juridica').isString().trim().isLength({ min: 9, max: 20 }),
    body('fecha_verificacion').optional().isISO8601().toDate(),
    body('fecha_inicio').optional().isISO8601().toDate(),
    body('fecha_fin').optional().isISO8601().toDate()
  ],
  checkValidation,
  async (req, res) => {
    const { nombre, cliente, cedula_juridica, fecha_verificacion, fecha_inicio, fecha_fin } = req.body;
    try {
      // Generar código secuencial por año: PROY-YYYY-####
      const year = new Date().getFullYear();
      const prefix = `PROY-${year}-`;
      let nextNumber = 1;
      try {
        const [rowsMax] = await pool.query(
          'SELECT codigo FROM proyectos WHERE codigo LIKE ? ORDER BY codigo DESC LIMIT 1',
          [`${prefix}%`]
        );
        if (Array.isArray(rowsMax) && rowsMax.length > 0 && rowsMax[0]?.codigo) {
          const match = String(rowsMax[0].codigo).match(/PROY-\d{4}-(\d{4})$/);
          if (match) {
            nextNumber = parseInt(match[1], 10) + 1;
          }
        }
      } catch (e) {
        // Si algo falla, dejamos nextNumber en 1
        console.warn('No se pudo calcular el consecutivo de codigo, usando 0001:', e?.message || e);
      }
      const codigo = `${prefix}${String(nextNumber).padStart(4, '0')}`;
      // Crear proyecto
      const [result] = await pool.query(
        'INSERT INTO proyectos (codigo, nombre, cliente, cedula_juridica, fecha_verificacion, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [codigo, nombre, cliente, cedula_juridica, fecha_verificacion || null, fecha_inicio || null, fecha_fin || null]
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
    body('cedula_juridica').optional().isString().trim().isLength({ min: 9, max: 20 }),
    body('fecha_verificacion').optional().isISO8601().toDate(),
    body('fecha_inicio').optional().isISO8601().toDate(),
    body('fecha_fin').optional().isISO8601().toDate()
  ],
  checkValidation,
  async (req, res) => {
    const { id } = req.params;
    const { nombre, cliente, cedula_juridica, fecha_verificacion, fecha_inicio, fecha_fin } = req.body;
    try {
      const [result] = await pool.query(
        'UPDATE proyectos SET nombre = COALESCE(?, nombre), cliente = COALESCE(?, cliente), cedula_juridica = COALESCE(?, cedula_juridica), fecha_verificacion = COALESCE(?, fecha_verificacion), fecha_inicio = COALESCE(?, fecha_inicio), fecha_fin = COALESCE(?, fecha_fin) WHERE id = ?',
        [nombre, cliente, cedula_juridica || null, fecha_verificacion || null, fecha_inicio || null, fecha_fin || null, id]
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