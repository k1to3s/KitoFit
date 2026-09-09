import type { Metadata,Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './contrast.css';
export const metadata:Metadata={title:'Bloom — A little better, every day',description:'Your healthy space. Track meals, movement, hydration, and daily essentials at your own pace.',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,statusBarStyle:'default',title:'Bloom'},icons:{icon:'/icon.svg',apple:'/icons/apple-touch-icon.png'}};
export const dynamic='force-dynamic';
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#f7f8f5'};
export default function RootLayout({children}:{children:ReactNode}){return <html lang="en"><body>{children}</body></html>;}
