import { canAccessProject, getActor } from '@/lib/server/actor';
import { one } from '@/lib/server/db';
import { subscribe } from '@/lib/server/bus';

type Ctx = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';

// SSE: nieuwe comments/replies live inschuiven. De client refetcht bij elk event.
export async function GET(req: Request, { params }: Ctx) {
  const actor = await getActor();
  if (!actor) return new Response('unauthorized', { status: 401 });
  const { id } = await params;
  const versionId = Number(id);
  const version = await one<any>('select project_id from version where id = $1', [versionId]);
  if (!version) return new Response('not found', { status: 404 });
  if (!(await canAccessProject(actor, Number(version.project_id)))) {
    return new Response('forbidden', { status: 403 });
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${event}\n\n`));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = subscribe(versionId, send);
      const ping = setInterval(() => send('ping'), 25_000);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* al gesloten */
        }
      };
      req.signal.addEventListener('abort', cleanup);
      send('hello');
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
