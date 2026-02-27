const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path");
const http = require("http");
const https = require("https");
const { exec } = require("child_process");
const fs = require("fs");

let mainWindow = null;
let backendProcess = null;

// Detect environment once and reuse
const isDev =
  process.env.NODE_ENV === "development" || process.env.ELECTRON_DEV === "true";

// Logs en userData multiplataforma (app.getPath('userData') = ~/Library/Application Support/... en Mac, %APPDATA% en Windows)
const logDir = path.join(app.getPath("userData"), "logs");
const logFile = path.join(logDir, "electron.log");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

let logStream = null;
try {
  logStream = fs.createWriteStream(logFile, { flags: "a" });
  console.log(`✅ Logging configurado en: ${logFile}`);
} catch (err) {
  console.error("⚠️ No se pudo crear archivo de log:", err.message);
}

function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    if (logStream) {
      logStream.write(logMessage);
    } else {
      fs.appendFileSync(logFile, logMessage);
    }
  } catch (err) {
    // Ignorar errores de escritura de log, pero mostrar en consola
    console.error('⚠️ Error escribiendo log:', err.message);
  }
  console.log(message);
}

function resolveServerPath() {
  // En desarrollo, el servidor está en la raíz del proyecto
  const devPath = path.join(__dirname, "..", "server", "app.js");
  
  // En producción, el servidor está en extraResources (fuera del .asar)
  // process.resourcesPath apunta al directorio 'resources/' en producción
  const prodPaths = [
    // En extraResources (la ubicación correcta según package.json)
    process.resourcesPath ? path.join(process.resourcesPath, "server", "app.js") : null,
    // Dentro del .asar (fallback por si acaso)
    path.join(__dirname, "..", "server", "app.js"),
  ].filter(Boolean);
  
  // En desarrollo, usar directamente devPath
  if (isDev) {
    console.log("📂 Modo desarrollo, usando:", devPath);
    return devPath;
  }
  
  // En producción, buscar en las rutas de producción
  console.log("📂 Modo producción, buscando servidor...");
  console.log("📂 process.resourcesPath:", process.resourcesPath);
  
  for (const prodPath of prodPaths) {
    if (prodPath) {
      console.log(`📂 Verificando: ${prodPath}`);
      if (fs.existsSync(prodPath)) {
        console.log("✅ Servidor encontrado en producción:", prodPath);
        return prodPath;
      } else {
        console.log("❌ No encontrado");
      }
    }
  }
  
  // Fallback: usar la primera ruta de producción (aunque no exista, para mostrar error)
  const fallback = prodPaths[0] || devPath;
  console.error("❌ ERROR: Servidor no encontrado en ninguna ruta esperada");
  console.error("❌ Rutas probadas:");
  prodPaths.forEach(p => console.error(`   - ${p}`));
  console.error("❌ Usando fallback (puede fallar):", fallback);
  return fallback;
}

