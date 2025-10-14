const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', '..', 'data', 'gestion_proyectos.db');
const db = new sqlite3.Database(dbPath);

function all(sql, params=[]) { return new Promise((resolve,reject)=> db.all(sql, params, (e,r)=> e?reject(e):resolve(r))); }
(async () => {
  try {
    const tables = await all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    console.log('Tables:', tables.map(t=>t.name));
    const info = await all('PRAGMA table_info(evidencias)');
    console.log('evidencias columns:', info);
    const idx = await all("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='evidencias'");
    console.log('evidencias indexes:', idx);
  } catch (e) {
    console.error('Error:', e);
  } finally { db.close(); }
})();
