'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase';
import { num, str, todayIso } from '@/lib/util';

const TABLES = ['body_metrics', 'workout_entries', 'health_daily', 'nutrition_log'];
const PHASES = ['bulking', 'cutting', 'maintenance'];
const int = (v) => { const n = num(v); return n === null ? null : Math.round(n); };

function done(anchor) {
  revalidatePath('/health'); revalidatePath('/');
  redirect(`/health${anchor ? `#${anchor}` : ''}`);
}

export async function addBodyMetric(fd) {
  const supabase = await createClient();
  const phase = PHASES.includes(String(fd.get('phase'))) ? String(fd.get('phase')) : null;
  const row = {
    date: str(fd.get('date')) || todayIso(), weight_kg: num(fd.get('weight_kg')), body_fat_pct: num(fd.get('body_fat_pct')),
    muscle_mass_kg: num(fd.get('muscle_mass_kg')), note: str(fd.get('note')), phase,
    source: fd.get('source') === 'inbody' ? 'inbody' : 'scale',
  };
  if (row.weight_kg !== null || row.body_fat_pct !== null || row.muscle_mass_kg !== null) {
    // BMI from the height in your plan
    const { data: plan } = await supabase.from('health_plan').select('height_cm').maybeSingle();
    const h = Number(plan?.height_cm) / 100;
    if (row.weight_kg !== null && h > 0) row.bmi = Math.round((row.weight_kg / (h * h)) * 10) / 10;
    if (row.weight_kg !== null && row.body_fat_pct !== null) row.fat_mass_kg = Math.round(row.weight_kg * row.body_fat_pct) / 100;
    const { error } = await supabase.from('body_metrics').insert(row);
    if (error) throw new Error(error.message);
    // the phase you pick becomes your current phase
    if (phase) await supabase.from('health_plan').upsert({ phase, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  }
  done('body');
}

export async function savePlan(fd) {
  const supabase = await createClient();
  const phase = PHASES.includes(String(fd.get('phase'))) ? String(fd.get('phase')) : null;
  const { error } = await supabase.from('health_plan').upsert({
    phase, height_cm: num(fd.get('height_cm')), kcal_training: int(fd.get('kcal_training')), kcal_rest: int(fd.get('kcal_rest')),
    kcal_off: int(fd.get('kcal_off')), updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
  done('plan');
}

export async function logNutrition(fd) {
  const supabase = await createClient();
  const dayType = ['training', 'rest', 'off'].includes(String(fd.get('day_type'))) ? String(fd.get('day_type')) : 'training';
  const { error } = await supabase.from('nutrition_log').upsert({
    date: str(fd.get('date')) || todayIso(), day_type: dayType, calories: int(fd.get('calories')), note: str(fd.get('note')),
  }, { onConflict: 'user_id,date' });
  if (error) throw new Error(error.message);
  done('nutrition');
}

export async function addWorkouts(fd) {
  const date = str(fd.get('date')) || todayIso();
  const sessionRaw = str(fd.get('session'));
  const session = sessionRaw && sessionRaw !== 'Abs' ? sessionRaw : null;
  const rows = [];
  for (let i = 0; i < 8; i++) {
    const exercise = str(fd.get(`exercise_${i}`));
    if (!exercise) continue;
    const n = Math.max(1, Math.min(10, int(fd.get(`sets_${i}`)) || 1));
    const prior = rows.filter((r) => r.exercise === exercise).length;
    for (let k = 0; k < n; k++) rows.push({ date, session, block: sessionRaw === 'Abs' ? 'abs' : 'main', exercise, set_no: prior + k + 1, sets: 1, reps: int(fd.get(`reps_${i}`)), weight_kg: num(fd.get(`weight_${i}`)), note: str(fd.get(`note_${i}`)) });
  }
  if (rows.length) {
    const supabase = await createClient();
    const { error } = await supabase.from('workout_entries').insert(rows);
    if (error) throw new Error(error.message);
  }
  done('training');
}

export async function addDaily(fd) {
  const row = { date: str(fd.get('date')) || todayIso(), active_kcal: int(fd.get('active_kcal')), sleep_minutes: (() => { const h = num(fd.get('sleep_hours')); return h === null ? null : Math.round(h * 60); })(), resting_hr: int(fd.get('resting_hr')) };
  const supabase = await createClient();
  const { error } = await supabase.from('health_daily').upsert(row, { onConflict: 'user_id,date' });
  if (error) throw new Error(error.message);
  done('daily');
}

export async function removeHealthRow(fd) {
  const table = String(fd.get('table'));
  if (!TABLES.includes(table)) throw new Error('Unknown table');
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq('id', String(fd.get('id')));
  if (error) throw new Error(error.message);
  done(String(fd.get('anchor') || ''));
}

// ---------- Progress photos (front / side / back per date, private storage bucket "progress") ----------
const POSES = ['front', 'side', 'back'];
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

// Called from the upload form after the shrunk photos are in storage; replaces an older photo of the same pose and date
export async function saveProgressPhotos(date, items) {
  if (!isDate(date) || !Array.isArray(items)) throw new Error('Invalid');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const clean = items.filter((i) => POSES.includes(i?.pose) && typeof i?.path === 'string' && i.path.startsWith(`${user.id}/`));
  if (!clean.length) return { ok: false };
  const { data: old } = await supabase.from('progress_photos').select('path,pose').eq('date', date).in('pose', clean.map((i) => i.pose));
  const { error } = await supabase.from('progress_photos').upsert(clean.map((i) => ({ date, pose: i.pose, path: i.path })), { onConflict: 'user_id,date,pose' });
  if (error) throw new Error(error.message);
  const stale = (old || []).map((o) => o.path).filter((p) => !clean.some((i) => i.path === p));
  if (stale.length) await supabase.storage.from('progress').remove(stale);
  revalidatePath('/health');
  return { ok: true };
}

export async function removeProgressSet(fd) {
  const date = String(fd.get('date'));
  if (!isDate(date)) throw new Error('Invalid date');
  const supabase = await createClient();
  const { data: rows } = await supabase.from('progress_photos').select('path').eq('date', date);
  await supabase.from('progress_photos').delete().eq('date', date);
  if (rows?.length) await supabase.storage.from('progress').remove(rows.map((r) => r.path));
  done('progress');
}
