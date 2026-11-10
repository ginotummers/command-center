'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase';
import { str } from '@/lib/util';
import { DAILY, WEEKLY, dubaiNow, periods } from '@/lib/wish';

const DAILY_IDS = new Set(DAILY.map((i) => i.id));
const WEEKLY_IDS = new Set(WEEKLY.map((i) => i.id));
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s));

async function client() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  return { supabase, user };
}

// Tick or untick one practice for a day or week. History is kept per period, so a new
// day/week simply starts with an empty checklist; nothing is ever deleted on reset.
export async function toggleCheck(periodType, periodStart, itemId, checked) {
  if (!['day', 'week'].includes(periodType) || !isDate(periodStart)) throw new Error('Bad period');
  if (!(periodType === 'day' ? DAILY_IDS : WEEKLY_IDS).has(itemId)) throw new Error('Unknown practice');
  const { supabase } = await client();
  if (checked) {
    const { error } = await supabase.from('wish_checks').upsert({ period_type: periodType, period_start: periodStart, item_id: itemId }, { onConflict: 'user_id,period_type,period_start,item_id', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('wish_checks').delete().match({ period_type: periodType, period_start: periodStart, item_id: itemId });
    if (error) throw new Error(error.message);
  }
  return { ok: true };
}

async function upsertSettings(supabase, values) {
  const { error } = await supabase.from('wish_settings').upsert({ ...values, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}

export async function saveChiefAim(fd) {
  const { supabase } = await client();
  const values = { chief_aim: str(fd.get('chief_aim')), chief_why: str(fd.get('chief_why')), chief_feeling: str(fd.get('chief_feeling')) };
  const img = str(fd.get('image_path'));
  if (img !== null) values.chief_image_path = img;
  if (fd.get('remove_image') === 'on') values.chief_image_path = null;
  await upsertSettings(supabase, values);
  revalidatePath('/wish'); revalidatePath('/');
  redirect('/wish?saved=aim');
}

const hhmm = (v, fallback) => (/^\d{2}:\d{2}$/.test(String(v)) ? String(v) : fallback);

export async function saveSettings(fd) {
  const { supabase } = await client();
  await upsertSettings(supabase, {
    reminders_enabled: fd.get('reminders_enabled') === 'on',
    morning_start: hhmm(fd.get('morning_start'), '05:00'), morning_end: hhmm(fd.get('morning_end'), '12:00'),
    evening_start: hhmm(fd.get('evening_start'), '18:00'), evening_end: hhmm(fd.get('evening_end'), '23:59'),
    weekly_day: Math.min(6, Math.max(0, Number(fd.get('weekly_day')) || 0)),
  });
  revalidatePath('/wish'); revalidatePath('/');
  redirect('/wish?tab=overview&saved=settings#reminders');
}

export async function savePdfPage(page) {
  const n = Math.max(1, Math.floor(Number(page) || 1));
  const { supabase } = await client();
  await upsertSettings(supabase, { last_pdf_page: n });
  return { ok: true };
}

// Reminder pop-up: 'opened' and 'dismissed' close it for the rest of the period, 'snoozed' for an hour
export async function handleReminder(kind, action) {
  if (!['morning', 'evening', 'weekly'].includes(kind) || !['opened', 'dismissed', 'snoozed'].includes(action)) throw new Error('Bad reminder');
  const { supabase } = await client();
  const p = periods(dubaiNow().date);
  const row = { kind, period_start: kind === 'weekly' ? p.week : p.day, action, snooze_until: action === 'snoozed' ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('wish_reminders').upsert(row, { onConflict: 'user_id,kind,period_start' });
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function removeFiles(supabase, paths) {
  const list = paths.filter(Boolean);
  if (list.length) await supabase.storage.from('wish').remove(list);
}

export async function saveDream(fd) {
  const { supabase } = await client();
  const id = str(fd.get('id'));
  const body = str(fd.get('body'));
  if (!body) redirect(`/wish?tab=dreams${id ? `&edit=${id}` : ''}&error=empty#dreambook`);
  const values = { entry_date: isDate(fd.get('entry_date')) ? fd.get('entry_date') : dubaiNow().date, title: str(fd.get('title')), body, updated_at: new Date().toISOString() };
  const img = str(fd.get('image_path'));
  let oldImage = null;
  if (id) {
    const { data } = await supabase.from('dream_entries').select('image_path').eq('id', id).single();
    oldImage = data?.image_path || null;
  }
  if (img) values.image_path = img;
  if (fd.get('remove_image') === 'on') values.image_path = null;
  const { error } = id ? await supabase.from('dream_entries').update(values).eq('id', id) : await supabase.from('dream_entries').insert(values);
  if (error) throw new Error(error.message);
  if (oldImage && (img || fd.get('remove_image') === 'on') && oldImage !== img) await removeFiles(supabase, [oldImage]);
  revalidatePath('/wish');
  redirect('/wish?tab=dreams&saved=dream#dreambook');
}

export async function deleteDream(fd) {
  const { supabase } = await client();
  const id = String(fd.get('id'));
  const { data } = await supabase.from('dream_entries').select('image_path').eq('id', id).single();
  const { error } = await supabase.from('dream_entries').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await removeFiles(supabase, [data?.image_path]);
  revalidatePath('/wish');
  redirect('/wish?tab=dreams#dreambook');
}

export async function saveVision(fd) {
  const { supabase } = await client();
  const id = str(fd.get('id'));
  const isChief = fd.get('is_chief') === 'on';
  const values = { title: str(fd.get('title')), description: str(fd.get('description')), is_chief: isChief };
  const img = str(fd.get('image_path'));
  if (isChief) await supabase.from('vision_items').update({ is_chief: false }).eq('is_chief', true);
  if (id) {
    const { data: old } = await supabase.from('vision_items').select('image_path').eq('id', id).single();
    if (img) values.image_path = img;
    const { error } = await supabase.from('vision_items').update(values).eq('id', id);
    if (error) throw new Error(error.message);
    if (img && old?.image_path && old.image_path !== img) await removeFiles(supabase, [old.image_path]);
  } else {
    if (!img) redirect('/wish?tab=dreams&error=image#board');
    const { data: last } = await supabase.from('vision_items').select('position').order('position', { ascending: false }).limit(1);
    const { error } = await supabase.from('vision_items').insert({ ...values, image_path: img, position: (last?.[0]?.position ?? -1) + 1 });
    if (error) throw new Error(error.message);
  }
  revalidatePath('/wish'); revalidatePath('/');
  redirect('/wish?tab=dreams&saved=vision#board');
}

export async function deleteVision(fd) {
  const { supabase } = await client();
  const id = String(fd.get('id'));
  const { data } = await supabase.from('vision_items').select('image_path').eq('id', id).single();
  const { error } = await supabase.from('vision_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await removeFiles(supabase, [data?.image_path]);
  revalidatePath('/wish');
  redirect('/wish?tab=dreams#board');
}

// Swap an image with its neighbour to reorder the board
export async function moveVision(fd) {
  const { supabase } = await client();
  const id = String(fd.get('id'));
  const dir = fd.get('dir') === 'left' ? -1 : 1;
  const { data: items } = await supabase.from('vision_items').select('id,position').order('position').order('created_at');
  const list = items || [];
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i >= 0 && j >= 0 && j < list.length) {
    // normalise positions to the current order, then swap the two
    const order = list.map((x) => x.id);
    [order[i], order[j]] = [order[j], order[i]];
    await Promise.all(order.map((vid, pos) => supabase.from('vision_items').update({ position: pos }).eq('id', vid)));
  }
  revalidatePath('/wish');
  redirect('/wish?tab=dreams#board');
}
