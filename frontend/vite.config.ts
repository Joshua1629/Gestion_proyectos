import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  define: {
    // Evita errores de DevTools en desarrollo
    __REACT_DEVTOOLS_GLOBAL_HOOK__: '({ isDisabled: true })'
  }
})
