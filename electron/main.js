const { app, BrowserWindow } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

let mainWindow = null;
let backendProcess = null;

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
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === 'true';
  if (isDev) {
    const devUrl = 'http://localhost:5173';
    mainWindow.loadURL(devUrl).catch(err => console.error('Error loading dev URL', err));
    mainWindow.webContents.openDevTools();
  } else {
    const indexHtml = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
    mainWindow.loadFile(indexHtml).catch(err => console.error('Error loading prod file', err));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
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