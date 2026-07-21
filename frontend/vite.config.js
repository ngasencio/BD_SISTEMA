import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/gestion-sso/',
  server: {
    host: '10.8.153.227'
  }
})
