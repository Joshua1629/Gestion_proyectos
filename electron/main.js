const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

let mainWindow = null;
let backendProcess = null;

// Detect environment once and reuse
const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === 'true';

function resolveServerPath() {
  const devPath = path.join(__dirname, '..', 'server', 'app.js');
  const prodPath = path.join(process.resourcesPath || __dirname, 'server', 'app.js');
  return fs.existsSync(devPath) ? devPath : prodPath;
}

function startBackend() {
  if (backendProcess) return;
  const serverPath = resolveServerPath();

  // Ejecuta el script con el runtime actual (process.execPath)
  // Uso de comillas para rutas con espacios
  // En dev, normalmente ya ejecutamos el backend con nodemon desde npm run dev,
  // así que evitamos duplicarlo salvo que se fuerce con ELECTRON_START_BACKEND=true
  if (isDev && process.env.ELECTRON_START_BACKEND !== 'true') {
    console.log('Skip starting backend from Electron (dev mode).');
    return;
  }

  const command = `"${process.execPath}" "${serverPath}"`;

  // aumentar maxBuffer para evitar errores si hay mucha salida
  backendProcess = exec(command, {
    cwd: path.dirname(serverPath),
    env: process.env,
    maxBuffer: 1024 * 1024 * 50 // 50 MB
  });

  // stdout / stderr (si el child tiene streams)
  if (backendProcess.stdout) {
    backendProcess.stdout.on('data', (chunk) => {
      process.stdout.write(`[backend stdout] ${chunk}`);
    });
  }
  if (backendProcess.stderr) {
    backendProcess.stderr.on('data', (chunk) => {
      process.stderr.write(`[backend stderr] ${chunk}`);
    });
  }

  backendProcess.on('error', (err) => {
    console.error('Backend error:', err);
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`Backend exited code=${code} signal=${signal}`);
    backendProcess = null;
  });

  console.log('Backend started with exec:', command);
}

function stopBackend() {
  if (!backendProcess) return;
  try {
    // intenta terminar de forma amable
    backendProcess.kill('SIGTERM');
    // en Windows / procesos rebeldes puede requerir más, pero dejar así por defecto
  } catch (e) {
    console.error('Error killing backend:', e);
  }
  backendProcess = null;
}

