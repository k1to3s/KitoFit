import { timingSafeEqual } from 'crypto';
import webpush from 'web-push';
import { z } from 'zod';
import { eq,sql,lt,and } from 'drizzle-orm';
import { db } from '@/db';
import { supplementSchedules,pushSubscriptions,rateLimits,foodsCache } from '@/db/schema';
import { json,failure,ApiError } from '@/lib/security';
import { endpointSchema } from '@/app/api/push/route';
export const runtime='nodejs';export const maxDuration=60;

function localParts(date:Date,timezone:string){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const get=(type:string)=>parts.find(p=>p.type===type)?.value||'';
  return {key:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`};
}

export async function GET(req:Request){
 try{
  z.object({}).strict().parse(Object.fromEntries(new URL(req.url).searchParams));
  const expected=`Bearer ${process.env.CRON_SECRET||''}`;
  const provided=req.headers.get('authorization')||'';
  if(!process.env.CRON_SECRET||expected.length!==provided.length||!timingSafeEqual(Buffer.from(expected),Buffer.from(provided)))throw new ApiError(401,'Unauthorized.');
  await db.delete(rateLimits).where(lt(rateLimits.expiresAt,new Date()));
  await db.delete(foodsCache).where(lt(foodsCache.expiresAt,new Date()));
  if(!process.env.VAPID_PUBLIC_KEY||!process.env.VAPID_PRIVATE_KEY||!process.env.VAPID_SUBJECT)return json({ok:true,sent:0,status:'Push is not configured.'});
  webpush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
  let sent=0;
  const deadline=Date.now()+45000;
  const schedules=await db.select().from(supplementSchedules).where(sql`${supplementSchedules.data}->>'enabled'='true'`).limit(200);
  for(const schedule of schedules){
   if(Date.now()>deadline)break;
   const parsed=z.object({
    name:z.string().max(100),
    dose:z.string().max(80).optional(),
    time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timezone:z.string().min(1).max(80),
    enabled:z.boolean(),
    supplementId:z.string().uuid().optional(),
    lastSentKey:z.string().max(20).optional()
   }).safeParse(schedule.data);
   if(!parsed.success)continue;
   let nowLocal:{key:string,time:string};
   try{nowLocal=localParts(new Date(),parsed.data.timezone);}catch{continue;}
   const sendKey=`${nowLocal.key} ${parsed.data.time}`;
   if(nowLocal.time!==parsed.data.time||parsed.data.lastSentKey===sendKey)continue;
   const claimed=await db.update(supplementSchedules)
    .set({data:{...schedule.data,lastSentKey:sendKey}})
    .where(and(eq(supplementSchedules.id,schedule.id),sql`(${supplementSchedules.data}->>'lastSentKey') is distinct from ${sendKey}`))
    .returning();
   if(!claimed.length)continue;
   const subs=await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId,schedule.userId)).limit(5);
   for(const sub of subs){
    const parsedSub=z.object({endpoint:endpointSchema,keys:z.object({p256dh:z.string(),auth:z.string()})}).safeParse(sub.data);
    if(!parsedSub.success)continue;
    try{
     await webpush.sendNotification(parsedSub.data,JSON.stringify({
      title:`Time for ${parsed.data.name}.`,
      body:parsed.data.dose?`${parsed.data.dose} · Your scheduled Bloom reminder.`:'Your scheduled Bloom reminder.'
     }),{TTL:3600,timeout:3500});
     sent++;
    }catch(e){
     const status=(e as {statusCode?:number}).statusCode;
     if(status===410||status===404)await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id,sub.id));
    }
   }
  }
  await db.delete(rateLimits).where(lt(rateLimits.expiresAt,new Date()));
  await db.delete(foodsCache).where(lt(foodsCache.expiresAt,new Date()));
  return json({ok:true,sent});
 }catch(e){return failure(e);}
}
