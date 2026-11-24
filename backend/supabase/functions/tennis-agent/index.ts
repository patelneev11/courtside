import type { SupabaseClient } from '@supabase/supabase-js';
import { callClaude } from '../_shared/claude.ts';
import { adminClient, HttpError, json, readJson, requireUser, serve } from '../_shared/http.ts';
import { AgentJob } from '../_shared/jobs.ts';
import { extractPoseMetrics } from './cv.ts';
import * as T from './tasks.ts';

type Kind = 'match_analysis' | 'playstyle' | 'workout' | 'drills' | 'swing_analysis' | 'racket_recommendation' | 'training_load' | 'coach_chat';
// deno-lint-ignore no-explicit-any
type Body = { kind: Kind; player_id?: string } & Record<string, any>;

const STEPS: Record<Kind, { key: string; label: string }[]> = {
  match_analysis: [{ key: 'stats', label: 'Reading match stats' }, { key: 'claude', label: 'Writing the analysis' }, { key: 'save', label: 'Saving' }],
  playstyle: [{ key: 'gather', label: 'Gathering matches, gear and swings' }, { key: 'claude', label: 'Scoring playstyle' }, { key: 'save', label: 'Saving' }],
  workout: [{ key: 'gather', label: 'Checking recovery and goals' }, { key: 'claude', label: 'Building the workout' }, { key: 'save', label: 'Saving' }],
  drills: [{ key: 'gather', label: 'Finding weak spots' }, { key: 'claude', label: 'Designing drills' }, { key: 'save', label: 'Adding to your tracker' }],
  swing_analysis: [{ key: 'cv', label: 'Tracking body pose' }, { key: 'claude', label: 'Reviewing checkpoints' }, { key: 'save', label: 'Saving findings' }],
  racket_recommendation: [{ key: 'gather', label: 'Reading your game' }, { key: 'claude', label: 'Matching rackets' }, { key: 'save', label: 'Saving picks' }],
  training_load: [{ key: 'gather', label: 'Syncing wearable sessions' }, { key: 'claude', label: 'Assessing load' }, { key: 'save', label: 'Saving' }],
  coach_chat: [{ key: 'gather', label: 'Reading your recent game' }, { key: 'claude', label: 'Thinking' }],
};

// POST /tennis-agent { kind, ...params } -> 202 { job_id }. Progress streams via Realtime on agent_jobs.
serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const { user, db } = await requireUser(req);
  const body = await readJson<Body>(req);
  if (!(body.kind in STEPS)) throw new HttpError(400, `kind must be one of ${Object.keys(STEPS).join(', ')}`);

  // Coaches may run analyses for linked students (RLS on the reads below enforces access).
  const playerId = body.player_id ?? user.id;
  if (playerId !== user.id) {
    const { data: ok } = await db.rpc('can_view_player', { player: playerId });
    if (!ok) throw new HttpError(403, 'not your student');
  }

  const admin = adminClient();
  const job = await AgentJob.create(admin, user.id, body.kind, body, STEPS[body.kind]);
  const run = RUNNERS[body.kind];
  // Validate synchronously what we can (404s etc.), then run the rest in the background.
  const ctx = { db, admin, job, playerId, userId: user.id, body };
  const work = await run(ctx).catch(async (e) => {
    await job.fail(e);
    throw e;
  });
  if (body.wait) {
    await work().catch((e) => job.fail(e));
    const { data } = await admin.from('agent_jobs').select('*').eq('id', job.id).single();
    return json(data, 200);
  }
  job.runInBackground(work);
  return json({ job_id: job.id, status: 'queued' }, 202);
});

interface Ctx {
  db: SupabaseClient;
  admin: SupabaseClient;
  job: AgentJob;
  playerId: string;
  userId: string;
  body: Body;
}
type Runner = (c: Ctx) => Promise<() => Promise<void>>;

function must<T>(r: { data: T; error: unknown }, what: string): NonNullable<T> {
  if (r.error || r.data == null) throw new HttpError(404, `${what} not found`);
  return r.data as NonNullable<T>;
}

