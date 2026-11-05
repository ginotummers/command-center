'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase';
import { num, str, todayIso } from '@/lib/util';

const TABLES = ['body_metrics', 'workout_entries', 'health_daily'];
const int = (v) => { const n = num(v); return n === null ? null : Math.round(n); };

function done(anchor) {
  revalidatePath('/health'); revalidatePath('/');
  redirect(`/health${anchor ? `#${anchor}` : ''}`);
}

export async function addBodyMetric(fd) {
  const row = { date: str(fd.get('date')) || todayIso(), weight_kg: num(fd.get('weight_kg')), body_fat_pct: num(fd.get('body_fat_pct')), muscle_mass_kg: num(fd.get('muscle_mass_kg')), note: str(fd.get('note')) };
  if (row.weight_kg !== null || row.body_fat_pct !== null || row.muscle_mass_kg !== null) {
    const supabase = await createClient();
    const { error } = await supabase.from('body_metrics').insert(row);
    if (error) throw new Error(error.message);
  }
  done('body');
}

export async function addWorkouts(fd) {
  const date = str(fd.get('date')) || todayIso();
  const rows = [];
  for (let i = 0; i < 8; i++) {
    const exercise = str(fd.get(`exercise_${i}`));
    if (exercise) rows.push({ date, exercise, sets: int(fd.get(`sets_${i}`)), reps: int(fd.get(`reps_${i}`)), weight_kg: num(fd.get(`weight_${i}`)), note: str(fd.get(`note_${i}`)) });
  }
  if (rows.length) {
    const supabase = await createClient();
    const { error } = await supabase.from('workout_entries').insert(rows);
    if (error) throw new Error(error.message);
  }
  done('training');
}

export async function addDaily(fd) {
  const row = { date: str(fd.get('date')) || todayIso(), steps: int(fd.get('steps')), active_kcal: int(fd.get('active_kcal')), sleep_minutes: (() => { const h = num(fd.get('sleep_hours')); return h === null ? null : Math.round(h * 60); })(), resting_hr: int(fd.get('resting_hr')) };
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
