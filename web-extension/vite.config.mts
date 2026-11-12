import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './public/manifest.json';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
    tailwindcss(),
    tsconfigPaths(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/popup/popup.html'),
      }
    }
  },
});