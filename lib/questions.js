// Foundation OS Module 05 — Review & Improve. Edit questions here; ids keep answers comparable.
export const SECTIONS = [
  {
    id: 'performance',
    title: 'Performance Review',
    purpose: 'Evaluate actual results, progress and performance.',
    groups: [
      { id: 'metrics', title: 'Metrics & Data', kpis: true, questions: [
        ['m1', 'What were my most important performance metrics for this period?'],
        ['m2', 'What were the actual results compared to my targets?'],
        ['m3', 'Which metrics improved or declined compared to the previous period?'],
      ] },
      { id: 'goals', title: 'Goals & Progress', questions: [
        ['g1', 'What progress did I make toward my goals?'],
        ['g2', 'Which goals or milestones did I achieve?'],
        ['g3', 'Where did I fall behind, and why?'],
        ['g4', 'What were my biggest wins during this period?'],
      ] },
      { id: 'pactions', title: 'Performance Actions', questions: [
        ['p1', 'What contributed most to my results?'],
        ['p2', 'What limited my performance?'],
        ['p3', 'What should I continue, stop, or change to improve my results?'],
      ] },
    ],
  },
  {
    id: 'operator',
    title: 'Operator Review',
    purpose: 'Evaluate how effectively and intentionally I operated.',
    groups: [
      { id: 'time', title: 'Time — Control Your Time', questions: [
        ['t1', 'Did I use my time intentionally?'],
        ['t2', 'Did my schedule reflect my priorities?'],
        ['t3', 'Where did I waste time or lose control of my schedule?'],
        ['t4', 'What should I improve about how I manage my time?'],
      ] },
      { id: 'work', title: 'Work — Control Your Work', questions: [
        ['w1', 'Did I consistently prioritize the most important work?'],
        ['w2', 'Did I execute on my planned priorities?'],
        ['w3', 'What caused distractions, delays, or unnecessary workload?'],
        ['w4', 'What can I improve in how I capture, prioritize, delegate, schedule, or execute work?'],
      ] },
      { id: 'showup', title: 'Show Up — Show Up Intentionally', questions: [
        ['s1', 'Did I show up intentionally in my meetings, responsibilities, and interactions?'],
        ['s2', 'Was I clear about my role and desired outcomes?'],
        ['s3', 'Did I follow through on my commitments?'],
        ['s4', 'Where could I have shown up more effectively?'],
      ] },
      { id: 'overall', title: 'Overall Reflection', questions: [
        ['o1', 'What worked particularly well?'],
        ['o2', 'What did not work well?'],
        ['o3', 'What were my biggest lessons?'],
        ['o4', 'What patterns or recurring problems did I notice?'],
        ['o5', 'What am I most satisfied with?'],
        ['o6', 'What would I do differently?'],
      ] },
      { id: 'improve', title: 'Improvement Actions', actions: true, questions: [
        ['i1', 'What are the most important improvements I need to make?'],
        ['i2', 'What specific actions will I take next period?'],
        ['i3', 'What should I continue doing?'],
        ['i4', 'What should I stop doing?'],
        ['i5', 'What should I start doing?'],
      ] },
    ],
  },
];

export const MONTHLY_EXTRA = {
  id: 'monthly',
  title: 'The Month as a Whole',
  questions: [
    ['x1', 'What were my most significant achievements this month?'],
    ['x2', 'Am I moving in the right direction toward my bigger goals?'],
    ['x3', 'What recurring patterns did I notice across the month?'],
    ['x4', 'Which improvements from previous weekly reflections actually worked?'],
    ['x5', 'What larger adjustments should I make next month?'],
    ['x6', 'What are my most important priorities for the upcoming month?'],
  ],
};

export function sectionsFor(type) {
  if (type !== 'monthly') return SECTIONS;
  return [...SECTIONS, { id: 'month', title: 'Monthly Review', purpose: 'Step back and look at the bigger picture.', groups: [MONTHLY_EXTRA] }];
}

export function allQuestionIds(type) {
  return sectionsFor(type).flatMap((s) => s.groups.flatMap((g) => g.questions.map((q) => q[0])));
}
