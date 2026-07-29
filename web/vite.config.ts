import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
  // Do not inherit an unrelated PostCSS config from a parent workspace.
  css: { postcss: { plugins: [] } },
})
