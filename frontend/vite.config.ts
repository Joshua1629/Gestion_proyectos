import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Rutas relativas para Electron file:// protocol
  server: {
    port: 5173,
    // Escuchar en IPv4 para que Electron (main process) pueda conectar desde 127.0.0.1 en Windows/macOS
    host: '127.0.0.1',
  },
  define: {
    // Evita errores de DevTools en build: definir como undefined
    __REACT_DEVTOOLS_GLOBAL_HOOK__: 'undefined'
  }
})
