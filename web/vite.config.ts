import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Built output goes straight into the ASP.NET app's wwwroot/app, served at /app/.
export default defineConfig({
  base: '/app/',
  plugins: [react()],
  build: { outDir: '../Netipam/wwwroot/app', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:7088', '/auth': 'http://localhost:7088' } },
});
