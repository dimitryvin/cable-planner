import { defineConfig } from 'vitest/config';

// No @vitejs/plugin-react: Vite's built-in transform handles TSX with the
// automatic JSX runtime, which keeps the dependency list to React + Vite + Vitest.
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