async function startBackend() {
  if (backendProcess) {
    console.log("⚠️ Backend ya está iniciado");
    return;
  }

  // En dev, normalmente ya ejecutamos el backend con nodemon desde npm run dev,
  // así que evitamos duplicarlo salvo que se fuerce con ELECTRON_START_BACKEND=true
  if (isDev && process.env.ELECTRON_START_BACKEND !== "true") {
    console.log("⚠️ Skip starting backend from Electron (dev mode).");
    return;
  }

  // SOLUCIÓN: Ejecutar el backend directamente en el proceso principal
  // Esto evita problemas con NODE_PATH y módulos nativos como sqlite3
  let serverPath = resolveServerPath();
  
  writeLog("🚀 Iniciando backend directamente en el proceso principal...");
  writeLog(`🚀 Ruta del servidor: ${serverPath}`);

  // Verificar que el archivo existe
  if (!fs.existsSync(serverPath)) {
    console.error("❌ ERROR: No se encontró el servidor en:", serverPath);
    console.error("❌ Verifica la configuración de electron-builder");
    return;
  }

  try {
    // Cambiar al directorio del servidor temporalmente
    const originalCwd = process.cwd();
    const serverDir = path.dirname(serverPath);
    process.chdir(serverDir);
    
    // Configurar NODE_PATH para el proceso actual
    const resourcesPath = process.resourcesPath || path.join(__dirname, '..');
    console.log("📂 resourcesPath:", resourcesPath);
    
    const possibleNodePaths = [
      path.join(serverDir, 'node_modules'), // PRIORIDAD 1: node_modules local del servidor
      path.join(resourcesPath, 'app.asar.unpacked', 'node_modules'),
      path.join(resourcesPath, 'app.asar', 'node_modules'),
    ];
    
    console.log("🔍 Verificando rutas de node_modules:");
    const existingPaths = [];
    for (const p of possibleNodePaths) {
      const exists = fs.existsSync(p);
      console.log(`   ${exists ? '✅' : '❌'} ${p}`);
      if (exists) {
        existingPaths.push(p);
      }
    }
    
    // CRÍTICO: Asegurar que el directorio del servidor está en Module._nodeModulePaths
    // Esto es necesario para que Node.js resuelva módulos relativos correctamente
    const Module = require('module');
    const serverNodeModules = path.join(serverDir, 'node_modules');
    const originalNodeModulePaths = Module._nodeModulePaths;
    Module._nodeModulePaths = function(from) {
      const paths = originalNodeModulePaths.call(this, from);
      // Agregar serverDir/node_modules al principio de la lista de paths
      if (!paths.includes(serverNodeModules)) {
        paths.unshift(serverNodeModules);
      }
      // Agregar otros paths si no están ya incluidos
      for (const p of existingPaths) {
        if (!paths.includes(p)) {
          paths.unshift(p);
        }
      }
      return paths;
    };
    
    if (existingPaths.length > 0) {
      const currentNodePath = process.env.NODE_PATH || '';
      process.env.NODE_PATH = existingPaths.join(path.delimiter) + 
        (currentNodePath ? path.delimiter + currentNodePath : '');
      console.log("📦 NODE_PATH configurado:", process.env.NODE_PATH);
    } else {
      console.error("❌ ERROR: No se encontró ningún node_modules!");
    }
    
    // Verificar sqlite3 ANTES de cargar el servidor
    console.log("🔍 Verificando que sqlite3 esté disponible...");
    try {
      const Module = require('module');
      const originalResolve = Module._resolveFilename;
      const resolved = Module._resolveFilename('sqlite3', {
        paths: Module._nodeModulePaths(serverDir).concat(existingPaths),
        parent: module,
      });
      console.log("✅ sqlite3 encontrado en:", resolved);
    } catch (sqliteErr) {
      console.error("❌ ERROR: No se puede encontrar sqlite3");
      console.error("❌ Error:", sqliteErr.message);
      throw new Error(`sqlite3 no disponible: ${sqliteErr.message}`);
    }
    
    // Configurar variables de entorno
    process.env.NODE_ENV = 'production';
    
    // Cargar y ejecutar el módulo del servidor directamente
    writeLog(`📂 Cargando módulo del servidor desde: ${serverPath}`);
    const serverModule = require(serverPath);
    
    if (serverModule && typeof serverModule.initializeApp === 'function') {
      writeLog("✅ Módulo cargado, ejecutando initializeApp...");
      await serverModule.initializeApp();
      writeLog("✅ ✅ ✅ Backend iniciado correctamente en el proceso principal ✅ ✅ ✅");
      
      // Marcar como iniciado
      backendProcess = { pid: process.pid, killed: false };
    } else {
      throw new Error("El módulo del servidor no exporta initializeApp");
    }
    
    // Restaurar el directorio de trabajo original
    process.chdir(originalCwd);
    
  } catch (error) {
    const errorMsg = `❌ ❌ ❌ ERROR CRÍTICO al iniciar backend ❌ ❌ ❌
❌ Tipo: ${error.constructor.name}
❌ Mensaje: ${error.message}
❌ Stack completo:
${error.stack}
❌ ===========================================`;
    writeLog(errorMsg);
    console.error("❌ ❌ ❌ ERROR CRÍTICO al iniciar backend ❌ ❌ ❌");
    console.error("❌ Tipo:", error.constructor.name);
    console.error("❌ Mensaje:", error.message);
    console.error("❌ Stack completo:");
    console.error(error.stack);
    console.error("❌ ===========================================");
    
    // Restaurar directorio de trabajo antes del fallback
    try {
      process.chdir(originalCwd);
    } catch {}
    
    // Fallback: intentar como proceso hijo
    console.error("❌ Intentando como proceso hijo (fallback)...");
    startBackendAsChildProcess(serverPath);
  }
}

