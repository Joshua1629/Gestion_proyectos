# Construir e instalar la app en macOS

## Tres situaciones

1. **Quieres generar el .dmg desde tu PC Windows:** usa **GitHub Actions** (un Mac en la nube hace el build; tú descargas el .dmg). Ver más abajo.
2. **Tienes una Mac con herramientas** (Node, Xcode, etc.): ahí generas el instalador con `npm run dist:mac`.
3. **Tienes una Mac sin nada** (usuario final): solo instalas la app a partir del `.dmg` o del `.app` que te pasen.

---

## Generar el .dmg desde Windows (GitHub Actions)

El proyecto incluye un workflow que ejecuta el build en un **Mac de GitHub**. Así puedes obtener el `.dmg` sin tener una Mac.

1. **Sube el proyecto a GitHub** (si aún no está): crea un repositorio y haz push del código (incluida la carpeta `.github/workflows`).
2. En GitHub, ve a la pestaña **Actions**.
3. Elige el workflow **"Build Mac"** en la columna izquierda.
4. Pulsa **"Run workflow"**; en el desplegable **"Arquitectura Mac"** elige:
   - **arm64** → Mac con chip Apple (M1, M2, M3).
   - **x64** → Mac con procesador Intel.
5. Confirma con el botón verde **"Run workflow"**.
6. Cuando termine, entra en la ejecución, baja a **Artifacts** y descarga **GestionProyectos-mac-arm64** o **GestionProyectos-mac-x64** según lo que hayas elegido. Dentro viene el `.dmg` (y/o `.zip`) listo para instalar.

No necesitas configurar secretos; el workflow usa el token por defecto de GitHub.

---

## Parte 1: Generar el instalador (en una Mac con Node)

Necesitas **una Mac** (la misma u otra) con:

- **Node.js 20** (LTS): [nodejs.org](https://nodejs.org) o `nvm install 20`
- **Xcode Command Line Tools** (para compilar sqlite3): en Terminal ejecuta  
  `xcode-select --install`  
  y acepta la instalación.

Pasos en esa Mac:

1. Clonar o copiar el proyecto y abrir la carpeta en Terminal.
2. Instalar dependencias y compilar nativos:
   ```bash
   npm install
   ```
   Si falla el rebuild de sqlite3, ejecuta:
   ```bash
   node scripts/patch-electron-gypi.js
   npm run rebuild:native
   ```
3. Generar el instalador para Mac:
   ```bash
   npm run dist:mac
   ```
4. En la carpeta `dist/` tendrás:
   - **Gestion Proyectos-x.x.x.dmg** (instalador para repartir)
   - y/o **Gestion Proyectos-x.x.x-mac.zip** (versión empaquetada).

Ese `.dmg` (o el `.app` dentro del `.zip`) es lo que llevas a la Mac “limpia”.

---

## Parte 2: Instalar la app en una Mac sin herramientas de programación

La Mac no necesita Node, Xcode ni nada de desarrollo. Solo hace falta recibir el archivo de la app.

### Opción A: Instalador .dmg (recomendado)

1. **Llevar el archivo a la Mac**  
   Copia `Gestion Proyectos-x.x.x.dmg` por USB, enlace de descarga, AirDrop, etc.

2. **Abrir el .dmg**  
   Doble clic en el archivo `.dmg`. Se abrirá una ventana con el icono de la app.

3. **Instalar la aplicación**  
   Arrastra el icono de **“Gestion Proyectos”** a la carpeta **Aplicaciones** (Applications).

4. **Cerrar el instalador**  
   Cierra la ventana del .dmg y, si quieres, expulsa el “disco” del escritorio (clic derecho → Expulsar).

5. **Abrir la app**  
   Ve a **Aplicaciones** y abre **Gestion Proyectos**.

6. **Primera vez: permitir la app**  
   Si macOS dice que la app no es de un desarrollador identificado:
   - Abre **Ajustes del Sistema** (System Settings) → **Privacidad y seguridad** (Privacy & Security).
   - Donde diga que “Gestion Proyectos” fue bloqueada, pulsa **Abrir de todas formas** (o **Open Anyway**).

### Opción B: Tienes solo la carpeta .app (o el .zip)

1. Si te pasan un **.zip**, descomprímelo (doble clic).
2. Mueve la carpeta **Gestion Proyectos.app** a **Aplicaciones** (arrastrar o cortar y pegar).
3. Abre la app desde Aplicaciones y, si macOS la bloquea, usa **Ajustes del Sistema → Privacidad y seguridad → Abrir de todas formas** como arriba.

---

## Resumen rápido para “Mac sin nada”

| Paso | Acción |
|------|--------|
| 1 | Recibir el archivo **Gestion Proyectos-x.x.x.dmg** (o el .app/.zip). |
| 2 | Abrir el .dmg (doble clic). |
| 3 | Arrastrar la app a la carpeta **Aplicaciones**. |
| 4 | Abrir **Gestion Proyectos** desde Aplicaciones. |
| 5 | Si macOS la bloquea, en Ajustes → Privacidad y seguridad → **Abrir de todas formas**. |

No hace falta instalar Node, Xcode ni ninguna herramienta de programación en esa Mac.
