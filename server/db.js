// Wrapper para exponer el pool definido en models/db.js
try {
  module.exports = require('./models/db');
} catch (err) {
  console.error('Error cargando ./models/db:', err && err.stack ? err.stack : err);
  throw err;
}