/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // GitHub project Pages: /waterlevelIndicator/  | local/user site: /
  const base = env.VITE_BASE_PATH || '/';

  return {
    plugins: [react()],
    base,
    server: {
      port: 5173,
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