function startBackendAsChildProcess(serverPath) {
  // Usar process.execPath para ejecutar con el runtime de Electron
  // Con ELECTRON_RUN_AS_NODE=1, se ejecuta como Node.js pero con acceso al .asar
  const command = `"${process.execPath}" "${serverPath}"`;
  console.log("🔨 Ejecutando comando:", command);
  console.log("📂 Directorio de trabajo:", path.dirname(serverPath));
  console.log("📂 process.resourcesPath:", process.resourcesPath);
  console.log("📂 __dirname:", __dirname);

  // Configurar NODE_PATH para que el proceso hijo pueda encontrar los módulos
  // PRIORIDAD: primero buscar en server/node_modules (extraResources), luego en otras ubicaciones
  let nodePath = [];
  
  if (!isDev && process.resourcesPath) {
    const serverDir = path.dirname(serverPath);
    const serverNodeModules = path.join(serverDir, 'node_modules');
    
    // PRIMERO: node_modules local del servidor (extraResources) - ALTA PRIORIDAD
    if (fs.existsSync(serverNodeModules)) {
      nodePath.push(serverNodeModules);
      console.log("📦 [ALTA PRIORIDAD] Agregando al NODE_PATH:", serverNodeModules);
    }
    
    // Buscar node_modules en otras ubicaciones (incluyendo módulos desempaquetados)
    // IMPORTANTE: app.asar.unpacked tiene prioridad para módulos nativos como sqlite3
    const possiblePaths = [
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules'), // ALTA PRIORIDAD para módulos nativos
      path.join(process.resourcesPath, 'sqlite3'), // También desde extraResources directo
      path.join(process.resourcesPath, 'app.asar', 'node_modules'),
      path.join(__dirname, '..', 'node_modules'),
    ];
    
    for (const nmPath of possiblePaths) {
      if (fs.existsSync(nmPath)) {
        nodePath.push(nmPath);
        console.log("📦 Agregando al NODE_PATH:", nmPath);
      }
    }
  }
  
  // Agregar el NODE_PATH existente si hay (al final, menor prioridad)
  if (process.env.NODE_PATH) {
    nodePath.push(process.env.NODE_PATH);
  }

  const env = {
    ...process.env,
    NODE_ENV: isDev ? 'development' : 'production',
    ELECTRON_RUN_AS_NODE: '1', // Permite acceso al .asar desde proceso hijo
    NODE_PATH: nodePath.length > 0 ? nodePath.join(process.platform === 'win32' ? ';' : ':') : undefined,
  };

  console.log("🌍 NODE_PATH configurado:", env.NODE_PATH || '(ninguno)');

  // IMPORTANTE: En Windows, usar shell: true puede causar problemas con las rutas
  // Usar spawn en lugar de exec para mejor control de errores
  const { spawn } = require('child_process');
  
  console.log("🔨 Ejecutando backend como proceso hijo...");
  console.log("🔨 Comando completo:", command);
  console.log("🔨 Directorio:", path.dirname(serverPath));
  console.log("🔨 NODE_PATH:", env.NODE_PATH || '(ninguno)');
  
  // En Windows, necesitamos ejecutar el comando de forma especial
  backendProcess = spawn(process.execPath, [serverPath], {
    cwd: path.dirname(serverPath),
    env: env,
    stdio: ['ignore', 'pipe', 'pipe'], // stdin: ignore, stdout: pipe, stderr: pipe
    shell: false, // No usar shell para evitar problemas de escape
    windowsHide: false, // Mostrar ventana de consola para ver errores
  });

  // Capturar TODA la salida del proceso hijo para debugging
  let stdoutBuffer = '';
  let stderrBuffer = '';
  let hasOutput = false;
  
  if (backendProcess.stdout) {
    backendProcess.stdout.on("data", (chunk) => {
      hasOutput = true;
      const output = chunk.toString();
      stdoutBuffer += output;
      // Mostrar línea por línea para mejor legibilidad
      output.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed) {
          console.log(`[backend stdout] ${trimmed}`);
        }
      });
    });
  }
  
  if (backendProcess.stderr) {
    backendProcess.stderr.on("data", (chunk) => {
      hasOutput = true;
      const output = chunk.toString();
      stderrBuffer += output;
      // Mostrar línea por línea para mejor legibilidad
      output.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed) {
          console.error(`[backend stderr] ${trimmed}`);
        }
      });
    });
  }
  
  // Si después de 3 segundos no hay output, puede que el proceso haya crasheado silenciosamente
  const outputTimeout = setTimeout(() => {
    if (!hasOutput) {
      console.error("⚠️ WARNING: El backend no ha producido ninguna salida después de 3 segundos");
      console.error("⚠️ Esto puede indicar que el proceso crasheó inmediatamente");
      console.error("⚠️ Verifica que todas las dependencias estén disponibles");
    }
  }, 3000);
  
  backendProcess.on("error", (err) => {
    clearTimeout(outputTimeout);
    console.error("❌ ========== BACKEND PROCESS ERROR ==========");
    console.error("❌ Error:", err);
    console.error("❌ Error message:", err.message);
    console.error("❌ Error code:", err.code);
    console.error("❌ Error stack:", err.stack);
    console.error("❌ ===========================================");
    backendProcess = null;
  });
  
  backendProcess.on("exit", (code, signal) => {
    clearTimeout(outputTimeout);
    console.log(`⚠️ ========== BACKEND EXITED ==========`);
    console.log(`⚠️ Código: ${code}, Signal: ${signal}`);
    if (code !== 0 && code !== null) {
      console.error(`❌ Backend terminó con código de error: ${code}`);
      console.error("❌ Esto indica que el backend crasheó o falló al iniciar");
      console.error("❌ Revisa los logs arriba para ver el error específico");
    }
    if (stdoutBuffer) {
      console.error("📋 Última salida stdout (últimos 2000 caracteres):");
      console.error(stdoutBuffer.slice(-2000));
    }
    if (stderrBuffer) {
      console.error("📋 Última salida stderr (últimos 2000 caracteres):");
      console.error(stderrBuffer.slice(-2000));
    }
    if (!stdoutBuffer && !stderrBuffer) {
      console.error("❌ No hubo salida del backend (ni stdout ni stderr)");
      console.error("❌ Esto sugiere que el proceso falló antes de escribir algo");
    }
    console.error("⚠️ ======================================");
    backendProcess = null;
  });
  
  console.log("✅ Backend proceso iniciado con PID:", backendProcess.pid);
  console.log("⏳ Esperando salida del backend...");
}

