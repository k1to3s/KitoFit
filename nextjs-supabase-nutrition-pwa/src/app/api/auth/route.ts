import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createHash } from 'crypto';
import { body,checkOrigin,serverSupabase,limit,json,failure,ApiError } from '@/lib/security';

export async function POST(req:Request){
  try{
    checkOrigin(req);
    const input=await body(req,z.object({
      action:z.enum(['login','signup','reset','resend','logout']),
      email:z.string().email().max(254).optional(),
      password:z.string().min(8).max(128).optional()
    }).strict());
    if(input.action==='logout'){
      const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if(url&&key){
        const cookieStore=await cookies();
        const client=createServerClient(url,key,{cookies:{getAll(){return cookieStore.getAll();},setAll(cookiesToSet){cookiesToSet.forEach(({name,value,options})=>cookieStore.set(name,value,options));}}});
        await client.auth.signOut();
      }
      return json({ok:true});
    }
    if(!input.email)throw new ApiError(400,'An email address is required.');
    const ip=req.headers.get('x-vercel-forwarded-for')||req.headers.get('x-forwarded-for')?.split(',')[0]||'local';
    await limit(`auth-ip:${createHash('sha256').update(ip).digest('hex')}`,10,300);
    await limit(`auth-email:${createHash('sha256').update(input.email.toLowerCase()).digest('hex')}`,5,300);

    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if(!url||!key)throw new ApiError(503,'Supabase is not connected.');

    const cookieStore=await cookies();
    const s=createServerClient(url,key,{
      cookies:{
        getAll(){return cookieStore.getAll();},
        setAll(cookiesToSet){
          cookiesToSet.forEach(({name,value,options})=>cookieStore.set(name,value,options));
        }
      }
    });

    const redirect=process.env.NEXT_PUBLIC_APP_URL||new URL(req.url).origin;

    if(input.action==='reset'){
      await s.auth.resetPasswordForEmail(input.email,{redirectTo:`${redirect}/?recovery=true`});
      return json({message:'If this email has an account, a reset link is on its way.'});
    }

    if(input.action==='resend'){
      await s.auth.resend({type:'signup',email:input.email,options:{emailRedirectTo:redirect}});
      return json({message:'If eligible, a new verification email is on its way.'});
    }

    if(!input.password)throw new ApiError(400,'A password of at least 8 characters is required.');

    if(input.action==='signup'){
      const {error}=await s.auth.signUp({
        email:input.email,
        password:input.password,
        options:{emailRedirectTo:redirect}
      });
      if(error){
        console.error('Supabase signup error:',error.message,error.code,error.status);
        throw new ApiError(400,'Unable to create account. Check your details or try signing in.');
      }
      return json({message:'Check your email to verify your account, then sign in.'});
    }

    const {data,error}=await s.auth.signInWithPassword({email:input.email,password:input.password});
    if(error||!data.session)throw new ApiError(401,'Sign-in failed. Check your credentials and verify your email.');

    return json({
      session:{
        access_token:data.session.access_token,
        refresh_token:data.session.refresh_token
      }
    });
  }catch(e){
    return failure(e);
  }
}
