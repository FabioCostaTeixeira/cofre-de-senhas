import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    projects: [
      {
        resolve: { alias: { '@': path.resolve(__dirname, '.') } },
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        resolve: { alias: { '@': path.resolve(__dirname, '.') } },
        oxc: { jsx: { runtime: 'automatic' } },
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['tests/**/*.test.tsx'],
        },
      },
    ],
  },
});
