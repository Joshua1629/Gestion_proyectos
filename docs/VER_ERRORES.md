# CÓMO VER LOS ERRORES DEL BACKEND

## Paso 1: Ejecuta la aplicación
```
dist\win-unpacked\Gestion Proyectos.exe
```

## Paso 2: Revisa los logs

Los logs se guardan en:
```
C:\Users\Apt01\AppData\Roaming\GestionProyectos\electron.log
```

Para verlos, ejecuta en PowerShell:
```powershell
Get-Content $env:APPDATA\GestionProyectos\electron.log -Tail 100
```

## Paso 3: Observa la ventana de DevTools

La aplicación abre DevTools automáticamente. Revisa la consola para ver errores del frontend.

## Paso 4: Comparte los logs

Copia y pega TODO el contenido del archivo de log o los mensajes que veas en la consola.

Los mensajes importantes a buscar:
- ❌ ERROR CRÍTICO
- ❌ sqlite3 no disponible
- ✅ sqlite3 encontrado
- ✅ Backend iniciado correctamente
- ⚠️ Backend no respondió

