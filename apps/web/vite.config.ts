import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import rootPackage from '../../package.json';

// Keeps the JSON-LD softwareVersion in lockstep with the release version.
const appVersion: Plugin = {
  name: 'app-version',
  transformIndexHtml: (html) =>
    html.replaceAll('%APP_VERSION%', rootPackage.version),
};

export default defineConfig({
  plugins: [react(), tailwindcss(), appVersion],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    port: 5173,
  },
});
