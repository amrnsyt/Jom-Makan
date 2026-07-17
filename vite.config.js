import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

let buildId = String(Date.now());
try {
  buildId = readFileSync('./.build-id', 'utf-8').trim();
} catch {
  /* falls back to config-load timestamp, e.g. during plain `vite dev` */
}

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  server: {
    host: true,
  },
})
