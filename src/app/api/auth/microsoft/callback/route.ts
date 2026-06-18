import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ALLOWED_EMAIL_DOMAIN = 'fsconsultores.com.br';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const msError = searchParams.get('error');

  if (msError || !code) {
    return NextResponse.redirect(`${origin}/login?error=microsoft_auth_failed`);
  }

  const tenantId = process.env.AZURE_TENANT_ID!;
  const clientId = process.env.AZURE_CLIENT_ID!;
  const clientSecret = process.env.AZURE_CLIENT_SECRET!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const redirectUri = `${origin}/api/auth/microsoft/callback`;

  try {
    // Troca o código pelo access token
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      }
    );

    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      return NextResponse.redirect(`${origin}/login?error=microsoft_token_failed`);
    }

    // Busca informações do usuário no Microsoft Graph
    const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const msUser = await userRes.json();
    const email = ((msUser.mail || msUser.userPrincipalName) ?? '').trim().toLowerCase();

    if (!email || !email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      return NextResponse.redirect(`${origin}/login?error=domain_not_allowed`);
    }

    // Admin client — não exposto ao browser
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Cria o usuário se não existir (ignora erro de "já existe")
    await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: msUser.displayName ?? '',
        provider: 'microsoft',
      },
    });

    // Gera um magic link para criar a sessão sem interação do usuário
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('[microsoft-callback] generateLink error:', JSON.stringify(linkError));
      console.error('[microsoft-callback] generateLink data:', JSON.stringify(linkData));
      return NextResponse.redirect(`${origin}/login?error=session_creation_failed`);
    }

    const tokenHash = linkData.properties.hashed_token;
    if (!tokenHash) {
      console.error('[microsoft-callback] hashed_token missing, properties:', JSON.stringify(linkData.properties));
      return NextResponse.redirect(`${origin}/login?error=session_creation_failed`);
    }

    return NextResponse.redirect(
      `${origin}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`
    );
  } catch {
    return NextResponse.redirect(`${origin}/login?error=microsoft_auth_failed`);
  }
}
