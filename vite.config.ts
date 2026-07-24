import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // Bỏ qua docs/ (tài liệu làm việc, không phải source) — file Office đang mở
      // bị khóa làm watcher chết với EBUSY trên Windows.
      ignored: ['**/docs/**'],
    },
  },
});
