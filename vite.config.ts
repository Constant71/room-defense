import { defineConfig } from 'vite';
import { phoneRemote } from './tools/remote.ts';
import { roomsApi } from './tools/roomsApi.ts';

// `npm run dev` stays on this PC only. `npm run dev:phone` (mode "phone") also
// listens on the home network so a phone can edit rooms after pairing.
export default defineConfig(({ mode }) => {
  const phone = mode === 'phone';
  return {
    plugins: [roomsApi('rooms'), phoneRemote(phone)],
    server: {
      host: phone ? '0.0.0.0' : 'localhost',
      port: 5173,
      strictPort: false,
      open: true,
    },
    preview: {
      host: phone ? '0.0.0.0' : 'localhost',
    },
    build: {
      rollupOptions: {
        input: { main: 'index.html', phone: 'phone.html' },
      },
    },
  };
});
