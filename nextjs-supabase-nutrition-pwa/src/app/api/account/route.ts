import { z } from 'zod';
import { eq,sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { identity,body,json,failure,limit,serverSupabase,ApiError } from '@/lib/security';
export const maxDuration=60;
const owned={profiles:schema.profiles,foods:schema.foodLogs,customFoods:schema.customFoods,supplements:schema.supplements,supplementLogs:schema.supplementLogs,schedules:schema.supplementSchedules,workouts:schema.workouts,workoutSessions:schema.workoutSessions,exercises:schema.exercises,sets:schema.workoutSets,water:schema.trackerRecords,pushSubscriptions:schema.pushSubscriptions,auditLogs:schema.auditLogs,reports:schema.reports};
export async function GET(req:Request){try{
 const user=await identity(req);await limit(`export:${user.id}`,3,3600);z.object({}).strict().parse(Object.fromEntries(new URL(req.url).searchParams));
 const result:Record<string,unknown>={exportedAt:new Date().toISOString(),formatVersion:1};
 for(const [name,table] of Object.entries(owned))result[name]=await db.select().from(table).where(eq(table.userId,user.id));
 result.messages=await db.select().from(schema.messages).where(eq(schema.messages.userId,user.id));
 result.chatMemberships=await db.select().from(schema.chatMembers).where(eq(schema.chatMembers.userId,user.id));
 result.chatRooms=await db.select().from(schema.chatRooms).where(eq(schema.chatRooms.userId,user.id));
 result.blocks=await db.select().from(schema.blocks).where(eq(schema.blocks.userId,user.id));
 if(!user.demo){
  const {data:auth}=await serverSupabase(user.token).auth.getUser(user.token);result.account={id:user.id,email:auth.user?.email,createdAt:auth.user?.created_at};
  const storage=serverSupabase(undefined,true).storage.from('meal-photos');const photos:unknown[]=[];const deadline=Date.now()+45000;
  for(let offset=0;;offset+=500){if(Date.now()>deadline)throw new ApiError(503,'This photo export is too large for one request. Contact the operator for a full data export.');const {data:files,error}=await storage.list(user.id,{limit:500,offset,sortBy:{column:'name',order:'asc'}});if(error)throw new ApiError(503,'Photo export is unavailable. Please try again.');if(!files?.length)break;
   const signed=await storage.createSignedUrls(files.map(f=>`${user.id}/${f.name}`),300);if(signed.error||signed.data?.some(f=>f.error))throw new ApiError(503,'Photo export is unavailable. Please try again.');photos.push(...(signed.data||[]).map(f=>({name:f.path,signedUrl:f.signedUrl,expiresIn:300})));if(files.length<500)break;
  }result.photos=photos;
 }return json(result);
}catch(e){return failure(e);}}
export async function DELETE(req:Request){try{
 const user=await identity(req);await limit(`delete:${user.id}`,3,3600);const input=await body(req,z.object({confirm:z.literal('DELETE'),password:z.string().min(8).max(128).optional()}).strict());
 if(!user.demo){
  const {data}=await serverSupabase(user.token).auth.getUser(user.token);if(!input.password||!data.user?.email)throw new ApiError(403,'Re-enter your password to confirm account deletion.');
  const {error}=await serverSupabase().auth.signInWithPassword({email:data.user.email,password:input.password});if(error)throw new ApiError(403,'Password verification failed.');
  const storage=serverSupabase(undefined,true).storage.from('meal-photos');const deadline=Date.now()+40000;
  while(true){if(Date.now()>deadline)throw new ApiError(503,'Some photos were removed. Please retry deletion to finish safely.');const {data:files,error}=await storage.list(user.id,{limit:100});if(error)throw new ApiError(503,'Could not delete photos. Please retry.');if(!files?.length)break;const deleted=await storage.remove(files.map(f=>`${user.id}/${f.name}`));if(deleted.error)throw new ApiError(503,'Could not delete photos. Please retry.');}
 }
 await db.transaction(async tx=>{for(const table of Object.values(owned))await tx.delete(table).where(eq(table.userId,user.id));await tx.delete(schema.messages).where(eq(schema.messages.userId,user.id));await tx.delete(schema.chatMembers).where(eq(schema.chatMembers.userId,user.id));await tx.delete(schema.chatRooms).where(eq(schema.chatRooms.userId,user.id));await tx.delete(schema.blocks).where(sql`${schema.blocks.userId}=${user.id} OR ${schema.blocks.blockedId}=${user.id}`);await tx.delete(schema.foodsCache).where(sql`${schema.foodsCache.key} LIKE ${`ai:${user.id}:%`}`);});
 if(!user.demo){const {error}=await serverSupabase(undefined,true).auth.admin.deleteUser(user.id);if(error)throw new ApiError(503,'Your data was removed, but account deletion needs to be retried.');}else (await cookies()).delete('bloom_demo');
 return json({ok:true});
}catch(e){return failure(e);}}
