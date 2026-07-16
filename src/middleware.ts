import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

const ALLOWED_EMAIL_DOMAIN = 'fsconsultores.com.br';
const PUBLIC_PATHS = ['/login', '/signup', '/auth/callback'];

export async function middleware(req: NextRequest) {
  // Propaga o pathname atual como header de requisição — única forma
  // suportada de um Server Component saber a rota corrente sem depender de
  // params. Usado só pela instrumentação de performance dev-only
  // (src/lib/dev-metrics) para rotular queries/renders pela página de origem;
  // não afeta nada de autenticação abaixo.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', req.nextUrl.pathname);
  const res = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = req.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (user) {
    const email = (user.email ?? '').toLowerCase();
    if (!email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      await supabase.auth.signOut();
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('error', 'domain_not_allowed');
      return NextResponse.redirect(url);
    }
    if (isPublic && pathname !== '/auth/callback') {
      const url = req.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  } else if (!isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
