import { NextRequest,NextResponse } from 'next/server';
export function proxy(req:NextRequest){
 const nonce=Buffer.from(crypto.randomUUID()).toString('base64');
 const supabase=process.env.NEXT_PUBLIC_SUPABASE_URL;let connect="'self'";let images="'self' data: blob: https://images.pexels.com";
 if(supabase){try{const url=new URL(supabase);connect+=` ${url.origin} ${url.origin.replace('https:','wss:')}`;images+=` ${url.origin}`;}catch{}}
 const csp=["default-src 'self'",`script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${process.env.NODE_ENV==='development'?" 'unsafe-eval'":''}`,"style-src 'self' 'unsafe-inline'",`img-src ${images}`,"font-src 'self'",`connect-src ${connect}`,"worker-src 'self' blob:","media-src 'self' blob:","object-src 'none'","base-uri 'self'","form-action 'self'",process.env.E2B_SANDBOX_ID&&!supabase?"frame-ancestors *":"frame-ancestors 'none'"].join('; ');
 const headers=new Headers(req.headers);headers.set('x-nonce',nonce);headers.set('Content-Security-Policy',csp);
 const origin=req.headers.get('origin');const allowed=[process.env.NEXT_PUBLIC_APP_URL,process.env.E2B_SANDBOX_ID?`https://3000-${process.env.E2B_SANDBOX_ID}.e2b.app`:null,process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:null,...(process.env.VERCEL?[]:[req.nextUrl.origin,'http://localhost:3000'])].filter(Boolean);
 if(req.nextUrl.pathname.startsWith('/api/')&&origin&&!allowed.includes(origin))return NextResponse.json({error:{code:'FORBIDDEN',message:'Origin not allowed.'}},{status:403});
 const response=req.method==='OPTIONS'?new NextResponse(null,{status:204}):NextResponse.next({request:{headers}});response.headers.set('Content-Security-Policy',csp);
 if(req.nextUrl.pathname.startsWith('/api/')){response.headers.set('Cache-Control','no-store');if(origin&&allowed.includes(origin)){response.headers.set('Access-Control-Allow-Origin',origin);response.headers.set('Vary','Origin');response.headers.set('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');response.headers.set('Access-Control-Allow-Headers','Authorization,Content-Type,X-Requested-With,X-Demo-Session');}}
 return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|icon.svg|icons/|wasm/|sw.js|offline.html|manifest.webmanifest).*)']};
