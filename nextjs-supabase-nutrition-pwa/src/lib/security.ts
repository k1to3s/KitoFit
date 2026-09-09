import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { rateLimits, auditLogs } from '@/db/schema';
import { sql } from 'drizzle-orm';
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export function json(data: unknown, status = 200) { return NextResponse.json(data, {status, headers:{'Cache-Control':'no-store'}}); }
export function failure(error: unknown) { if(error instanceof z.ZodError) return json({error:{code:'INVALID_REQUEST',message:'Please check the supplied fields.'}},400); if(error instanceof ApiError) return json({error:{code:`REQUEST_${error.status}`,message:error.message}},error.status); console.error('Request failed', error instanceof Error ? error.name : 'UnknownError'); return json({error:{code:'INTERNAL_ERROR',message:'Something went wrong. Please try again.'}},500); }
export function checkOrigin(req: Request) {
 const origin=req.headers.get('origin');
 const app=process.env.NEXT_PUBLIC_APP_URL;
 const allowed = [app, process.env.E2B_SANDBOX_ID ? `https://3000-${process.env.E2B_SANDBOX_ID}.e2b.app` : null, process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null, ...(process.env.VERCEL ? [] : [new URL(req.url).origin, 'http://localhost:3000'])].filter(Boolean);
 if(origin && !allowed.includes(origin)) throw new ApiError(403,'Origin not allowed.');
 if(!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.get('x-requested-with') !== 'bloom' ) throw new ApiError(403,'Request verification failed.');
}
export async function body<T extends z.ZodType>(req: Request,schema:T):Promise<z.infer<T>> { if(Number(req.headers.get('content-length')||0)>64000)throw new ApiError(413,'Request too large.'); const raw=await req.text(); if(raw.length>64000)throw new ApiError(413,'Request too large.'); try{return schema.parse(JSON.parse(raw));}catch(e){if(e instanceof z.ZodError)throw e;throw new ApiError(400,'Invalid JSON.');} }
export async function limit(key:string,max=60,seconds=60) {
 const bucket=Math.floor(Date.now()/(seconds*1000));
 const [row]=await db.insert(rateLimits).values({key:`${key}:${bucket}`,count:1,expiresAt:new Date((bucket+1)*seconds*1000)}).onConflictDoUpdate({target:rateLimits.key,set:{count:sql`${rateLimits.count}+1`}}).returning();
 if(row.count>max)throw new ApiError(429,'Too many requests. Please wait a minute and try again.');
}
export function serverSupabase(token?:string,admin=false){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=admin?process.env.SUPABASE_SERVICE_ROLE_KEY:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new ApiError(503,'This feature needs a connected Supabase account. Your demo diary is still available.');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:token?{headers:{Authorization:`Bearer ${token}`}}:undefined});
}
export async function identity(req:Request,realOnly=false){
 checkOrigin(req);
 const header=z.string().max(8192).optional().parse(req.headers.get('authorization')||undefined);
 if(header){const token=header.replace(/^Bearer /,''); const client=serverSupabase(token);const {data,error}=await client.auth.getUser(token);if(error||!data.user)throw new ApiError(401,'Please sign in again.');if(!data.user.email_confirmed_at)throw new ApiError(403,'Please verify your email first.');return {id:data.user.id,token,demo:false};}
 if(realOnly||process.env.NEXT_PUBLIC_SUPABASE_URL)throw new ApiError(401,'Please sign in to continue.');
 const jar=await cookies();const supplied=req.headers.get('x-demo-session');let secret=supplied?z.string().regex(/^[a-f0-9]{64}$/).parse(supplied):jar.get('bloom_demo')?.value;
 if(!secret||!/^[a-f0-9]{64}$/.test(secret))secret=randomBytes(32).toString('hex');
 if(jar.get('bloom_demo')?.value!==secret)jar.set('bloom_demo',secret,{httpOnly:true,secure:new URL(req.url).protocol==='https:',sameSite:'strict',path:'/',maxAge:604800});
 const hash=createHash('sha256').update(secret).digest('hex');const id=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
 return {id,token:undefined,demo:true};
}
export async function audit(userId:string,action:string){await db.insert(auditLogs).values({userId,date:new Date().toISOString().slice(0,10),data:{action}});}
export const dateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
export const foodSchema=z.object({name:z.string().trim().min(1).max(150),meal:z.enum(['Breakfast','Lunch','Dinner','Snacks']),date:dateSchema,serving:z.string().trim().min(1).max(100),grams:z.number().positive().max(10000),calories:z.number().min(0).max(20000),protein:z.number().min(0).max(2000),carbs:z.number().min(0).max(2000),fat:z.number().min(0).max(2000),image:z.string().url().max(1000).refine(v=>new URL(v).hostname==='images.pexels.com').nullable().optional()}).strict();
