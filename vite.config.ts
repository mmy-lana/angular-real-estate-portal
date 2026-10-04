import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [angular({ tsconfig: 'tsconfig.app.json' }), tailwindcss(), tsconfigPaths()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false
  },
  server: {
    host: '127.0.0.1',
    port: 4300
  },
  preview: {
    host: '127.0.0.1',
    port: 4301
  }
});