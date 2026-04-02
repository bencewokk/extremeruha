import { defineConfig } from 'vite'

// Proxy API calls to local Express server during dev
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4000'
    }
  }
})
