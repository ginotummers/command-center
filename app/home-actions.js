'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase';
import { todayIso, addDays } from '@/lib/util';

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
