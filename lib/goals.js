export const STATUSES = ['Not Started', 'In Progress', 'Achieved', 'Not Achieved', 'Abandoned'];
const STATUS_PROGRESS = { 'Not Started': 0, 'In Progress': 50, Achieved: 100, 'Not Achieved': 0, Abandoned: 0 };

const clamp = (n) => Math.max(0, Math.min(100, n));

export function isNumeric(g) {
  return g.target !== null && g.target !== undefined && g.current !== null && g.current !== undefined;
}

export function progress(g) {
  if (isNumeric(g)) {
    const current = Number(g.current);
    const target = Number(g.target);
    if (g.lower_is_better) {
      const start = Number(g.start_value);
      if (g.start_value === null || g.start_value === undefined || !(start > target)) return 0;
      return Math.round(clamp(((start - current) / (start - target)) * 100));
    }
    if (target === 0) return 0;
    return Math.round(clamp((current / target) * 100));
  }
  return STATUS_PROGRESS[g.status] ?? 0;
}

const VAGUE = ['more', 'better', 'less', 'lean', 'leaner', 'healthier', 'improve', 'improved', 'grow', 'bigger', 'fitter', 'stronger', 'happier', 'some', 'a lot'];

// Non-blocking measurability hints (rule-based, per Foundation OS brief: no AI)
export function measurabilityHints(g) {
  const hints = [];
  const text = `${g.name || ''} ${g.goal_text || ''}`.toLowerCase();
  const words = VAGUE.filter((w) => new RegExp(`\\b${w}\\b`).test(text));
  if (!isNumeric(g) && !g.unit) hints.push('No current value, target and unit yet, so progress can only follow the status.');
  if (!g.deadline) hints.push('No deadline set.');
  if (words.length) hints.push(`Vague wording ("${words.join('", "')}"). Say the exact outcome, e.g. "Reach 5% body fat and 80 kg by 31 March".`);
  if (g.lower_is_better && (g.start_value === null || g.start_value === undefined)) hints.push('Lower is better needs a start value to measure progress.');
  return hints;
}
