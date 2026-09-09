import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { json,failure } from '@/lib/security';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{z.object({}).strict().parse(Object.fromEntries(new URL(req.url).searchParams));await db.execute(sql`select 1`);return json({ok:true});}catch(error){return failure(error);}}
