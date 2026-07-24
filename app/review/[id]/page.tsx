'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Review from '@/components/Review';

function ReviewRoute() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  return <Review projectId={id} guest={params.get('as') === 'client'} />;
}

export default function Page() {
  return (
    <Suspense>
      <ReviewRoute />
    </Suspense>
  );
}
