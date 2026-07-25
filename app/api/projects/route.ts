import { NextResponse } from 'next/server';
import { getEditor } from '@/lib/server/auth';
import { one } from '@/lib/server/db';
import { dashboardPayload } from '@/lib/server/payload';

export async function GET() {
  const editor = await getEditor();
  if (!editor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(await dashboardPayload(editor.name));
}

export async function POST(req: Request) {
  const editor = await getEditor();
  if (!editor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { title } = await req.json().catch(() => ({}));
  if (!title?.trim()) {
    return NextResponse.json({ error: 'titel verplicht' }, { status: 400 });
  }
  const row = await one<{ id: string }>(
    'insert into project (title) values ($1) returning id',
    [title.trim()]
  );
  return NextResponse.json({ id: Number(row!.id) }, { status: 201 });
}
