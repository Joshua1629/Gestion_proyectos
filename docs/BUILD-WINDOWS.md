# Construir instalador en Windows (dist:win)

## Versión de Node

Usa **Node.js 20 LTS** (recomendado: **20.18.0**).

- Con nvm: `nvm install 20.18.0` y `nvm use 20.18.0` (o `nvm use` si existe `.nvmrc`).
- O descarga desde https://nodejs.org/ (versión 20.x LTS).

## Requisito: Python y `distutils` (para compilar sqlite3)

La compilación de **sqlite3** usa **node-gyp**, que a su vez usa **Python**. Si tienes **Python 3.12 o superior**, el módulo `distutils` ya no viene por defecto y verás:

```text
ModuleNotFoundError: No module named 'distutils'
```

**Solución (elige una):**

1. **Instalar setuptools** (proporciona `distutils` en Python 3.12+):
   ```bash
   pip install setuptools
   ```
   O con la ruta completa de Python: `C:\Python314\python.exe -m pip install setuptools`

2. **O usar Python 3.11** como intérprete para node-gyp (3.11 aún incluye `distutils`):
   ```bash
   npm config set python "C:\ruta\a\python3.11.exe"
   ```
   (Ajusta la ruta a tu instalación de Python 3.11.)

Después de corregir Python, ejecuta de nuevo:
```bash
npm run rebuild:native
```
o vuelve a hacer `npm install`.

## Error `openssl_fips is not defined` (binding.gyp / common.gypi)

Si al compilar **sqlite3** aparece:

```text
gyp: name 'openssl_fips' is not defined while evaluating condition 'openssl_fips != ""' in binding.gyp
```

el proyecto aplica dos parches en `postinstall`:
1. **patch-sqlite3-gyp.js**: define la variable en `node_modules/sqlite3/binding.gyp`.
2. Si el rebuild falla, **patch-electron-gypi.js**: añade `'openssl_fips': ''` (sin `%`) en `~/.electron-gyp/<versión>/include/node/common.gypi` para que la condición se evalúe correctamente, y se vuelve a intentar el rebuild.

Si aun así falla, ejecuta a mano (después de que `npm install` haya descargado los headers de Electron):

```bash
node scripts/patch-sqlite3-gyp.js
node scripts/patch-electron-gypi.js
npm run rebuild:native
```

**Si `npm run rebuild:native` solo muestra "No prebuilt binaries found" y no ves si compiló o falló:** suele ser que en este equipo aún no se ha aplicado el parche al `common.gypi` de Electron. Haz esto en orden:

1. Aplicar el parche (solo hace falta una vez por equipo):
   ```bash
   node scripts/patch-electron-gypi.js
   ```
2. Volver a ejecutar el rebuild:
   ```bash
   npm run rebuild:native
   ```

Si quieres ver el error completo de compilación (gyp/MSBuild), ejecuta `npm run rebuild:sqlite3:verbose`. Ese comando compila sqlite3 para Node (no para Electron) pero muestra toda la salida; sirve para comprobar si el fallo era `openssl_fips` u otro. Para la app con Electron sigue siendo necesario que `npm run rebuild:native` termine bien.

## Requisito: Windows SDK

Los módulos nativos (`sqlite3`, `sharp`) se compilan para la versión de Electron. Para que la compilación funcione en Windows hace falta:

1. **Visual Studio Build Tools** (o Visual Studio) con:
   - Carga de trabajo **"Desktop development with C++"**
   - **Windows 10 SDK** o **Windows 11 SDK** (en el instalador de VS, pestaña "Individual components", marcar el SDK).

Si al hacer `npm run dist:win` ves:

```text
gyp ERR! find VS - missing any Windows SDK
```

abre **Visual Studio Installer** → Modificar tu instalación → pestaña **"Componentes individuales"** → busca **"Windows 10 SDK"** o **"Windows 11 SDK"** → márcalo e instala.

## Ejecutar la app en desarrollo

En desarrollo, Electron **no** arranca el backend solo; hay que levantar servidor, frontend y Electron juntos:

```bash
npm run dev
```

Eso inicia en paralelo el servidor Express, el frontend (Vite) y la ventana de Electron. La primera vez puede tardar unos segundos en abrir la ventana: Electron espera ~3,5 s a que backend y Vite estén listos y luego comprueba el health check. Si solo ejecutas `npm run start:electron`, verás "Backend no respondió" porque el servidor no está corriendo.

## Pasos para generar el instalador

1. Usar Node 20: `nvm use` o `nvm use 20.18.0`.
2. Instalar dependencias (y recompilar módulos nativos para Electron):
   ```bash
   npm install
   ```
   Si falla la compilación, revisa que el Windows SDK esté instalado (arriba).
3. Generar instalador:
   ```bash
   npm run dist:win
   ```

El instalador quedará en la carpeta `dist/`.

## Versiones fijadas en el proyecto

- **Node:** 20.x (engines en `package.json`).
- **Electron:** 22.3.27 (compatible con Node 20 y compilación de módulos nativos).
- **sqlite3:** 5.1.7 (solo este driver; no se usa better-sqlite3). En `package.json` hay un **override** de `node-addon-api` a 4.3.0 para sqlite3, para que compile con Electron 22 (Node 16) sin errores de N-API.

Si cambias de versión de Node (por ejemplo de 24 a 20), borra `node_modules` y ejecuta de nuevo `npm install`.
