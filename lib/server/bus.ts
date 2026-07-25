// In-process SSE-bus: nieuwe comments/replies live naar open reviewpagina's.
// Eén web-proces op de NAS, dus geen externe pub/sub nodig.

type Listener = (event: string) => void;

const globalForBus = globalThis as unknown as {
  __filioBus?: Map<number, Set<Listener>>;
};

const channels = globalForBus.__filioBus ?? new Map<number, Set<Listener>>();
if (!globalForBus.__filioBus) globalForBus.__filioBus = channels;

export function subscribe(versionId: number, listener: Listener): () => void {
  let set = channels.get(versionId);
  if (!set) {
    set = new Set();
    channels.set(versionId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) channels.delete(versionId);
  };
}

export function publish(versionId: number, event: string) {
  channels.get(versionId)?.forEach((l) => {
    try {
      l(event);
    } catch {
      /* listener al weg */
    }
  });
}
