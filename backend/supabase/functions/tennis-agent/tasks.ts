/** Prompt + output schema + deterministic mock for each Claude Tennis Agent task. */

const str = { type: 'string' };
const int = (min: number, max: number) => ({ type: 'integer', minimum: min, maximum: max });
const arr = (items: unknown, maxItems = 8) => ({ type: 'array', items, maxItems });
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', properties, required });

// ---- match_analysis -------------------------------------------------------------------------
export interface MatchAnalysis {
  takeaway: string;
  summary: string;
  tactical_adjustments: string[];
}
export const matchAnalysis = {
  task: 'Write the post-match analysis for this player from their exact match statistics. One-line takeaway, a short summary (max 90 words), and 2-4 tactical adjustments for next match. Quote numbers only from the input.',
  schema: obj({ takeaway: str, summary: str, tactical_adjustments: arr(str, 4) }),
  mock(stats: Record<string, unknown>): MatchAnalysis {
    const fs = stats.first_serve_pct ?? '–';
    const ue = stats.unforced_errors ?? '–';
    return {
      takeaway: `First serves landed ${fs}% of the time; tidy up the ${ue} unforced errors to close sets sooner.`,
      summary: `You landed ${fs}% of first serves and made ${ue} unforced errors. Rallies past four shots were where points slipped away.`,
      tactical_adjustments: ['Serve to the body on big points to take time away from the return.', 'Play the higher-margin cross-court ball once a rally passes four shots.'],
    };
  },
};

// ---- playstyle ------------------------------------------------------------------------------
export interface Playstyle {
  equipment: { power: number; control: number; spin: number };
  tactical: { aggressive_baseliner: number; defensive_baseliner: number; all_court: number; serve_and_volley: number };
  primary_style: 'aggressive_baseliner' | 'defensive_baseliner' | 'all_court' | 'serve_and_volley';
  rationale: string;
}
export const playstyle = {
  task: 'Score this player\'s playstyle. "equipment" splits 100 points across power/control/spin based on their primary racket and strings. "tactical" splits 100 points across the four styles based on match stats and swing analyses. Choose the primary style and give a one-sentence rationale.',
  schema: obj({
    equipment: obj({ power: int(0, 100), control: int(0, 100), spin: int(0, 100) }),
    tactical: obj({ aggressive_baseliner: int(0, 100), defensive_baseliner: int(0, 100), all_court: int(0, 100), serve_and_volley: int(0, 100) }),
    primary_style: { type: 'string', enum: ['aggressive_baseliner', 'defensive_baseliner', 'all_court', 'serve_and_volley'] },
    rationale: str,
  }),
  mock(): Playstyle {
    return {
      equipment: { power: 38, control: 34, spin: 28 },
      tactical: { aggressive_baseliner: 30, defensive_baseliner: 18, all_court: 40, serve_and_volley: 12 },
      primary_style: 'all_court',
      rationale: 'Balanced frame and frequent net approaches point to an all-court game.',
    };
  },
};

/** Forces each split to sum to exactly 100 (LLMs drift by a point or two). */
export function normaliseTo100<T extends Record<string, number>>(split: T): T {
  const keys = Object.keys(split) as (keyof T)[];
  const total = keys.reduce((s, k) => s + Math.max(0, Number(split[k]) || 0), 0);
  if (total === 0) return Object.fromEntries(keys.map((k, i) => [k, i === 0 ? 100 : 0])) as T;
  const scaled = keys.map((k) => ({ k, v: (Math.max(0, Number(split[k]) || 0) * 100) / total }));
  const out = scaled.map(({ k, v }) => ({ k, v: Math.floor(v), r: v - Math.floor(v) }));
  let rest = 100 - out.reduce((s, x) => s + x.v, 0);
  for (const x of [...out].sort((a, b) => b.r - a.r)) {
    if (rest-- <= 0) break;
    x.v += 1;
  }
  return Object.fromEntries(out.map(({ k, v }) => [k, v])) as T;
}

