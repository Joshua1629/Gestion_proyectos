import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Rutas relativas para Electron file:// protocol
  server: {
    port: 5173,
  },
  define: {
    // Evita errores de DevTools en build: definir como undefined
    __REACT_DEVTOOLS_GLOBAL_HOOK__: 'undefined'
  }
})
