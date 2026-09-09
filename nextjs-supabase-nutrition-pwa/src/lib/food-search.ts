import 'server-only';
import { db } from '@/db';
import { foodsCache } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
const product=z.object({product_name:z.string().max(200).optional(),nutriments:z.record(z.string(),z.union([z.number(),z.string()])).optional()});
export type Nutrition={name:string;calories:number;protein:number;carbs:number;fat:number;source?:string};
export async function lookup(query:string,barcode=false):Promise<Nutrition[]>{
 const key=`off:${barcode?'b':'q'}:${query.toLowerCase()}`;const [cached]=await db.select().from(foodsCache).where(eq(foodsCache.key,key));if(cached&&cached.expiresAt>new Date())return cached.data as Nutrition[];
 const fields='product_name,nutriments';const url=barcode?`https://world.openfoodfacts.org/api/v2/product/${query}?fields=${fields}`:`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=8&fields=${fields}`;
 const res=await fetch(url,{headers:{'User-Agent':`BloomNutrition/1.0 (${process.env.NEXT_PUBLIC_APP_URL||'local-development'})`},signal:AbortSignal.timeout(6000)});if(!res.ok)throw new Error('Food provider unavailable');
 const raw=await res.json();const parsed=z.array(product).parse(barcode?(raw.product?[raw.product]:[]):raw.products||[]);
 const results=parsed.filter(p=>p.product_name&&p.nutriments&&['energy-kcal_100g','proteins_100g','carbohydrates_100g','fat_100g'].every(k=>p.nutriments![k]!==undefined&&Number.isFinite(Number(p.nutriments![k])))).map(p=>({name:p.product_name!,calories:Number(p.nutriments!['energy-kcal_100g']),protein:Number(p.nutriments!.proteins_100g),carbs:Number(p.nutriments!.carbohydrates_100g),fat:Number(p.nutriments!.fat_100g),source:'openfoodfacts'})).filter(p=>p.calories>=0&&p.calories<=1000&&[p.protein,p.carbs,p.fat].every(v=>v>=0&&v<=100));
 await db.insert(foodsCache).values({key,data:results,expiresAt:new Date(Date.now()+7*86400000)}).onConflictDoUpdate({target:foodsCache.key,set:{data:results,expiresAt:new Date(Date.now()+7*86400000)}});return results;
}
