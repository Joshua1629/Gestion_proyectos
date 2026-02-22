const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const fs = require("fs");

let mainWindow = null;
let backendProcess = null;

// Detect environment once and reuse
const isDev =
  process.env.NODE_ENV === "development" || process.env.ELECTRON_DEV === "true";

// Crear archivo de log para debugging (definir ANTES de usarlo)
const logDir = path.join(process.env.APPDATA || process.env.HOME || __dirname, 'GestionProyectos', 'logs');
const logFile = path.join(logDir, 'electron.log');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

let logStream = null;
try {
  logStream = fs.createWriteStream(logFile, { flags: 'a' });
  console.log(`✅ Logging configurado en: ${logFile}`);
} catch (err) {
  console.error('⚠️ No se pudo crear archivo de log:', err.message);
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

    // En Windows, poner .ico primero (recomendado para barra de tareas)
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

    // Desarrollo
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
      console.warn("⚠️ Icono no encontrado. Ejecuta 'npm run build:icon' y vuelve a hacer 'npm run dist'.");
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
    const devUrl = "http://localhost:5173";

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
  
  // Remover menú de la aplicación (File, Edit, View, Window, Help)
  Menu.setApplicationMenu(null);
  
  // Iniciar backend primero
  await startBackend();
  
  // Esperar y verificar que el backend esté respondiendo antes de crear la ventana
  const backendUrl = "http://127.0.0.1:3001/api/auth/health";
  console.log("⏳ Esperando a que el backend esté listo...");
  
  try {
    // Esperar hasta 10 segundos con intentos cada 500ms
    const maxAttempts = 20;
    let attempts = 0;
    let backendReady = false;
    
    while (attempts < maxAttempts && !backendReady) {
      try {
        const healthCheck = await fetch(backendUrl, { 
          method: 'GET',
          signal: AbortSignal.timeout(1000) // timeout de 1 segundo por intento
        });
        if (healthCheck.ok) {
          console.log("✅ Backend respondiendo correctamente");
          backendReady = true;
          break;
        }
      } catch (fetchErr) {
        // Ignorar errores de conexión y continuar intentando
        if (attempts % 4 === 0) {
          console.log(`⏳ Esperando backend... (intento ${attempts + 1}/${maxAttempts})`);
        }
      }
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (!backendReady) {
      console.warn("⚠️ Backend no respondió después de 10 segundos");
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

// Utilidad: esperar a que una URL sea accesible (HTTP 200-399)
async function waitForUrl(url, { timeoutMs = 15000, intervalMs = 250 } = {}) {
  const start = Date.now();
  // Node 18+ tiene fetch global; fallback simple usando http/https si no está
  const doFetch = async () => {
    if (typeof fetch === "function") {
      try {
        const res = await fetch(url, { method: "GET" });
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
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout esperando ${url}`);
}

// IPC: proxy de fetch desde el renderer al proceso principal (usa Node fetch)
ipcMain.handle("http:fetch", async (_event, { url, options }) => {
  try {
    console.log(`🌐 IPC fetch: ${options?.method || 'GET'} ${url}`);
    
    const res = await fetch(url, options || {});
    
    console.log(`📡 IPC fetch response: ${res.status} ${res.statusText}`);
    
    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    
    let body;
    try {
      body = isJson ? await res.json() : await res.text();
    } catch (parseErr) {
      console.error("❌ Error parseando respuesta:", parseErr);
      body = await res.text().catch(() => null);
    }
    
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      body,
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

// IPC: subida multipart via main (evita problemas de red del renderer)
ipcMain.handle("http:uploadMultipart", async (_event, payload) => {
  try {
    // Preferir 'form-data' en Node < 20 para evitar el ExperimentalWarning de buffer.File
    // Usar undici (FormData/Blob nativos) solo en Node >= 20
    // Prefer undici's native FormData/Blob when available (works best with fetch multipart)
    // Even on Node 18 this is available; it may emit an ExperimentalWarning for File, which is harmless.
    let usingUndici = typeof globalThis.FormData !== "undefined";

    let form;
    if (usingUndici) {
      form = new globalThis.FormData();
    } else {
      const FormDataPkg = (await import("form-data")).default;
      form = new FormDataPkg();
    }
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
      if (usingUndici) {
        const blob = new Blob([buf], {
          type: f.type || "application/octet-stream",
        });
        // En undici, tercer parámetro filename se pasa como opción separada
        form.append(f.fieldName, blob, f.name);
      } else {
        form.append(f.fieldName, buf, {
          filename: f.name,
          contentType: f.type,
        });
      }
    }
    let reqInit;
    if (usingUndici) {
      reqInit = { method, body: form, headers: { ...(extraHeaders || {}) } };
    } else {
      // Legacy form-data needs headers and Node fetch requires duplex when piping a stream body
      const headers = { ...form.getHeaders(), ...(extraHeaders || {}) };
      // Try to compute content-length to avoid chunking issues with some servers
      try {
        const contentLength = await new Promise((resolve, reject) => {
          form.getLength((err, len) => (err ? reject(err) : resolve(len)));
        });
        if (typeof contentLength === "number" && contentLength >= 0)
          headers["Content-Length"] = String(contentLength);
      } catch {}
      headers["Accept"] = headers["Accept"] || "application/json, */*";
      reqInit = { method, body: form, headers, duplex: "half" };
    }
    const res = await fetch(url, reqInit);
    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const body = isJson ? await res.json().catch(() => null) : await res.text();
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      body,
    };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

// IPC: obtener binario como base64 (para imágenes) desde el proceso principal
ipcMain.handle("http:fetchBinary", async (_event, { url }) => {
  try {
    const res = await fetch(url);
    if (!res.ok)
      return { ok: false, status: res.status, statusText: res.statusText };
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType =
      res.headers.get("content-type") || "application/octet-stream";
    const base64 = `data:${contentType};base64,${buf.toString("base64")}`;
    return { ok: true, dataUrl: base64 };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});
