import { defineConfig } from 'vite';
import { roomsApi } from './tools/roomsApi.ts';

export default defineConfig({
  plugins: [roomsApi('rooms')],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: false,
    open: true,
  },
  preview: {
    host: 'localhost',
  },
});
