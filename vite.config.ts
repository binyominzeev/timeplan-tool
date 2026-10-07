import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import devPorts from './dev-ports.json'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const apiBaseUrl = mode === 'production'
    ? env.VITE_API_BASE_URL ?? ''
    : `http://localhost:${devPorts.api}`

  return {
    base: '/timeplan/',
    plugins: [react(), tailwindcss()],
    server: {
      port: devPorts.frontend,
      strictPort: true,
      allowedHosts: ['timeplan.binjomin.hu'],
    },
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiBaseUrl),
    },
  }
})
