import { z } from 'zod';
import { identity,limit,json,failure } from '@/lib/security';
import { lookup } from '@/lib/food-search';
import { library } from '@/lib/demo';
import { db } from '@/db';
import { customFoods } from '@/db/schema';
import { eq } from 'drizzle-orm';
export async function GET(req:Request){try{const user=await identity(req);const q=z.object({q:z.string().trim().min(1).max(100),barcode:z.enum(['true','false']).optional()}).strict().parse(Object.fromEntries(new URL(req.url).searchParams));await limit(`foods:${user.id}`,15);const barcode=q.barcode==='true';if(barcode)z.string().regex(/^\d{8,14}$/).parse(q.q);const local=barcode?[]:library.filter(f=>f.name.toLowerCase().includes(q.q.toLowerCase())).map(f=>({...f,source:'reference'}));const customs=barcode?[]:(await db.select().from(customFoods).where(eq(customFoods.userId,user.id))).map(f=>({...f.data,source:'custom'})).filter(f=>String((f as Record<string,unknown>).name).toLowerCase().includes(q.q.toLowerCase()));try{const foods=await lookup(q.q,barcode);return json({foods:[...customs,...local,...foods],note:foods.length?'Nutrition per 100 g. Verify against the package label.':'No complete product match. You can enter nutrition manually.'});}catch{return json({foods:[...customs,...local],note:'Food search is temporarily unavailable. Reference foods and manual entry still work.'});}}catch(e){return failure(e);}}
