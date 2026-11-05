'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase';
import { str, num, todayIso, addDays } from '@/lib/util';
import { startSync } from '@/lib/sync';

export async function queueItem(fd) {
  const kind = fd.get('kind') === 'calendar_event' ? 'calendar_event' : 'akiflow_task';
  const title = str(fd.get('title'));
  if (!title) redirect('/');
  const supabase = await createClient();
  const { error } = await supabase.from('pending_actions').insert({
    kind, title, date: str(fd.get('date')) || todayIso(), start_time: str(fd.get('start_time')),
    duration_min: num(fd.get('duration_min')) ?? 30, notes: str(fd.get('notes')),
  });
  if (error) throw new Error(error.message);
  await startSync(supabase);
  revalidatePath('/');
  redirect('/?queued=1');
}

export async function setFocus(fd) {
  const id = String(fd.get('id'));
  const action = String(fd.get('action'));
  const supabase = await createClient();
  const update = action === 'snooze' ? { status: 'snoozed', snooze_until: addDays(todayIso(), 1) } : { status: 'done' };
  const { error } = await supabase.from('focus_items').update(update).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/');
  redirect('/');
}
