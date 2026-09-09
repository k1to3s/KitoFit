import { z } from 'zod';
import { and,eq,desc,sql,or } from 'drizzle-orm';
import { db } from '@/db';
import { chatRooms,chatMembers,messages,blocks,reports } from '@/db/schema';
import { identity,body,limit,json,failure,ApiError,audit,serverSupabase } from '@/lib/security';
async function member(userId:string,roomId:string){const [m]=await db.select().from(chatMembers).where(and(eq(chatMembers.userId,userId),eq(chatMembers.roomId,roomId)));if(!m)throw new ApiError(403,'This circle is private. Ask its owner for an invitation.');}
export async function GET(req:Request){try{const user=await identity(req,true);await limit(`chat-read:${user.id}`,120);const q=z.object({room:z.string().uuid().optional()}).strict().parse(Object.fromEntries(new URL(req.url).searchParams));if(q.room){await member(user.id,q.room);const blocked=await db.select().from(blocks).where(or(eq(blocks.userId,user.id),eq(blocks.blockedId,user.id)));const ids=blocked.map(b=>b.userId===user.id?b.blockedId:b.userId);const rows=await db.select().from(messages).where(eq(messages.roomId,q.room)).orderBy(desc(messages.createdAt)).limit(100);return json({messages:rows.filter(m=>!ids.includes(m.userId)).reverse()});}const rooms=await db.select({id:chatRooms.id,name:chatRooms.name,userId:chatRooms.userId}).from(chatRooms).innerJoin(chatMembers,eq(chatMembers.roomId,chatRooms.id)).where(eq(chatMembers.userId,user.id)).limit(100);return json({rooms,userId:user.id});}catch(e){return failure(e);}}
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),name:z.string().trim().min(1).max(80)}).strict(),
 z.object({action:z.literal('invite'),roomId:z.string().uuid(),userId:z.string().uuid()}).strict(),
 z.object({action:z.literal('send'),roomId:z.string().uuid(),content:z.string().trim().min(1).max(2000)}).strict(),
 z.object({action:z.literal('block'),roomId:z.string().uuid(),userId:z.string().uuid()}).strict(),
 z.object({action:z.literal('report'),roomId:z.string().uuid(),messageId:z.string().uuid()}).strict()
]);
export async function POST(req:Request){try{const user=await identity(req,true);const input=await body(req,schema);await limit(`chat-${input.action}:${user.id}`,input.action==='send'?15:5,60);
 if(input.action==='create'){const room=await db.transaction(async tx=>{const [room]=await tx.insert(chatRooms).values({userId:user.id,name:input.name}).returning();await tx.insert(chatMembers).values({roomId:room.id,userId:user.id});return room;});return json(room,201);}
 await member(user.id,input.roomId);
 if(input.action==='send'){const [m]=await db.insert(messages).values({roomId:input.roomId,userId:user.id,content:input.content}).returning();return json(m,201);}
 if(input.action==='invite'){const [room]=await db.select().from(chatRooms).where(and(eq(chatRooms.id,input.roomId),eq(chatRooms.userId,user.id)));if(!room)throw new ApiError(403,'Only the circle owner can invite members.');const {data,error}=await serverSupabase(undefined,true).auth.admin.getUserById(input.userId);if(error||!data.user?.email_confirmed_at)throw new ApiError(400,'This verified member could not be added.');const [blocked]=await db.select().from(blocks).where(or(and(eq(blocks.userId,input.userId),eq(blocks.blockedId,user.id)),and(eq(blocks.userId,user.id),eq(blocks.blockedId,input.userId))));if(blocked)throw new ApiError(403,'This invitation is not available.');await db.insert(chatMembers).values({roomId:input.roomId,userId:input.userId}).onConflictDoNothing();await audit(user.id,'chat.member_invited');return json({ok:true});}
 if(input.action==='block'){await member(input.userId,input.roomId);if(input.userId===user.id)throw new ApiError(400,'You cannot block yourself.');await db.insert(blocks).values({userId:user.id,blockedId:input.userId}).onConflictDoNothing();return json({ok:true});}
 const [message]=await db.select().from(messages).where(and(eq(messages.id,input.messageId),eq(messages.roomId,input.roomId)));if(!message)throw new ApiError(404,'Message not found.');await db.insert(reports).values({userId:user.id,date:new Date().toISOString().slice(0,10),data:{messageId:message.id,roomId:input.roomId,reason:'User report',status:'pending'}});await audit(user.id,'chat.reported');return json({ok:true});
}catch(e){return failure(e);}}
