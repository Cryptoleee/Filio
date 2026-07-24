'use client';

// The shared guest link: /r/<token>. In the real app the token is resolved
// server-side (share_link table); the prototype matches it against seed data.

import { useParams } from 'next/navigation';
import Review from '@/components/Review';
import { useAppState } from '@/lib/store';

export default function Page() {
  const { token } = useParams<{ token: string }>();
  const app = useAppState();
  const project = app.projects.find((p) => p.shareToken === token) ?? app.projects[0];
  return <Review projectId={project.id} guest />;
}
