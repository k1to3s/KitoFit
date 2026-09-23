import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/privacy', '/terms'];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(path + '/')
  );
}

export async function proxy(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let connect = "'self'";
  let images = "'self' data: blob: https://images.pexels.com";
  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl);
      connect += ` ${url.origin} ${url.origin.replace('https:', 'wss:')}`;
      images += ` ${url.origin}`;
    } catch {}
  }

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${images}`,
    "font-src 'self'",
    `connect-src ${connect}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    process.env.E2B_SANDBOX_ID && !supabaseUrl ? "frame-ancestors *" : "frame-ancestors 'none'",
  ].join('; ');

  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);

  const origin = req.headers.get('origin');
  const allowed = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.E2B_SANDBOX_ID ? `https://3000-${process.env.E2B_SANDBOX_ID}.e2b.app` : null,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    ...(process.env.VERCEL ? [] : [req.nextUrl.origin, 'http://localhost:3000']),
  ].filter(Boolean);

  if (
    req.nextUrl.pathname.startsWith('/api/') &&
    origin &&
    !allowed.includes(origin)
  ) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Origin not allowed.' } },
      { status: 403 }
    );
  }

  let response = req.method === 'OPTIONS'
    ? new NextResponse(null, { status: 204 })
    : NextResponse.next({ request: { headers } });

  if (supabaseUrl && supabaseKey) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const { data } = await supabase.auth.getClaims();

    if (
      !isPublicPath(req.nextUrl.pathname) &&
      !req.nextUrl.pathname.startsWith('/api/') &&
      !data?.claims
    ) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('next', req.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }

    response.headers.set('Cache-Control', 'private, no-store');
  }

  if (req.nextUrl.pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'no-store');
    if (origin && allowed.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Vary', 'Origin');
      response.headers.set('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
      response.headers.set(
        'Access-Control-Allow-Headers',
        'Authorization,Content-Type,X-Requested-With,X-Demo-Session'
      );
    }
  }

  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|icons/|wasm/|sw.js|offline.html|manifest.webmanifest).*)',
  ],
};
