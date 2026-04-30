export const ALLOWED_EMAIL_DOMAIN = 'fsconsultores.com.br';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return (email ?? '').trim().toLowerCase();
}

export function isAllowedDomain(email: string): boolean {
  const normalized = normalizeEmail(email);
  if (!EMAIL_REGEX.test(normalized)) return false;
  return normalized.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

export function getEmailValidationError(email: string): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return 'Informe seu email.';
  if (!EMAIL_REGEX.test(normalized)) return 'Email inválido.';
  if (!normalized.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
    return `Acesso restrito: apenas emails @${ALLOWED_EMAIL_DOMAIN} são permitidos.`;
  }
  return null;
}
