'use client';
import {useState,useEffect,useRef,ReactNode,FormEvent} from 'react';
import Image from 'next/image';
import {ArrowRight,ArrowUpRight,Bell,Camera,Check,ChevronRight,Dumbbell,Flower2,ImagePlus,Leaf,LoaderCircle,LogIn,MessageCircle,Plus,ScanBarcode,Search,Send,ShieldCheck,Sparkles,Trash2,Upload,X,Download,LogOut,Flag,UserX,Users,Sun,Moon} from 'lucide-react';
import {api,save,remove,Food,Data,localDate} from './dashboard';
import {library} from '@/lib/demo';
import {findFoodByLabel,type CatalogFood} from '@/lib/food-catalog';
import {supabase} from '@/lib/supabase';
export function SimpleDialog({title,close,children,wide=false,auth=false}:{title:string;close:()=>void;children:ReactNode;wide?:boolean;auth?:boolean}){const ref=useRef<HTMLDialogElement>(null);const closeRef=useRef(close);closeRef.current=close;useEffect(()=>{const d=ref.current;d?.showModal();const onCancel=(e:Event)=>{e.preventDefault();closeRef.current();};d?.addEventListener('cancel',onCancel);return()=>{d?.removeEventListener('cancel',onCancel);d?.close();};},[]);return <dialog ref={ref} className={`modal ${wide?'modal-wide ':''}${auth?'modal-auth':''}`} onClick={e=>{if(e.target===ref.current){const rect=ref.current.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)close();}}} aria-labelledby="modal-title"><div className="modal-heading"><div className="eyebrow">A LITTLE CARE FOR YOUR EVERYDAY</div><button className="icon-button" onClick={close} aria-label="Close dialog"><X size={21}/></button><h2 id="modal-title">{title}</h2></div><div className="modal-body">{children}</div></dialog>;}
function ErrorNote({text}:{text:string}){return text?<div className="error-note" role="alert">{text}</div>:null;}
function Field({label,children}:{label:string;children:ReactNode}){return <label className="field"><span>{label}</span>{children}</label>;}
const blank={name:'',calories:0,protein:0,carbs:0,fat:0};
type Nutrition=typeof blank&{source?:string;servingGrams?:number;drinkType?:string};
export function FoodDialog({date,meal:initialMeal,tab:initialTab,editing,history=[],close,onSaved}:{date:string;meal:string;tab:string;editing?:Food;history?:Food[];close:()=>void;onSaved:(s:string)=>void}){
 const [tab,setTab]=useState(initialTab);
 const selectNutrition=(food:Nutrition)=>{setSelected(food);setGrams(food.drinkType?(food.drinkType==='water'?250:240):(food.servingGrams||100));setNote(food.drinkType?'Choose a drink size below. Nutrition is shown per 100 ml; the amount you choose will be logged.':note);};const [meal,setMeal]=useState(initialMeal);const [favorites,setFavorites]=useState<string[]>([]);const [query,setQuery]=useState('');const [results,setResults]=useState<Nutrition[]>(library);const [selected,setSelected]=useState<Nutrition|null>(editing?{name:editing.name,calories:editing.calories/editing.grams*100,protein:editing.protein/editing.grams*100,carbs:editing.carbs/editing.grams*100,fat:editing.fat/editing.grams*100}:initialTab==='Manual'?blank:null);const [grams,setGrams]=useState(editing?.grams||100);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [note,setNote]=useState('');const [custom,setCustom]=useState(false);const [aiOriginalLabel,setAiOriginalLabel]=useState('');const [preview,setPreview]=useState('');const [confirmDelete,setConfirmDelete]=useState(false);
 useEffect(()=>{try{setFavorites(JSON.parse(localStorage.getItem('bloom-favorite-foods')||'[]'));}catch{}},[]);useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 async function search(e?:FormEvent,value=query,barcode=false){e?.preventDefault();if(!value.trim())return;setBusy(true);setError('');try{const r=await api(`/api/foods?q=${encodeURIComponent(value)}&barcode=${barcode}`);setResults(r.foods);setNote(r.note);if(barcode&&r.foods.length){const first=r.foods[0] as Nutrition;selectNutrition(first);}else if(barcode){setTab('Manual');setSelected(blank);setNote(r.note);}}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function scan(file?:File){
if(!file)return;
setBusy(true);
setError('');
setNote('Reading the barcode…');
try{
  if(file.size>10*1024*1024)throw new Error('Please choose a barcode photo under 10 MB.');

  // Normalize camera images first. Some Android cameras return very large or
  // unusual image formats that barcode decoders handle poorly.
  let source:Blob=file;
  try{
    const bitmap=await createImageBitmap(file);
    const max=1600;
    const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');
    if(ctx){
      ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const normalized=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));
      if(normalized)source=normalized;
    }
    bitmap.close();
  }catch{}

  const BrowserBarcodeDetector=(window as unknown as {
    BarcodeDetector?:new(options?:{formats?:string[]})=>{detect:(source:ImageBitmap|HTMLImageElement|Blob)=>Promise<Array<{rawValue?:string}>>}
  }).BarcodeDetector;

  if(BrowserBarcodeDetector){
    try{
      const detector=new BrowserBarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e']});
      const codes=await detector.detect(source);
      const value=codes.find(x=>x.rawValue)?.rawValue;
      if(value){
        setQuery(value);
        await search(undefined,value,true);
        return;
      }
    }catch{}
  }

  // Primary fallback: ZXing. Keep its WASM local/bundled when possible and
  // only use the CDN location as a fallback for browsers that need it.
  try{
    const {readBarcodes,prepareZXingModule}=await import('zxing-wasm/reader');
    prepareZXingModule({
      overrides:{
        locateFile:(path:string,prefix:string)=>
          path.endsWith('.wasm')?prefix+path:path
      }
    });
    const codes=await readBarcodes(source,{
      tryHarder:true,
      formats:['EAN13','EAN8','UPCA','UPCE','DataBar','DataBarOmni','DataBarStk','DataBarLtd','DataBarExp','DataBarExpStk','Code128','ITF'],
      maxNumberOfSymbols:1
    });
    const value=codes.find(x=>x.text)?.text;
    if(value){
      setQuery(value);
      await search(undefined,value,true);
      return;
    }
  }catch{}

  // Older Android fallback. A timeout prevents a failed decode from leaving
  // the Razr stuck on "Reading the barcode…" indefinitely.
  try{
    const {default:Quagga}=await import('@ericblade/quagga2');
    const src=URL.createObjectURL(source);
    try{
      const value=await new Promise<string>((resolve,reject)=>{
        let settled=false;
        const finish=(fn:(value?:any)=>void,value?:any)=>{
           if(settled)return;
           settled=true;
           fn(value);
         };

