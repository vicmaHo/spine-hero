import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Plugin que permite import() dinámico de los ficheros JS de MediaPipe WASM
 * que están en public/. Vite los bloquea por defecto en modo dev porque
 * considera que ficheros en public/ no deben importarse desde código fuente.
 * Este plugin intercepta la resolución y los sirve directamente.
 */
function mediapipeWasmPlugin(): Plugin {
  return {
    name: 'mediapipe-wasm-loader',
    enforce: 'pre',
    resolveId(id) {
      // Interceptar rutas /wasm/*.js y /models/*.task
      if (id.startsWith('/wasm/') || id.startsWith('/models/')) {
        const filePath = resolve(__dirname, 'public', id.slice(1));
        if (existsSync(filePath)) {
          return id;
        }
      }
      return null;
    },
    load(id) {
      if (id.startsWith('/wasm/') && id.endsWith('.js')) {
        const filePath = resolve(__dirname, 'public', id.slice(1));
        return readFileSync(filePath, 'utf-8');
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [mediapipeWasmPlugin(), react(), tailwindcss()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  worker: { format: 'es' },
});
