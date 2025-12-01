const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'cambiame_en_produccion';

function getTokenFromReq(req) {
  const h = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (!h) return null;
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function optionalAuth(req, _res, next) {
  try {
    const token = getTokenFromReq(req);
    if (token) {
      req.user = jwt.verify(token, JWT_SECRET);
    }
  } catch (_) {
    // ignorar token inválido en optional
  }
  next();
}

function requireAuth(req, res, next) {
  try {
    const token = getTokenFromReq(req);
    if (!token) return res.status(401).json({ error: 'No autorizado' });
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

function requireRole(...roles) {
  const roleSet = new Set(roles.map(r => String(r).toLowerCase()));
  return (req, res, next) => {
    try {
      const token = getTokenFromReq(req);
      if (!token) return res.status(401).json({ error: 'No autorizado' });
      const payload = jwt.verify(token, JWT_SECRET);
      const rol = String(payload?.rol || '').toLowerCase();
      if (!roleSet.has(rol)) return res.status(403).json({ error: 'Permisos insuficientes' });
      req.user = payload;
      next();
    } catch (_) {
      return res.status(401).json({ error: 'Token inválido' });
    }
  };
}

module.exports = { optionalAuth, requireAuth, requireRole };