function createWindow() {
  // Resolver icono (dev vs prod)
  let iconPath = null;
  try {
    const devIcon = path.join(__dirname, '..', 'frontend', 'public', 'logoapp.png');
    const prodIcon = path.join(process.resourcesPath || __dirname, 'logoapp.png');
    if (fs.existsSync(devIcon)) {
      iconPath = devIcon;
    } else if (fs.existsSync(prodIcon)) {
      iconPath = prodIcon;
    } else {
      console.warn('Icono logoapp.png no encontrado en dev ni prod, se usará el icono por defecto de la plataforma');
    }
  } catch (e) {
    console.error('Error al resolver icono:', e);
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconPath || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Forzar modo "direct" para evitar proxys del sistema que a veces provocan desconexiones
  mainWindow.webContents.session.setProxy({ mode: 'direct' }).catch(() => {});

  // Utilidad para asegurar red online
  function enforceOnline() {
    try {
      try {
        mainWindow.webContents.session.disableNetworkEmulation?.();
        mainWindow.webContents.session.enableNetworkEmulation?.({ offline: false });
      } catch {}
      if (!mainWindow.webContents.debugger.isAttached()) {
        mainWindow.webContents.debugger.attach('1.3');
      }
      mainWindow.webContents.debugger.sendCommand('Network.enable');
      mainWindow.webContents.debugger.sendCommand('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1
      });
      console.log('Forced online network conditions for renderer');
    } catch (e) {
      console.warn('Could not enforce online network conditions:', e && e.message ? e.message : e);
    }
  }

  enforceOnline();

  if (isDev) {
    const devUrl = 'http://localhost:5173';

    // Esperar a que el servidor de Vite esté listo antes de cargar
    waitForUrl(devUrl, { timeoutMs: 20000, intervalMs: 300 })
      .then(() => {
        return mainWindow.loadURL(devUrl);
      })
      .then(() => {
        mainWindow.webContents.openDevTools();
        // Reforzar online tras abrir DevTools por si activa emulaciones
        setTimeout(() => {
          try { mainWindow.webContents.debugger.sendCommand('Network.enable'); } catch {}
          try { mainWindow.webContents.debugger.sendCommand('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); } catch {}
        }, 300);
      })
      .catch((err) => {
        console.error('No se pudo conectar al servidor de Vite en dev:', err && err.message ? err.message : err);
        // mostrar una página de error simple para orientar al usuario
        const html = `
          <html>
            <body style="font-family: sans-serif; padding: 24px;">
              <h2>No se puede conectar al frontend (Vite) en ${devUrl}</h2>
              <p>Asegúrate de que el servidor esté en ejecución. Revisa la consola por errores.</p>
            </body>
          </html>`;
        mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      });
  } else {
    const indexHtml = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
    mainWindow.loadFile(indexHtml).catch(err => console.error('Error loading prod file', err));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Si la carga falla por desconexión, intentar reforzar estado online y recargar
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.warn('did-fail-load', { errorCode, errorDescription, validatedURL });
    try { mainWindow.webContents.debugger.sendCommand('Network.enable'); } catch {}
    try { mainWindow.webContents.debugger.sendCommand('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); } catch {}
    if (validatedURL && /^https?:\/\//.test(validatedURL)) {
      setTimeout(() => mainWindow.webContents.loadURL(validatedURL).catch(() => {}), 500);
    }
  });
}

app.whenReady().then(() => {
  startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Single instance lock
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopBackend();
    app.quit();
  }
});

process.on('exit', () => stopBackend());
process.on('SIGINT', () => {
  stopBackend();
  process.exit();
});
process.on('SIGTERM', () => {
  stopBackend();
  process.exit();
});

// Utilidad: esperar a que una URL sea accesible (HTTP 200-399)
async function waitForUrl(url, { timeoutMs = 15000, intervalMs = 250 } = {}) {
  const start = Date.now();
  // Node 18+ tiene fetch global; fallback simple usando http/https si no está
  const doFetch = async () => {
    if (typeof fetch === 'function') {
      try {
        const res = await fetch(url, { method: 'GET' });
        return res.ok;
      } catch {
        return false;
      }
    }
    return false;
  };

  while (Date.now() - start < timeoutMs) {
    const ok = await doFetch();
    if (ok) return true;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout esperando ${url}`);
}

// IPC: proxy de fetch desde el renderer al proceso principal (usa Node fetch)
ipcMain.handle('http:fetch', async (_event, { url, options }) => {
  try {
    const res = await fetch(url, options || {});
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const body = isJson ? await res.json().catch(() => null) : await res.text();
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      body
    };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

// IPC: subida multipart via main (evita problemas de red del renderer)
ipcMain.handle('http:uploadMultipart', async (_event, payload) => {
  try {
    // Usar FormData global de Node 18 (undici); si no existe, fallback a paquete form-data
    let FormDataCtor = globalThis.FormData;
    let usingUndici = true;
    if (typeof FormDataCtor === 'undefined') {
      FormDataCtor = (await import('form-data')).default;
      usingUndici = false;
    }
    const form = new (FormDataCtor)();
    const { url, method = 'POST', fields = {}, files = [] } = payload || {};
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    for (const f of files) {
      const buf = Buffer.from(f.buffer);
      if (usingUndici) {
        const blob = new Blob([buf], { type: f.type || 'application/octet-stream' });
        // En undici, tercer parámetro filename se pasa como opción separada
        form.append(f.fieldName, blob, f.name);
      } else {
        form.append(f.fieldName, buf, { filename: f.name, contentType: f.type });
      }
    }
    const reqInit = usingUndici ? { method, body: form } : { method, body: form, headers: form.getHeaders() };
    const res = await fetch(url, reqInit);
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const body = isJson ? await res.json().catch(() => null) : await res.text();
    return { ok: res.ok, status: res.status, statusText: res.statusText, headers: Object.fromEntries(res.headers.entries()), body };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

// IPC: obtener binario como base64 (para imágenes) desde el proceso principal
ipcMain.handle('http:fetchBinary', async (_event, { url }) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, status: res.status, statusText: res.statusText };
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const base64 = `data:${contentType};base64,${buf.toString('base64')}`;
    return { ok: true, dataUrl: base64 };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});