const RUNNERS: Record<Kind, Runner> = {
  async match_analysis({ db, admin, job, body }) {
    if (!body.match_id) throw new HttpError(400, 'match_id required');
    must(await db.from('matches').select('id').eq('id', body.match_id).single(), 'match');
    return async () => {
      await job.step('stats');
      // Recompute exact numbers from logged points first, so Claude only sees real data.
      const { count } = await admin.from('match_points').select('id', { count: 'exact', head: true }).eq('match_id', body.match_id);
      if (count) await admin.rpc('compute_match_stats', { p_match: body.match_id });
      const m = must(await admin.from('matches').select('*').eq('id', body.match_id).single(), 'match');
      await job.step('claude');
      const input = { score: m.score, result: m.result, surface: m.surface, stats: m.stats, serve_zones: m.serve_zones, rally_lengths: m.rally_lengths, error_patterns: m.error_patterns };
      const r = await callClaude({ task: T.matchAnalysis.task, input, schema: T.matchAnalysis.schema, mock: () => T.matchAnalysis.mock(m.stats) });
      await job.step('save');
      await admin.from('matches').update({
        ai_summary: r.output.summary, ai_takeaway: r.output.takeaway, tactical_adjustments: r.output.tactical_adjustments, analysed_at: new Date().toISOString(),
      }).eq('id', m.id);
      await job.succeed(r.output, r);
    };
  },

  async playstyle({ db, admin, job, playerId }) {
    return async () => {
      await job.step('gather');
      const [matches, gear, swings] = await Promise.all([
        db.from('matches').select('stats, serve_zones, rally_lengths, error_patterns, surface').eq('player_id', playerId).order('played_at', { ascending: false }).limit(5),
        db.from('wardrobe_items').select('brand, model, head_size_sq_in, weight_g, string_name, tension_main_lbs').eq('player_id', playerId).eq('kind', 'racket').eq('primary_item', true),
        db.from('swing_analyses').select('stroke, overall_score, key_finding').eq('player_id', playerId).eq('status', 'succeeded').limit(5),
      ]);
      await job.step('claude');
      const r = await callClaude({ task: T.playstyle.task, input: { matches: matches.data, racket: gear.data, swings: swings.data }, schema: T.playstyle.schema, mock: T.playstyle.mock });
      const out = { ...r.output, equipment: T.normaliseTo100(r.output.equipment), tactical: T.normaliseTo100(r.output.tactical) };
      await job.step('save');
      await admin.from('playstyle_snapshots').insert({ player_id: playerId, ...out });
      await admin.from('profiles').update({ primary_playstyle: out.primary_style }).eq('id', playerId);
      await job.succeed(out, r);
    };
  },

  async workout({ db, admin, job, playerId, userId, body }) {
    return async () => {
      await job.step('gather');
      const since = new Date(Date.now() - 28 * 86_400_000).toISOString();
      const { data: sessions } = await db.from('wearable_sessions').select('started_at, duration_s, avg_hr, recovery_score').eq('player_id', playerId).gte('started_at', since);
      const ratio = T.acuteChronicRatio(sessions ?? []);
      const params = { focus: body.focus, duration_min: body.duration_min, intensity: body.intensity, equipment: body.equipment, location: body.location };
      const latestRecovery = (sessions ?? []).map((s) => s.recovery_score).filter((v) => v != null).at(-1) ?? null;
      await job.step('claude');
      const r = await callClaude({
        task: T.workout.task, input: { params, acute_chronic_ratio: Number(ratio.toFixed(2)), recovery_score: latestRecovery },
        schema: T.workout.schema, mock: () => T.workout.mock(params),
      });
      await job.step('save');
      const { data } = await admin.from('workouts').insert({
        player_id: playerId, created_by: userId, source: playerId === userId ? 'ai' : 'coach', params, title: r.output.title, focus: r.output.focus,
        plan: r.output.plan, duration_min: r.output.duration_min, intensity: r.output.intensity, scheduled_for: body.scheduled_for ?? null,
      }).select('id').single();
      await job.succeed({ workout_id: data?.id, ...r.output }, r);
    };
  },

  async drills({ db, admin, job, playerId, userId, body }) {
    const count = Math.min(Math.max(Number(body.count) || 2, 1), 6);
    return async () => {
      await job.step('gather');
      const [match, swings, logs] = await Promise.all([
        db.from('matches').select('error_patterns, stats').eq('player_id', playerId).order('played_at', { ascending: false }).limit(1).maybeSingle(),
        db.from('swing_analyses').select('stroke, key_finding').eq('player_id', playerId).eq('status', 'succeeded').limit(3),
        db.from('drill_logs').select('accuracy_pct, consistency_pct, logged_at, drills(title, stroke)').eq('player_id', playerId).order('logged_at', { ascending: false }).limit(20),
      ]);
      await job.step('claude');
      const r = await callClaude({ task: `${T.drills.task} Create exactly ${count}.`, input: { match: match.data, swings: swings.data, history: logs.data, focus: body.focus }, schema: T.drills.schema, mock: () => T.drills.mock(count) });
      await job.step('save');
      const source = playerId === userId ? 'ai' : 'coach';
      const { data: rows } = await admin.from('drills').insert(r.output.drills.map((d) => ({ ...d, player_id: playerId, assigned_by: userId, source }))).select('id, title');
      const { count: existing } = await admin.from('checklist_items').select('id', { count: 'exact', head: true }).eq('player_id', playerId);
      await admin.from('checklist_items').insert((rows ?? []).map((d, i) => ({ player_id: playerId, kind: 'drill', title: d.title, drill_id: d.id, position: (existing ?? 0) + i })));
      await job.succeed({ drills: rows }, r);
    };
  },

  async swing_analysis({ db, admin, job, playerId, body }) {
    if (!body.swing_id) throw new HttpError(400, 'swing_id required (create the swing_analyses row after uploading the video)');
    const s = must(await db.from('swing_analyses').select('*').eq('id', body.swing_id).single(), 'swing analysis');
    if (s.player_id !== playerId) throw new HttpError(403, 'swing belongs to another player');
    await admin.from('swing_analyses').update({ agent_job_id: job.id, status: 'running' }).eq('id', s.id);
    return async () => {
      try {
        await job.step('cv');
        const { data: signed } = await admin.storage.from('swing-videos').createSignedUrl(s.video_path, 900);
        const metrics = await extractPoseMetrics(signed?.signedUrl ?? s.video_path, s.stroke);
        await job.step('claude');
        const r = await callClaude({ task: T.swing.task, input: { stroke: s.stroke, source: s.source, metrics }, schema: T.swing.schema, mock: () => T.swing.mock(s.stroke) });
        await job.step('save');
        const { data: drill } = await admin.from('drills').insert({
          player_id: playerId, source: 'ai', title: r.output.recommended_drill.title, description: r.output.recommended_drill.description, stroke: s.stroke, difficulty: 2,
        }).select('id').single();
        await admin.from('swing_analyses').update({
          status: 'succeeded', pose_metrics: metrics, annotated_frames: metrics.frames, checkpoints: r.output.checkpoints, summary: r.output.summary,
          key_finding: r.output.key_finding, overall_score: r.output.overall_score, recommended_drill_id: drill?.id ?? null,
        }).eq('id', s.id);
        await job.succeed({ swing_id: s.id, ...r.output }, r);
      } catch (e) {
        await admin.from('swing_analyses').update({ status: 'failed' }).eq('id', s.id);
        throw e;
      }
    };
  },

  async racket_recommendation({ db, admin, job, playerId, body }) {
    const inputs = { swing_speed: body.swing_speed ?? 'medium', arm_comfort: Boolean(body.arm_comfort), skill: body.skill ?? null, playstyle: body.playstyle ?? null };
    return async () => {
      await job.step('gather');
      const [profile, snap, catalogue] = await Promise.all([
        db.from('profiles').select('ntrp, backhand_style, primary_playstyle').eq('id', playerId).single(),
        db.from('playstyle_snapshots').select('equipment, tactical, primary_style').eq('player_id', playerId).order('computed_at', { ascending: false }).limit(1).maybeSingle(),
        admin.from('products').select('id, brand, model, year, specs, profile, rating').eq('category', 'racket'),
      ]);
      const products = catalogue.data ?? [];
      if (!products.length) throw new Error('racket catalogue is empty');
      await job.step('claude');
      const r = await callClaude({
        task: T.racket.task, input: { inputs, profile: profile.data, playstyle: snap.data, catalogue: products },
        schema: T.racket.schema, mock: () => T.racket.mock(products, inputs),
      });
      const valid = new Set(products.map((p) => p.id));
      const picks = r.output.picks.filter((p) => valid.has(p.product_id));
      await job.step('save');
      const { data } = await admin.from('racket_recommendations').insert({ player_id: playerId, agent_job_id: job.id, inputs, picks }).select('id').single();
      await job.succeed({ recommendation_id: data?.id, picks }, r);
    };
  },

  async training_load({ db, admin, job, playerId }) {
    return async () => {
      await job.step('gather');
      const since = new Date(Date.now() - 28 * 86_400_000).toISOString();
      const { data: sessions } = await db.from('wearable_sessions').select('provider, started_at, duration_s, calories, avg_hr, max_hr, recovery_score').eq('player_id', playerId).gte('started_at', since).order('started_at');
      const ratio = T.acuteChronicRatio(sessions ?? []);
      await job.step('claude');
      const r = await callClaude({ task: T.trainingLoad.task, input: { sessions, acute_chronic_ratio: Number(ratio.toFixed(2)) }, schema: T.trainingLoad.schema, mock: () => T.trainingLoad.mock(ratio) });
      await job.step('save');
      if (r.output.status === 'overreaching' || r.output.status === 'strained') {
        await admin.from('notifications').insert({ user_id: playerId, kind: 'training_load', title: 'Ease off this week', body: r.output.headline, payload: { job_id: job.id } });
      }
      await job.succeed({ acute_chronic_ratio: Number(ratio.toFixed(2)), ...r.output }, r);
    };
  },

  async coach_chat({ db, job, playerId, body }) {
    const question = typeof body.question === 'string' ? body.question.trim().slice(0, 1000) : '';
    if (!question) throw new HttpError(400, 'question required');
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    return async () => {
      await job.step('gather');
      const [match, swing, drills] = await Promise.all([
        db.from('matches').select('opponent_name, played_at, surface, score, result, stats, ai_takeaway').eq('player_id', playerId).order('played_at', { ascending: false }).limit(1).maybeSingle(),
        db.from('swing_analyses').select('stroke, key_finding, summary, overall_score').eq('player_id', playerId).eq('status', 'succeeded').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        db.from('drills').select('title, description').eq('player_id', playerId).eq('active', true).limit(5),
      ]);
      await job.step('claude');
      const r = await callClaude({
        task: T.coachChat.task,
        input: { question, history, match: match.data, swing: swing.data, drills: drills.data },
        schema: T.coachChat.schema, mock: () => T.coachChat.mock(question, swing.data?.key_finding),
      });
      await job.succeed(r.output, r);
    };
  },
};