function stopBackend() {
  if (!backendProcess) return;
  try {
    // Si es un proceso hijo real, terminarlo
    if (backendProcess.pid && backendProcess.pid !== process.pid && typeof backendProcess.kill === 'function') {
      backendProcess.kill("SIGTERM");
    } else {
      // Si está ejecutándose en el proceso principal, solo marcarlo como detenido
      console.log("⚠️ Backend ejecutándose en proceso principal, no se puede detener sin cerrar la app");
    }
  } catch (e) {
    console.error("Error killing backend:", e);
  }
  backendProcess = null;
}

function createWindow() {
  // Resolver icono (dev vs prod). En Windows preferir .ico para barra de tareas.
  let iconPath = null;
  try {
    const iconCandidates = [];
    const isWin = process.platform === "win32";
    const isMac = process.platform === "darwin";

    // Windows: .ico primero (barra de tareas)
    if (isWin) {
      iconCandidates.push(path.join(__dirname, "..", "frontend", "public", "icon.ico"));
      if (process.resourcesPath) {
        iconCandidates.push(
          path.join(process.resourcesPath, "frontend", "public", "icon.ico"),
          path.join(process.resourcesPath, "app.asar.unpacked", "frontend", "public", "icon.ico")
        );
      }
      try {
        const appPath = app.getAppPath();
        iconCandidates.push(
          path.join(appPath, "resources", "frontend", "public", "icon.ico"),
          path.join(appPath, "..", "resources", "frontend", "public", "icon.ico")
        );
      } catch (_) {}
    }

    // macOS: .icns primero, luego PNG
    if (isMac) {
      iconCandidates.push(
        path.join(__dirname, "..", "frontend", "public", "icon.icns"),
        path.join(__dirname, "..", "frontend", "public", "logoapp.png"),
        path.join(__dirname, "..", "frontend", "public", "icon_256.png")
      );
      if (process.resourcesPath) {
        iconCandidates.push(
          path.join(process.resourcesPath, "frontend", "public", "icon.icns"),
          path.join(process.resourcesPath, "app.asar.unpacked", "frontend", "public", "icon.icns"),
          path.join(process.resourcesPath, "frontend", "public", "logoapp.png"),
          path.join(process.resourcesPath, "app.asar.unpacked", "frontend", "public", "logoapp.png")
        );
      }
    }

    // Desarrollo (común)
    iconCandidates.push(
      path.join(__dirname, "..", "frontend", "public", "logoapp.png"),
      path.join(__dirname, "..", "frontend", "public", "icon_256.png"),
      path.join(__dirname, "..", "frontend", "public", "logo.png")
    );

    // Producción
    if (process.resourcesPath) {
      iconCandidates.push(
        path.join(process.resourcesPath, "frontend", "public", "logoapp.png"),
        path.join(process.resourcesPath, "frontend", "public", "icon_256.png"),
        path.join(process.resourcesPath, "frontend", "public", "logo.png"),
        path.join(process.resourcesPath, "app.asar.unpacked", "frontend", "public", "logoapp.png"),
        path.join(process.resourcesPath, "app.asar.unpacked", "frontend", "public", "icon_256.png"),
        path.join(process.resourcesPath, "app.asar.unpacked", "frontend", "public", "logo.png"),
        path.join(process.resourcesPath, "logoapp.png"),
        path.join(process.resourcesPath, "icon_256.png")
      );
    }
    try {
      const appPath = app.getAppPath();
      iconCandidates.push(
        path.join(appPath, "resources", "frontend", "public", "logoapp.png"),
        path.join(appPath, "resources", "frontend", "public", "logo.png"),
        path.join(appPath, "..", "resources", "frontend", "public", "logoapp.png"),
        path.join(appPath, "..", "resources", "frontend", "public", "logo.png")
      );
    } catch (_) {}

    for (const candidate of iconCandidates) {
      if (candidate && fs.existsSync(candidate)) {
        iconPath = path.resolve(candidate);
        console.log(`✅ Icono de ventana: ${iconPath}`);
        break;
      }
    }

    if (!iconPath) {
      const hint = isWin ? "Ejecuta 'npm run build:icon' y vuelve a hacer 'npm run dist:win'." : isMac ? "Genera icon.icns o usa logoapp.png." : "Añade un icono en frontend/public.";
      console.warn("⚠️ Icono no encontrado. " + hint);
    }
  } catch (e) {
    console.error("❌ Error al resolver icono:", e);
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconPath || undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Windows: forzar icono en ventana y barra de tareas (ruta absoluta + repetir para que Windows lo aplique)
  if (iconPath && process.platform === "win32") {
    mainWindow.setIcon(iconPath);
    mainWindow.once("ready-to-show", () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setIcon(iconPath);
    });
    // Windows a veces actualiza la barra de tareas tarde; forzar de nuevo
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setIcon(iconPath);
    }, 500);
  }
  
  // Abrir DevTools automáticamente para ver errores
 // mainWindow.webContents.openDevTools();
  
  // También mostrar errores en una ventana de consola
  if (!isDev) {
    // En producción, crear una ventana de consola para ver los logs del backend
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    
    // No crear ventana de consola separada, pero asegurar que los logs se vean
    // Los logs se guardan en el archivo electron.log
  }

  // Forzar modo "direct" para evitar proxys del sistema que a veces provocan desconexiones
  mainWindow.webContents.session.setProxy({ mode: "direct" }).catch(() => {});

  // Utilidad para asegurar red online
  function enforceOnline() {
    try {
      try {
        mainWindow.webContents.session.disableNetworkEmulation?.();
        mainWindow.webContents.session.enableNetworkEmulation?.({
          offline: false,
        });
      } catch {}
      if (!mainWindow.webContents.debugger.isAttached()) {
        mainWindow.webContents.debugger.attach("1.3");
      }
      mainWindow.webContents.debugger.sendCommand("Network.enable");
      mainWindow.webContents.debugger.sendCommand(
        "Network.emulateNetworkConditions",
        {
          offline: false,
          latency: 0,
          downloadThroughput: -1,
          uploadThroughput: -1,
        }
      );
      console.log("Forced online network conditions for renderer");
    } catch (e) {
      console.warn(
        "Could not enforce online network conditions:",
        e && e.message ? e.message : e
      );
    }
  }

  enforceOnline();

  if (isDev) {
    // Usar 127.0.0.1 en lugar de localhost: en Windows localhost puede resolverse a IPv6 (::1)
    // y Vite suele escuchar solo en IPv4, lo que provoca timeout. 127.0.0.1 funciona en Windows y macOS.
    const devUrl = "http://127.0.0.1:5173";

    // Esperar a que el servidor de Vite esté listo antes de cargar
    waitForUrl(devUrl, { timeoutMs: 20000, intervalMs: 300 })
      .then(() => {
        return mainWindow.loadURL(devUrl);
      })
      .then(() => {
        // DevTools removido - no abrir automáticamente
           
        // Reforzar online
        setTimeout(() => {
          try {
            mainWindow.webContents.debugger.sendCommand("Network.enable");
          } catch {}
          try {
            mainWindow.webContents.debugger.sendCommand(
              "Network.emulateNetworkConditions",
              {
                offline: false,
                latency: 0,
                downloadThroughput: -1,
                uploadThroughput: -1,
              }
            );
          } catch {}
        }, 300);
      })
      .catch((err) => {
        console.error(
          "No se pudo conectar al servidor de Vite en dev:",
          err && err.message ? err.message : err
        );
        // mostrar una página de error simple para orientar al usuario
        const html = `
          <html>
            <body style="font-family: sans-serif; padding: 24px;">
              <h2>No se puede conectar al frontend (Vite) en ${devUrl}</h2>
              <p>Asegúrate de que el servidor esté en ejecución. Revisa la consola por errores.</p>
            </body>
          </html>`;
        mainWindow.loadURL(
          "data:text/html;charset=utf-8," + encodeURIComponent(html)
        );
      });
  } else {
    // En producción, el frontend/dist puede estar dentro del .asar o en app.asar.unpacked
    const candidates = [
      // Dentro del .asar (ruta relativa desde electron/main.js)
      path.join(__dirname, "..", "frontend", "dist", "index.html"),
      // En app.asar.unpacked (si está configurado así)
      process.resourcesPath 
        ? path.join(process.resourcesPath, "app.asar.unpacked", "frontend", "dist", "index.html")
        : null,
      // Alternativa: dentro del .asar desde la raíz
      path.join(process.resourcesPath || __dirname, "app.asar", "frontend", "dist", "index.html"),
    ].filter(Boolean);

    // En producción, frontend/dist está en app.asar.unpacked (gracias a asarUnpack)
    const indexHtml = process.resourcesPath
      ? path.join(process.resourcesPath, "app.asar.unpacked", "frontend", "dist", "index.html")
      : path.join(__dirname, "..", "frontend", "dist", "index.html");

    console.log("📂 Cargando index.html en producción...");
    console.log("📂 process.resourcesPath:", process.resourcesPath);
    console.log("📂 Ruta calculada:", indexHtml);
    
    // Verificar que existe
    if (!fs.existsSync(indexHtml)) {
      console.error("❌ index.html no encontrado en:", indexHtml);
      const errorHtml = `
        <html>
          <body style="font-family: sans-serif; padding: 24px;">
            <h2>Error: No se encontró index.html</h2>
            <p>Ruta buscada: ${indexHtml}</p>
            <p>Revisa la consola para más detalles.</p>
          </body>
        </html>`;
      mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(errorHtml));
      // DevTools removido - no abrir automáticamente
      return;
    }

    console.log("✅ index.html encontrado, cargando...");
    
    mainWindow
      .loadFile(indexHtml)
      .then(() => {
        console.log("✅ index.html cargado correctamente");
        // DevTools removido - no abrir automáticamente
      })
      .catch((err) => {
        console.error("❌ Error loading prod file", err);
        console.error("❌ Stack:", err.stack);
        const errorHtml = `
          <html>
            <body style="font-family: sans-serif; padding: 24px;">
              <h2>Error al cargar la aplicación</h2>
              <p>Error: ${err && err.message ? err.message : String(err)}</p>
              <p>Ruta intentada: ${indexHtml}</p>
              <p>Revisa la consola para más detalles.</p>
            </body>
          </html>`;
        mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(errorHtml));
        // DevTools removido - no abrir automáticamente
      });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Si la carga falla por desconexión, intentar reforzar estado online y recargar
  mainWindow.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription, validatedURL) => {
      console.warn("did-fail-load", {
        errorCode,
        errorDescription,
        validatedURL,
      });
      try {
        mainWindow.webContents.debugger.sendCommand("Network.enable");
      } catch {}
      try {
        mainWindow.webContents.debugger.sendCommand(
          "Network.emulateNetworkConditions",
          {
            offline: false,
            latency: 0,
            downloadThroughput: -1,
            uploadThroughput: -1,
          }
        );
      } catch {}
      if (validatedURL && /^https?:\/\//.test(validatedURL)) {
        setTimeout(
          () => mainWindow.webContents.loadURL(validatedURL).catch(() => {}),
          500
        );
      }
    }
  );
}


