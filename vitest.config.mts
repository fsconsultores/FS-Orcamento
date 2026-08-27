import { defineConfig } from 'vitest/config'
import path from 'path'

// Testes unitários (*.test.ts, colocados junto do código-fonte) — separado
// dos testes E2E do Playwright em tests/e2e (*.spec.ts, outro test runner,
// exclui explicitamente pra nunca colidir).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'tests/e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
