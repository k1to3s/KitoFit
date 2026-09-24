import { z } from 'zod';
import { identity,limit,json,failure } from '@/lib/security';
import { lookup } from '@/lib/food-search';
import { library,drinkLibrary } from '@/lib/demo';
import { db } from '@/db';
import { customFoods } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { lookupPlu } from '@/lib/plu-catalog';
import { findFoodByLabel } from '@/lib/food-catalog';
export async function GET(req:Request){try{const user=await identity(req);const q=z.object({q:z.string().trim().min(1).max(100),barcode:z.enum(['true','false']).optional()}).strict().parse(Object.fromEntries(new URL(req.url).searchParams));await limit(`foods:${user.id}`,15);const barcode=q.barcode==='true';if(barcode)z.string().regex(/^\d{4,14}$/).parse(q.q);const term=q.q.toLowerCase();const compactTerm=term.replace(/[^a-z0-9]+/g,'');
 if(barcode){
   const plu=lookupPlu(q.q);
   if(plu){
     const food=findFoodByLabel(plu.food);
     if(food){
       return json({foods:[{name:`${plu.organic?'Organic ':''}${food.name}`,calories:food.calories,protein:food.protein,carbs:food.carbs,fat:food.fat,source:'IFPS PLU',servingGrams:100}],note:`PLU ${q.q} matched ${plu.organic?'organic ':''}${food.name}. Nutrition is an approximate local reference value per 100 g; adjust the portion before saving.`});
     }
   }
   if(/^\d{4,5}$/.test(q.q)) return json({foods:[],note:'That looks like a produce PLU, but Bloom does not have that PLU mapped yet. You can still enter the food manually. PLUs are not product barcodes.'});
 }
 const local=barcode?[]:[...library,...drinkLibrary].filter(f=>{
   const name=f.name.toLowerCase();
   if(name.includes(term)||name.replace(/[^a-z0-9]+/g,'').includes(compactTerm)) return true;
   if(term==='coke'||term==='coca') return name.includes('coca-cola')||name.includes('diet coke');
   if(term==='soda'||term==='pop') return ['coca-cola original','diet coke','sports drink','energy drink'].includes(name)||f.name.toLowerCase().includes('monster')||f.name.toLowerCase().includes('red bull')||f.name.toLowerCase().includes('gatorade')||f.name.toLowerCase().includes('powerade');
   if(term==='oj') return name==='orange juice';
   return false;
 }).map(f=>({...f,source:'reference'}));const customs=barcode?[]:(await db.select().from(customFoods).where(eq(customFoods.userId,user.id))).map(f=>({...f.data,source:'custom'})).filter(f=>String((f as Record<string,unknown>).name).toLowerCase().includes(q.q.toLowerCase()));try{const foods=await lookup(q.q,barcode);return json({foods:[...customs,...local,...foods],note:foods.length?'Nutrition is shown per 100 g/ml. Verify the exact product and package label before saving.':'No complete product match. You can enter nutrition manually.'});}catch{return json({foods:[...customs,...local],note:'Food search is temporarily unavailable. Reference foods and manual entry still work.'});}}catch(e){return failure(e);}}
