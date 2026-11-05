'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase';
import { num, str, todayIso, todayParts, weekStart, addDays, isoWeek, iso, shiftMonth, lastDayOfMonth } from '@/lib/util';
import { allQuestionIds } from '@/lib/questions';

const ACTION_STATUSES = ['Not Started', 'In Progress', 'Completed'];

function periodMeta(type, start) {
  const [y, m] = start.split('-').map(Number);
  return type === 'weekly' ? { week_number: isoWeek(start), month: m, year: y } : { week_number: null, month: m, year: y };
}

export async function newReflection(fd) {
  const type = fd.get('type') === 'monthly' ? 'monthly' : 'weekly';
  const today = todayIso();
  let start; let end;
  if (type === 'weekly') {
    const ws = weekStart(today);
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() || 7);
    start = dow <= 3 ? addDays(ws, -7) : ws; // Mon–Wed: review last week
    end = addDays(start, 6);
  } else {
    const { y, m, d } = todayParts();
    const thisMonth = iso(y, m, 1);
    start = d <= 10 ? shiftMonth(thisMonth, -1) : thisMonth;
    end = lastDayOfMonth(start);
  }
  const supabase = await createClient();
  const { data: existing } = await supabase.from('reflections').select('id').eq('type', type).eq('period_start', start).maybeSingle();
  if (existing) redirect(`/reflections/${existing.id}`);
  const { data, error } = await supabase.from('reflections').insert({ type, period_start: start, period_end: end, ...periodMeta(type, start) }).select('id').single();
  if (error) throw new Error(error.message);
  revalidatePath('/reflections');
  redirect(`/reflections/${data.id}`);
}

export async function saveReflection(fd) {
  const id = String(fd.get('id'));
  const submit = fd.get('intent') === 'submit';
  const supabase = await createClient();
  const { data: r } = await supabase.from('reflections').select('*').eq('id', id).single();
  if (!r) throw new Error('Reflection not found');

  const answers = {};
  for (const q of allQuestionIds(r.type)) {
    const v = str(fd.get(`q_${q}`));
    if (v) answers[q] = v;
  }
  const start = str(fd.get('period_start')) || r.period_start;
  const end = str(fd.get('period_end')) || r.period_end;
  const update = {
    answers, period_start: start, period_end: end, ...periodMeta(r.type, start), updated_at: new Date().toISOString(),
  };
  if (submit) { update.status = 'submitted'; update.completed_at = r.completed_at || new Date().toISOString(); }
  const { error } = await supabase.from('reflections').update(update).eq('id', id);
  if (error) throw new Error(error.message);

  // KPIs
  const metrics = [];
  for (let i = 0; i < 12; i++) {
    const metric = str(fd.get(`metric_${i}`));
    if (metric) metrics.push({ reflection_id: id, metric, target: num(fd.get(`target_${i}`)), actual: num(fd.get(`actual_${i}`)), note: str(fd.get(`mnote_${i}`)), position: i });
  }
  await supabase.from('reflection_metrics').delete().eq('reflection_id', id);
  if (metrics.length) await supabase.from('reflection_metrics').insert(metrics);

  // Improvement actions of this reflection
  const actions = [];
  for (let i = 0; i < 12; i++) {
    const description = str(fd.get(`action_${i}`));
    if (description) {
      const status = String(fd.get(`astatus_${i}`) || 'Not Started');
      actions.push({ reflection_id: id, description, target_date: str(fd.get(`adate_${i}`)), status: ACTION_STATUSES.includes(status) ? status : 'Not Started', created_at: str(fd.get(`acreated_${i}`)) || new Date().toISOString() });
    }
  }
  await supabase.from('improvement_actions').delete().eq('reflection_id', id);
  if (actions.length) await supabase.from('improvement_actions').insert(actions);

  // Follow-through on the previous period's actions
  for (const [key, value] of fd.entries()) {
    if (key.startsWith('prev_') && ACTION_STATUSES.includes(String(value))) {
      await supabase.from('improvement_actions').update({ status: String(value) }).eq('id', key.slice(5));
    }
  }

  revalidatePath('/reflections');
  revalidatePath('/');
  redirect(submit ? '/reflections?saved=1' : `/reflections/${id}?saved=1`);
}
