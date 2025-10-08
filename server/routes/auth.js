const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cambiame_en_produccion';

const checkValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// POST /api/auth/login
router.post(
  '/login',
  [
    body('identifier').optional().isString().trim(),
    body('email').optional().isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 4 })
  ],
  checkValidation,
  async (req, res) => {
    try {
      console.log('Login attempt - Body:', req.body);
      // Permitimos login por 'identifier' (usuario), 'email' o 'usuario'
      const identifier = (req.body.identifier || req.body.usuario || req.body.email || '').trim();
      const password = req.body.password;
      console.log('Parsed identifier:', identifier, 'password length:', password?.length);
      
      if (!identifier) return res.status(400).json({ error: 'identifier o email requerido' });

      const [rows] = await pool.query(
        'SELECT id, nombre, usuario, email, password, rol FROM usuarios WHERE email = ? OR nombre = ? OR usuario = ? LIMIT 1',
        [identifier, identifier, identifier]
      );

      console.log('Query result rows:', rows);
      
      // rows es el array de resultados directamente desde SQLite
      if (!rows || rows.length === 0) {
        console.log('No user found for identifier:', identifier);
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      const user = rows[0];
      console.log('User found:', { id: user.id, email: user.email, nombre: user.nombre });
      
      const match = await bcrypt.compare(password, user.password);
      console.log('Password match:', match);
      
      if (!match) return res.status(401).json({ error: 'Credenciales inválidas' });

      const payload = { id: user.id, usuario: user.usuario, email: user.email, rol: user.rol, nombre: user.nombre };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

      res.json({ token, user: { id: user.id, nombre: user.nombre, usuario: user.usuario, email: user.email, rol: user.rol } });
    } catch (err) {
      console.error('auth/login error:', err && err.stack ? err.stack : err);
      res.status(500).json({ error: 'Error del servidor' });
    }
  }
);

module.exports = router;