'use client';

// De gedeelde gastlink: /r/<token>. Met ?preview=1 bekijkt de editor de
// pagina in klant-chrome (geen ← Projects).

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Review from '@/components/Review';

function GuestRoute() {
  const { token } = useParams<{ token: string }>();
  const params = useSearchParams();
  return <Review source={{ kind: 'guest', token }} preview={params.get('preview') === '1'} />;
}

export default function Page() {
  return (
    <Suspense>
      <GuestRoute />
    </Suspense>
  );
}