// ---- workout --------------------------------------------------------------------------------
export interface WorkoutPlan {
  title: string;
  focus: string;
  intensity: 'low' | 'moderate' | 'high';
  duration_min: number;
  plan: { block: string; exercises: { name: string; sets: number; reps: string; rest_s: number; cue: string }[] }[];
}
export const workout = {
  task: 'Build a tennis workout for this player. Respect the requested duration, focus and equipment. If recovery data shows fatigue (recovery_score < 40 or a big jump in weekly load), lower the intensity and say why in the title or cues. Blocks: warm-up, main, finisher/cool-down.',
  schema: obj({
    title: str,
    focus: str,
    intensity: { type: 'string', enum: ['low', 'moderate', 'high'] },
    duration_min: int(10, 180),
    plan: arr(obj({ block: str, exercises: arr(obj({ name: str, sets: int(1, 10), reps: str, rest_s: int(0, 300), cue: str }), 8) }), 5),
  }),
  mock(p: { focus?: string; duration_min?: number; intensity?: 'low' | 'moderate' | 'high' }): WorkoutPlan {
    const d = p.duration_min ?? 45;
    return {
      title: `${p.focus ?? 'Footwork'} session`,
      focus: p.focus ?? 'footwork',
      intensity: p.intensity ?? 'moderate',
      duration_min: d,
      plan: [
        { block: 'Warm-up', exercises: [{ name: 'Dynamic mobility flow', sets: 1, reps: '6 min', rest_s: 0, cue: 'Hips, ankles, thoracic rotation.' }] },
        { block: 'Main', exercises: [
          { name: 'Split-step reaction drops', sets: 4, reps: '45 s', rest_s: 45, cue: 'Land as the ball is struck.' },
          { name: 'Lateral shuffle to recovery', sets: 4, reps: '6 each side', rest_s: 60, cue: 'Stay low; outside foot loads first.' },
        ] },
        { block: 'Cool-down', exercises: [{ name: 'Hip flexor and calf stretch', sets: 1, reps: '5 min', rest_s: 0, cue: 'Breathe out through the stretch.' }] },
      ],
    };
  },
};

// ---- drills ---------------------------------------------------------------------------------
export interface DrillSet {
  drills: { title: string; description: string; stroke: string; difficulty: number; target: { reps: number; accuracy_pct: number } }[];
}
export const drills = {
  task: 'Create on-court drills that target this player\'s weakest areas, based on their latest match error patterns, swing findings and drill history. Each drill needs a measurable target.',
  schema: obj({
    drills: arr(obj({ title: str, description: str, stroke: str, difficulty: int(1, 5), target: obj({ reps: int(1, 200), accuracy_pct: int(0, 100) }) }), 6),
  }),
  mock(count = 2): DrillSet {
    const all = [
      { title: 'Cross-court backhand ladder', description: 'Ten in a row past the service line, then move the target deeper.', stroke: 'backhand', difficulty: 3, target: { reps: 10, accuracy_pct: 70 } },
      { title: 'Serve + first ball', description: 'Serve wide on the deuce side, forehand into the open court.', stroke: 'serve', difficulty: 2, target: { reps: 20, accuracy_pct: 60 } },
      { title: 'Approach and split', description: 'Short ball approach down the line, split before the volley.', stroke: 'volley', difficulty: 3, target: { reps: 12, accuracy_pct: 65 } },
    ];
    return { drills: all.slice(0, Math.max(1, Math.min(count, all.length))) };
  },
};

// ---- swing_analysis -------------------------------------------------------------------------
export interface SwingInterpretation {
  checkpoints: { key: string; label: string; score: number; status: 'good' | 'work_on'; note: string; frame_ms: number }[];
  summary: string;
  key_finding: string;
  overall_score: number;
  recommended_drill: { title: string; description: string };
}
export const swing = {
  task: 'Interpret these computer-vision pose metrics for one tennis stroke. Score each checkpoint 0-100 (good >= 70), explain what to change in plain coaching language, give the single most important finding, and one drill to fix it. Use the frame_ms values given in the metrics.',
  schema: obj({
    checkpoints: arr(obj({ key: str, label: str, score: int(0, 100), status: { type: 'string', enum: ['good', 'work_on'] }, note: str, frame_ms: int(0, 600000) }), 8),
    summary: str,
    key_finding: str,
    overall_score: int(0, 100),
    recommended_drill: obj({ title: str, description: str }),
  }),
  mock(stroke: string): SwingInterpretation {
    return {
      checkpoints: [
        { key: 'preparation', label: 'Unit turn', score: 82, status: 'good', note: 'Shoulders turn early and fully.', frame_ms: 400 },
        { key: 'contact_point', label: 'Contact point', score: 61, status: 'work_on', note: 'Contact is behind the front hip; meet it earlier.', frame_ms: 900 },
        { key: 'finish', label: 'Finish', score: 77, status: 'good', note: 'Balanced, high finish.', frame_ms: 1300 },
      ],
      summary: `Solid ${stroke} preparation; contact drifts late under pace.`,
      key_finding: 'Contact point is late: meet the ball a racket-head in front of the front hip.',
      overall_score: 73,
      recommended_drill: { title: 'Drop-feed contact drill', description: 'Partner drop-feeds; freeze at contact with the ball in front of the hip.' },
    };
  },
};

