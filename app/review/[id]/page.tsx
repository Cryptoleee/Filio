'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import Review from '@/components/Review';

function ReviewRoute() {
  const { id } = useParams<{ id: string }>();
  return <Review source={{ kind: 'editor', projectId: Number(id) }} />;
}

export default function Page() {
  return (
    <Suspense>
      <ReviewRoute />
    </Suspense>
  );
}
