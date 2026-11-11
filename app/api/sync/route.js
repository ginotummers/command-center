import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { startSync } from '@/lib/sync';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const supabase = await createClient();
  const body = await request.json().catch(() => ({}));
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  const result = await startSync(supabase, { forceSuggestions: !!body?.suggestions });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

export async function GET(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  let q = supabase.from('sync_runs').select('id,status,requested_at,finished_at,summary').order('requested_at', { ascending: false }).limit(1);
  if (id) q = supabase.from('sync_runs').select('id,status,requested_at,finished_at,summary').eq('id', id).limit(1);
  const { data } = await q;
  return NextResponse.json({ ok: true, run: data?.[0] || null });
}
