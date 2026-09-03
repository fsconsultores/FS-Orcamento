import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import path from 'path';

// Playwright não carrega .env automaticamente (diferente do Next.js)
loadEnv({ path: path.resolve(__dirname, '.env') });
loadEnv({ path: path.resolve(__dirname, '.env.local'), override: false });

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    // Em CI, o servidor sobe sempre frio (reuseExistingServer força isso) —
    // `next dev`/Turbopack compila cada rota/action sob demanda na primeira
    // vez que é exercitada, e qualquer uma pega esse imposto de compilação
    // como se fosse lentidão real (já documentado nas auditorias de
    // performance deste projeto: medir sempre contra produção, nunca dev).
    // Pior que lentidão: uma Server Action pouco exercitada (ex.: o branch de
    // erro de "duplicar com código já em uso") pode devolver 500 se for
    // atingida bem no meio da compilação. `next build && next start` paga o
    // custo de build uma vez só, no início, e depois toda rota já está pronta.
    // Localmente mantém `next dev` — reaproveitar um servidor já rodando
    // (`reuseExistingServer`) é o fluxo normal de iteração.
    command: process.env.CI ? 'npm run build && npm run start' : 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 240_000 : 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
