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

// ---- Vision Board canvas ----
const BOARD_W = 1600, BOARD_H = 1000;
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };

async function signed(supabase, rows) {
  if (!rows.length) return [];
  const { data } = await supabase.storage.from('wish').createSignedUrls(rows.map((r) => r.image_path), 3600);
  const map = Object.fromEntries((data || []).map((d) => [d.path, d.signedUrl]));
  return rows.map((r) => ({ id: r.id, url: map[r.image_path], x: r.x, y: r.y, w: r.w, rot: r.rot, z: r.z, is_chief: r.is_chief, title: r.title }));
}

// New photos are placed in a ring around the title, slightly tilted like pinned prints
export async function addVisionImages(paths, existing = 0) {
  const { supabase, user } = await client();
  const list = (paths || []).filter((p) => typeof p === 'string' && p.startsWith(`${user.id}/`)).slice(0, 30);
  if (!list.length) return [];
  const { data: top } = await supabase.from('vision_items').select('z').order('z', { ascending: false }).limit(1);
  let z = (top?.[0]?.z ?? 0) + 1;
  const rows = list.map((image_path, i) => {
    const k = Number(existing) + i;
    const a = (k * 2 * Math.PI) / 8 + (Math.floor(k / 8) * Math.PI) / 8 - Math.PI / 2;
    const w = 230;
    const rx = 540 - (Math.floor(k / 8) % 3) * 120, ry = 270 - (Math.floor(k / 8) % 3) * 60;
    return {
      image_path, w, z: z++, position: k,
      x: Math.round(BOARD_W / 2 + rx * Math.cos(a) - w / 2),
      y: Math.round(BOARD_H / 2 + ry * Math.sin(a) - w * 0.5),
      rot: Math.round((Math.random() * 8 - 4) * 10) / 10,
    };
  });
  const { data, error } = await supabase.from('vision_items').insert(rows).select('*');
  if (error) throw new Error(error.message);
  revalidatePath('/wish');
  return signed(supabase, data || []);
}

export async function updateVisionItem(id, p) {
  const { supabase } = await client();
  const values = {};
  if (p.x !== undefined) values.x = num(p.x, -400, BOARD_W);
  if (p.y !== undefined) values.y = num(p.y, -400, BOARD_H);
  if (p.w !== undefined) values.w = num(p.w, 60, 1000);
  if (p.rot !== undefined) values.rot = num(p.rot, -360, 360);
  if (p.z !== undefined) values.z = Math.round(num(p.z, -100000, 100000) ?? 0);
  if (p.is_chief !== undefined) {
    values.is_chief = !!p.is_chief;
    if (values.is_chief) await supabase.from('vision_items').update({ is_chief: false }).eq('is_chief', true).neq('id', id);
  }
  Object.keys(values).forEach((k) => values[k] === null && delete values[k]);
  if (!Object.keys(values).length) return { ok: true };
  const { error } = await supabase.from('vision_items').update(values).eq('id', id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function removeVisionItem(id) {
  const { supabase } = await client();
  const { data } = await supabase.from('vision_items').select('image_path').eq('id', id).single();
  const { error } = await supabase.from('vision_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await removeFiles(supabase, [data?.image_path]);
  revalidatePath('/wish');
  return { ok: true };
}

export async function saveBoardTitle(t) {
  const { supabase } = await client();
  await upsertSettings(supabase, {
    board_title: String(t?.text || 'Vision Board').slice(0, 80),
    board_title_x: num(t?.x, 0, BOARD_W) ?? 800,
    board_title_y: num(t?.y, 0, BOARD_H) ?? 500,
  });
  return { ok: true };
}
