// Starts the "Sync Personal Operating Center" Claude routine for one sync run.
// Needs ROUTINE_FIRE_URL and ROUTINE_FIRE_TOKEN (from claude.ai/code/routines → API trigger).
export async function startSync(supabase) {
  const url = process.env.ROUTINE_FIRE_URL;
  const token = process.env.ROUTINE_FIRE_TOKEN;
  if (!url || !token) return { ok: false, error: 'Sync is not connected yet: the routine token is missing.' };

  // Don't start a second run while one is in progress (runs take a few minutes)
  const { data: recent } = await supabase.from('sync_runs').select('id,status,requested_at')
    .in('status', ['requested', 'running']).gte('requested_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order('requested_at', { ascending: false }).limit(1);
  if (recent?.length) return { ok: true, id: recent[0].id, already: true };

  const { data: run, error } = await supabase.from('sync_runs').insert({}).select('id').single();
  if (error) return { ok: false, error: error.message };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'anthropic-version': '2026-10-21', 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `sync_run_id: ${run.id}` }),
      cache: 'no-store',
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body?.error?.message || `Routine returned ${res.status}`;
      await supabase.from('sync_runs').update({ status: 'failed', summary: msg, finished_at: new Date().toISOString() }).eq('id', run.id);
      return { ok: false, error: msg };
    }
    await supabase.from('sync_runs').update({ session_url: body.claude_code_session_url || null }).eq('id', run.id);
    return { ok: true, id: run.id };
  } catch (e) {
    await supabase.from('sync_runs').update({ status: 'failed', summary: String(e?.message || e), finished_at: new Date().toISOString() }).eq('id', run.id);
    return { ok: false, error: 'Could not reach the sync routine.' };
  }
}
