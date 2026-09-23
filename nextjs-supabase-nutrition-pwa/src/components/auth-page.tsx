'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { AuthDialog } from './dialogs';

export default function AuthPage(){
  const router=useRouter();
  const searchParams=useSearchParams();
  const next=searchParams.get('next')?.startsWith('/') ? searchParams.get('next')! : '/';

  return (
    <main style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:'24px'}}>
      <AuthDialog
        notify={()=>{}}
        close={()=>router.replace(next)}
      />
    </main>
  );
}
