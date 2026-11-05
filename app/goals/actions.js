'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase';
import { num, str } from '@/lib/util';
import { STATUSES } from '@/lib/goals';

function fields(fd) {
  const status = String(fd.get('status') || 'Not Started');
  return {
    name: str(fd.get('name')) || 'Untitled goal',
    goal_text: str(fd.get('goal_text')),
    why: str(fd.get('why')),
    success_looks_like: str(fd.get('success_looks_like')),
    status: STATUSES.includes(status) ? status : 'Not Started',
    deadline: str(fd.get('deadline')),
    current: num(fd.get('current')),
    target: num(fd.get('target')),
    unit: str(fd.get('unit')),
    lower_is_better: fd.get('lower_is_better') === 'on',
    start_value: num(fd.get('start_value')),
    owner: str(fd.get('owner')),
    department: str(fd.get('department')),
  };
}

export async function createGoal(fd) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('goals').insert({ ...fields(fd), type: 'main' }).select('id').single();
  if (error) throw new Error(error.message);
  const steps = [];
  for (let i = 1; i <= 5; i++) {
    const name = str(fd.get(`step_name_${i}`));
    if (name) steps.push({ type: 'step', parent_id: data.id, name, why: str(fd.get(`step_why_${i}`)), deadline: str(fd.get(`step_deadline_${i}`)) });
  }
  if (steps.length) {
    const { error: e2 } = await supabase.from('goals').insert(steps);
    if (e2) throw new Error(e2.message);
  }
  revalidatePath('/goals');
  redirect(`/goals/${data.id}`);
}

export async function updateGoal(fd) {
  const id = String(fd.get('id'));
  const back = String(fd.get('back') || `/goals/${id}`);
  const supabase = await createClient();
  const { error } = await supabase.from('goals').update(fields(fd)).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/goals');
  revalidatePath('/');
  redirect(back);
}

export async function addStep(fd) {
  const parent = String(fd.get('parent_id'));
  const supabase = await createClient();
  const { error } = await supabase.from('goals').insert({ ...fields(fd), type: 'step', parent_id: parent });
  if (error) throw new Error(error.message);
  revalidatePath(`/goals/${parent}`);
  redirect(`/goals/${parent}`);
}

export async function setArchived(fd) {
  const id = String(fd.get('id'));
  const archived = fd.get('archived') === 'true';
  const back = String(fd.get('back') || '/goals');
  const supabase = await createClient();
  const { error } = await supabase.from('goals').update({ archived }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/goals');
  redirect(back);
}
