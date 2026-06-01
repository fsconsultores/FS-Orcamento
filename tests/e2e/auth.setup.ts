import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const AUTH_FILE = path.join(__dirname, '.auth/user.json');

setup('autenticar usuário de teste', async ({ page }) => {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Defina as variáveis de ambiente TEST_EMAIL e TEST_PASSWORD.\n' +
        'Exemplo: TEST_EMAIL=seu@fsconsultores.com.br TEST_PASSWORD=suasenha npx playwright test',
    );
  }

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();

  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]:has-text("Entrar com email")');

  await expect(page).toHaveURL('/dashboard', { timeout: 15_000 });

  const dir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  await page.context().storageState({ path: AUTH_FILE });
});
