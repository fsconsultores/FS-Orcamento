import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;

  if (!tenantId || !clientId) {
    return NextResponse.redirect(`${origin}/login?error=microsoft_not_configured`);
  }

  const redirectUri = `${origin}/api/auth/microsoft/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'openid email profile User.Read',
    response_mode: 'query',
  });

  const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`;
  return NextResponse.redirect(authUrl);
}