app.whenReady().then(async () => {
  writeLog("🚀 Electron app ready, iniciando...");
  
  // Rutas multiplataforma: el servidor usa ELECTRON_USER_DATA (app.getPath('userData')) para DB y uploads
  process.env.ELECTRON_USER_DATA = app.getPath("userData");
  
  // Remover menú de la aplicación (File, Edit, View, Window, Help)
  Menu.setApplicationMenu(null);
  
  // Iniciar backend primero
  await startBackend();
  
  // En dev, el backend y Vite arrancan con concurrently; darles unos segundos antes de comprobar
  if (isDev) {
    const devDelayMs = 3500;
    console.log(`⏳ Modo desarrollo: esperando ${devDelayMs / 1000}s a que backend y Vite arranquen...`);
    await new Promise((r) => setTimeout(r, devDelayMs));
  }

  // Esperar y verificar que el backend esté respondiendo antes de crear la ventana
  const backendUrl = "http://127.0.0.1:3001/api/auth/health";
  console.log("⏳ Esperando a que el backend esté listo...");

  const httpGetOk = (url) =>
    new Promise((resolve) => {
      const lib = url.startsWith("https") ? https : http;
      const req = lib.get(url, { timeout: 2000 }, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    });

  try {
    const maxAttempts = 24;
    let attempts = 0;
    let backendReady = false;

    while (attempts < maxAttempts && !backendReady) {
      backendReady = await httpGetOk(backendUrl);
      if (backendReady) {
        console.log("✅ Backend respondiendo correctamente");
        break;
      }
      if (attempts % 4 === 0) {
        console.log(`⏳ Esperando backend... (intento ${attempts + 1}/${maxAttempts})`);
      }
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (!backendReady) {
      console.warn("⚠️ Backend no respondió después de 12 segundos");
      console.warn("⚠️ Revisa los logs [backend stdout] y [backend stderr] arriba para ver errores");
      console.warn("⚠️ Continuando de todos modos...");
    }
  } catch (err) {
    console.warn("⚠️ Error verificando backend:", err.message);
    console.warn("⚠️ Continuando de todos modos...");
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Single instance lock
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    stopBackend();
    app.quit();
  }
});

process.on("exit", () => stopBackend());
process.on("SIGINT", () => {
  stopBackend();
  process.exit();
});
process.on("SIGTERM", () => {
  stopBackend();
  process.exit();
});

// Electron 22 usa Node 16, que no tiene fetch global. Helper para peticiones HTTP usando http(s).
function nodeFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const lib = isHttps ? https : http;
    const method = (options.method || "GET").toUpperCase();
    const headers = options.headers || {};
    let body = options.body;
    if (body && typeof body === "object" && !Buffer.isBuffer(body) && !(body instanceof Uint8Array)) {
      body = typeof body === "string" ? body : JSON.stringify(body);
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
    }
    const reqOpts = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers,
    };
    const req = lib.request(reqOpts, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const resHeaders = {};
        for (const [k, v] of Object.entries(res.headers)) resHeaders[k.toLowerCase()] = v;
        const contentType = (resHeaders["content-type"] || "").split(";")[0].trim();
        let parsedBody = buf.toString("utf8");
        if (contentType.includes("application/json")) {
          try {
            parsedBody = JSON.parse(parsedBody);
          } catch (_) {}
        }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 400,
          status: res.statusCode,
          statusText: res.statusMessage || "",
          headers: resHeaders,
          body: parsedBody,
          rawBuffer: buf,
          arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
        });
      });
    });
    req.on("error", reject);
    if (body !== undefined && body !== null) {
      req.write(typeof body === "string" ? body : Buffer.isBuffer(body) ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// Utilidad: esperar a que una URL sea accesible (HTTP 200-399). Usa http(s).get para ser fiable en Electron (Windows/macOS).
function waitForUrl(url, { timeoutMs = 15000, intervalMs = 250 } = {}) {
  const start = Date.now();
  const doCheck = () =>
    new Promise((resolve) => {
      const lib = url.startsWith("https") ? https : http;
      const req = lib.get(url, { timeout: 5000 }, (res) => {
        res.resume(); // consumir el body para cerrar la conexión correctamente
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    });

  return (async () => {
    while (Date.now() - start < timeoutMs) {
      if (await doCheck()) return true;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`Timeout esperando ${url}`);
  })();
}

// IPC: proxy de fetch desde el renderer al proceso principal (Electron 22 = Node 16, sin fetch; usamos http(s))
ipcMain.handle("http:fetch", async (_event, { url, options }) => {
  try {
    console.log(`🌐 IPC fetch: ${options?.method || 'GET'} ${url}`);
    
    const res = await nodeFetch(url, options || {});
    
    console.log(`📡 IPC fetch response: ${res.status} ${res.statusText}`);
    
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
      body: res.body,
    };
  } catch (e) {
    console.error(`❌ IPC fetch error para ${url}:`, e);
    console.error(`❌ Error message:`, e?.message);
    console.error(`❌ Error stack:`, e?.stack);
    
    // Formatear error más descriptivo
    const errorMessage = e?.message || String(e);
    const isNetworkError = errorMessage.includes('fetch failed') || 
                          errorMessage.includes('ECONNREFUSED') ||
                          errorMessage.includes('ENOTFOUND');
    
    return { 
      ok: false, 
      status: isNetworkError ? 503 : 500,
      statusText: isNetworkError ? 'Service Unavailable' : 'Internal Server Error',
      error: isNetworkError 
        ? 'No se pudo conectar con el servidor. Verifica que el backend esté ejecutándose en http://127.0.0.1:3001'
        : errorMessage
    };
  }
});

// IPC: subida multipart via main (Electron 22 = Node 16, sin fetch; usamos form-data + http)
ipcMain.handle("http:uploadMultipart", async (_event, payload) => {
  try {
    const FormDataPkg = (await import("form-data")).default;
    const form = new FormDataPkg();
    const {
      url,
      method = "POST",
      fields = {},
      files = [],
      headers: extraHeaders = {},
    } = payload || {};
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    for (const f of files) {
      const buf = Buffer.from(f.buffer);
      form.append(f.fieldName, buf, {
        filename: f.name,
        contentType: f.type || "application/octet-stream",
      });
    }
    const headers = { ...form.getHeaders(), ...(extraHeaders || {}) };
    try {
      const contentLength = await new Promise((resolve, reject) => {
        form.getLength((err, len) => (err ? reject(err) : resolve(len)));
      });
      if (typeof contentLength === "number" && contentLength >= 0)
        headers["Content-Length"] = String(contentLength);
    } catch (_) {}
    headers["Accept"] = headers["Accept"] || "application/json, */*";

    const res = await new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === "https:";
      const lib = isHttps ? https : http;
      const reqOpts = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method,
        headers,
      };
      const req = lib.request(reqOpts, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const resHeaders = {};
          for (const [k, v] of Object.entries(res.headers)) resHeaders[k.toLowerCase()] = v;
          const contentType = (resHeaders["content-type"] || "").split(";")[0].trim();
          let body = buf.toString("utf8");
          if (contentType.includes("application/json")) {
            try {
              body = JSON.parse(body);
            } catch (_) {}
          }
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 400,
            status: res.statusCode,
            statusText: res.statusMessage || "",
            headers: resHeaders,
            body,
          });
        });
      });
      req.on("error", reject);
      form.pipe(req);
    });
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
      body: res.body,
    };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

// IPC: obtener binario como base64 (para imágenes) desde el proceso principal (Node 16 sin fetch)
ipcMain.handle("http:fetchBinary", async (_event, { url }) => {
  try {
    const res = await nodeFetch(url);
    if (!res.ok)
      return { ok: false, status: res.status, statusText: res.statusText };
    const buf = res.rawBuffer;
    const contentType =
      (res.headers["content-type"] || "").split(";")[0].trim() || "application/octet-stream";
    const base64 = `data:${contentType};base64,${buf.toString("base64")}`;
    return { ok: true, dataUrl: base64 };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});
