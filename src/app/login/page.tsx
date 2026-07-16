'use client';

import { useState, FormEvent, useEffect, useTransition, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import {
  getEmailValidationError,
  normalizeEmail,
  ALLOWED_EMAIL_DOMAIN,
} from '@/lib/auth/validate-domain';

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [microsoftLoading, setMicrosoftLoading] = useState(false);

  useEffect(() => {
    const errorParam = searchParams.get('error');
    const messages: Record<string, string> = {
      domain_not_allowed: `Acesso restrito a contas @${ALLOWED_EMAIL_DOMAIN}.`,
      microsoft_auth_failed: 'Falha na autenticação com Microsoft. Tente novamente.',
      microsoft_token_failed: 'Erro ao validar token da Microsoft. Tente novamente.',
      microsoft_not_configured: 'Login com Microsoft não configurado.',
      session_creation_failed: 'Não foi possível criar a sessão. Tente novamente.',
      auth_callback_failed: 'Falha na autenticação. Tente novamente.',
    };
    if (errorParam && messages[errorParam]) {
      setError(messages[errorParam]);
    }
  }, [searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const domainError = getEmailValidationError(email);
    if (domainError) {
      setError(domainError);
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: normalizeEmail(email),
        password,
      });

      if (authError) {
        const msg = authError.message?.toLowerCase() ?? '';
        if (msg.includes('invalid') || msg.includes('credentials')) {
          setError('Email ou senha incorretos.');
        } else if (msg.includes('email not confirmed')) {
          setError('Email ainda não confirmado. Verifique sua caixa de entrada (e spam).');
        } else {
          setError('Não foi possível autenticar. Tente novamente.');
        }
        return;
      }

      startTransition(() => {
        router.push('/dashboard');
        router.refresh();
      });
    } catch {
      setError('Erro inesperado. Tente novamente em instantes.');
    } finally {
      setLoading(false);
    }
  }

  function handleMicrosoftLogin() {
    setError(null);
    setMicrosoftLoading(true);
    window.location.href = '/api/auth/microsoft';
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image src="/logofs.png" alt="fsconsultores" width={320} height={100} className="h-24 w-auto object-contain mx-auto block" priority />
          <p className="text-sm text-gray-500">Sistema de orçamento de obras</p>
        </div>
        <div className="space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Entrar</h2>

          <button
            type="button"
            onClick={handleMicrosoftLogin}
            disabled={microsoftLoading || loading}
            className="flex w-full items-center justify-center gap-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <MicrosoftIcon />
            {microsoftLoading ? 'Redirecionando...' : 'Entrar com Microsoft'}
          </button>

          <div className="relative flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-500">ou</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1">
              <label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email corporativo
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={`seu.nome@${ALLOWED_EMAIL_DOMAIN}`}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="text-sm font-medium text-gray-700">
                Senha
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {error && (
              <p role="alert" aria-live="polite" className="text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || microsoftLoading}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Entrando...' : 'Entrar com email'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-500">
            Sem conta?{' '}
            <Link href="/signup" className="text-blue-600 hover:underline">
              Criar conta
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
