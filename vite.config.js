import { defineConfig } from 'vite'
import { execSync } from 'child_process'
import { resolve } from 'path'

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
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        kollekcio: resolve(__dirname, 'kollekcio.html'),
        ruhaproba: resolve(__dirname, 'ruhaproba.html'),
        kapcsolat: resolve(__dirname, 'kapcsolat.html'),
        foglalas: resolve(__dirname, 'foglalas.html'),
        kolcsonzes: resolve(__dirname, 'kolcsonzes.html'),
        ertekesites: resolve(__dirname, 'ertekesites.html'),
        igazitas: resolve(__dirname, 'igazitas.html'),
        kiegeszitok: resolve(__dirname, 'kiegeszitok.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4000'
    }
  }
})