// ---- racket_recommendation ------------------------------------------------------------------
export interface RacketPicks {
  picks: { product_id: string; fit_score: number; why: string; string: string; tension_range: string }[];
}
export const racket = {
  task: 'Recommend the best 3 rackets for this player from the catalogue provided (use only the given product_id values). Weigh swing speed, arm comfort needs, skill level and playstyle. Suggest a string and tension range for each.',
  schema: obj({ picks: arr(obj({ product_id: str, fit_score: int(0, 100), why: str, string: str, tension_range: str }), 3) }),
  mock(catalogue: { id: string; profile?: Record<string, number> }[], prefs: { arm_comfort?: boolean }): RacketPicks {
    const scored = catalogue
      .map((p) => ({ p, s: (p.profile?.control ?? 50) + (p.profile?.spin ?? 50) + (prefs.arm_comfort ? 2 * (p.profile?.comfort ?? 50) : 0) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 3);
    return {
      picks: scored.map(({ p }, i) => ({
        product_id: p.id,
        fit_score: 92 - i * 6,
        why: 'Balances control and spin for an all-court game.',
        string: prefs.arm_comfort ? 'Multifilament 16' : 'Co-poly 17',
        tension_range: prefs.arm_comfort ? '50–54 lbs' : '48–52 lbs',
      })),
    };
  },
};

// ---- training_load --------------------------------------------------------------------------
export interface TrainingLoad {
  status: 'fresh' | 'balanced' | 'strained' | 'overreaching';
  headline: string;
  advice: string[];
  suggested_intensity: 'low' | 'moderate' | 'high';
}
export const trainingLoad = {
  task: 'Assess this player\'s training load from their wearable sessions (exact values given). Compare the last 7 days with the previous 21-day average and recent recovery scores. Flag overtraining risk and say how to adjust the next sessions.',
  schema: obj({
    status: { type: 'string', enum: ['fresh', 'balanced', 'strained', 'overreaching'] },
    headline: str,
    advice: arr(str, 4),
    suggested_intensity: { type: 'string', enum: ['low', 'moderate', 'high'] },
  }),
  mock(acuteChronic: number): TrainingLoad {
    const status = acuteChronic > 1.5 ? 'overreaching' : acuteChronic > 1.2 ? 'strained' : acuteChronic < 0.8 ? 'fresh' : 'balanced';
    return {
      status,
      headline: `Acute:chronic load ratio is ${acuteChronic.toFixed(2)}.`,
      advice: status === 'overreaching' || status === 'strained' ? ['Swap the next hard session for technique work.', 'Prioritise sleep for two nights.'] : ['Load is in a healthy range; keep the current plan.'],
      suggested_intensity: status === 'overreaching' ? 'low' : status === 'strained' ? 'moderate' : 'high',
    };
  },
};

/** Acute (last 7 d) : chronic (weekly average over the prior 21 d) load, from session duration x avg HR. */
export function acuteChronicRatio(sessions: { started_at: string; duration_s: number; avg_hr?: number | null }[], now = new Date()): number {
  const day = 86_400_000;
  const load = (s: { duration_s: number; avg_hr?: number | null }) => (s.duration_s / 60) * ((s.avg_hr ?? 120) / 100);
  let acute = 0;
  let chronic = 0;
  for (const s of sessions) {
    const age = (now.getTime() - new Date(s.started_at).getTime()) / day;
    if (age < 0) continue;
    if (age < 7) acute += load(s);
    else if (age < 28) chronic += load(s);
  }
  const chronicWeekly = chronic / 3;
  if (chronicWeekly === 0) return acute > 0 ? 1.5 : 1;
  return acute / chronicWeekly;
}
