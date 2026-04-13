import { defineConfig } from 'vite'
import { execSync } from 'child_process'

function getGitHash() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

// Proxy API calls to local Express server during dev
export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __GIT_HASH__: JSON.stringify(getGitHash()),
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4000'
    }
  }
})
