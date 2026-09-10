import { z } from 'zod';
import { createHash } from 'crypto';
import sharp from 'sharp';
import { InferenceClient } from '@huggingface/inference';
import { db } from '@/db';
import { foodsCache,customFoods,rateLimits } from '@/db/schema';
import { eq,sql } from 'drizzle-orm';
import { identity,json,failure,limit,serverSupabase,ApiError,audit } from '@/lib/security';
import { lookup } from '@/lib/food-search';
export const runtime='nodejs';export const maxDuration=60;
const macros=z.object({calories:z.number().min(0).max(1000),protein:z.number().min(0).max(100),carbs:z.number().min(0).max(100),fat:z.number().min(0).max(100)});
const output=z.object({items:z.array(z.object({name:z.string().max(150),confidence:z.number().min(0).max(1)})).max(5),matches:z.array(z.object({name:z.string().max(200),source:z.enum(['openfoodfacts','custom']),macrosPer100g:macros.optional(),serving:z.string().max(100).optional()})).max(15),notes:z.array(z.string().max(500)).max(10)});
const fallback={items:[],matches:[],notes:['Photo estimates are unavailable right now. Please enter the food and nutrition manually. Nothing has been logged.']};
async function boundedForm(req:Request){const max=4*1024*1024+16384;const len=Number(req.headers.get('content-length')||0);if(len>max)throw new ApiError(413,'Please choose a photo under 4 MB.');const reader=req.body?.getReader();if(!reader)throw new ApiError(400,'A photo is required.');let size=0;const chunks:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new ApiError(413,'Please choose a photo under 4 MB.');}chunks.push(value);}const buffer=Buffer.concat(chunks);return new Response(buffer,{headers:{'content-type':req.headers.get('content-type')||''}}).formData();}
export async function POST(req:Request){try{
 const user=await identity(req,true);await limit(`ai:${user.id}`,10,86400);await limit('ai:global',60,3600);
 const form=await boundedForm(req);const input=z.object({photo:z.instanceof(File).refine(f=>f.size>0&&f.size<=4*1024*1024),consent:z.literal('true')}).strict().parse(Object.fromEntries(form));
 const raw=Buffer.from(await input.photo.arrayBuffer());const jpeg=raw[0]===255&&raw[1]===216&&raw[2]===255;const png=raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));if(!jpeg&&!png)throw new ApiError(415,'Use a valid JPEG or PNG image. HEIC is not supported; export as JPEG first.');
 let clean:Buffer;try{clean=await sharp(raw,{limitInputPixels:25000000}).rotate().resize(1400,1400,{fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toBuffer();}catch{throw new ApiError(400,'This image could not be decoded. Please choose another photo.');}
 const hash=createHash('sha256').update(clean).update(process.env.HF_FOOD_MODEL||'unconfigured').digest('hex');const key=`ai:${user.id}:${hash}`;const [cached]=await db.select().from(foodsCache).where(eq(foodsCache.key,key));if(cached&&cached.expiresAt>new Date())return json(output.parse(cached.data));
 if(!process.env.HF_API_TOKEN||!process.env.HF_FOOD_MODEL)return json(fallback);
 const bucket=String(Math.floor(Date.now()/300000));const [breaker]=await db.select().from(rateLimits).where(eq(rateLimits.key,`hf-failure:${bucket}`));if((breaker?.count||0)>=3)return json({...fallback,notes:['The photo service is taking a short break. Manual food entry is still available.']});
 const storage=serverSupabase(undefined,true).storage.from('meal-photos');const path=`${user.id}/${hash}.jpg`;const {error:uploadError}=await storage.upload(path,clean,{contentType:'image/jpeg',upsert:true});if(uploadError)throw new ApiError(503,'Private photo storage is unavailable. Use manual entry for now.');await audit(user.id,'photo.uploaded');
let result: unknown;

try {
  const base64 = clean.toString('base64');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': Bearer ${process.env.OPENROUTER_API_KEY},
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openrouter/free',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: Identify the food in this photo.

Return ONLY valid JSON in this exact format:
{
  "items": [
    {
      "name": "food name",
      "confidence": 0.0
    }
  ]
}

List up to 3 foods. Confidence must be between 0 and 1.,
            },
            {
              type: 'image_url',
              image_url: {
                url: data:image/jpeg;base64,${base64},
              },
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(OpenRouter request failed: ${response.status});
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;

  if (typeof text !== 'string') {
    throw new Error('OpenRouter returned no usable result');
  }

  const parsed = JSON.parse(text);
  result = z.array(
    z.object({
      name: z.string().max(150),
      confidence: z.number().min(0).max(1),
    })
  ).parse(parsed.items);
} catch (error) {
  console.error(
    'OpenRouter food recognition failed:',
    error instanceof Error ? error.message : 'Unknown error'
  );
}
 if(!result){await db.insert(rateLimits).values({key:`hf-failure:${bucket}`,count:1,expiresAt:new Date((Number(bucket)+1)*300000)}).onConflictDoUpdate({target:rateLimits.key,set:{count:sql`${rateLimits.count}+1`}});return json(fallback);}
 const labels=z.array(z.object({label:z.string().max(150),score:z.number().min(0).max(1)})).parse(result).sort((a,b)=>b.score-a.score).slice(0,3);const items=labels.map(i=>({name:i.label.replaceAll('_',' '),confidence:i.score}));const matches:z.infer<typeof output>['matches']=[];const custom=await db.select().from(customFoods).where(eq(customFoods.userId,user.id));
 for(const item of items.slice(0,2)){const found=custom.find(f=>String(f.data.name).toLowerCase()===item.name.toLowerCase());if(found){const parsed=macros.safeParse(found.data);if(parsed.success)matches.push({name:item.name,source:'custom',macrosPer100g:parsed.data});}else try{const foods=await lookup(item.name);matches.push(...foods.slice(0,2).map(f=>({name:f.name,source:'openfoodfacts' as const,macrosPer100g:{calories:f.calories,protein:f.protein,carbs:f.carbs,fat:f.fat}})));}catch{}}
 const estimate=output.parse({items,matches,notes:['Estimate — confirm food identity, nutrition, and portion before saving. Confidence is a model score, not nutrition accuracy.','A photo cannot reliably measure grams, oils, or hidden ingredients. Nothing has been logged.']});await db.insert(foodsCache).values({key,data:estimate,expiresAt:new Date(Date.now()+7*86400000)}).onConflictDoUpdate({target:foodsCache.key,set:{data:estimate,expiresAt:new Date(Date.now()+7*86400000)}});return json(estimate);
}catch(e){return failure(e);}}
export async function GET(req:Request){try{const user=await identity(req,true);const q=z.object({hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(Object.fromEntries(new URL(req.url).searchParams));await limit(`signed:${user.id}`,30);const {data,error}=await serverSupabase(user.token).storage.from('meal-photos').createSignedUrl(`${user.id}/${q.hash}.jpg`,60);if(error)throw new ApiError(404,'Photo not found.');return json({url:data.signedUrl,expiresIn:60});}catch(e){return failure(e);}}
