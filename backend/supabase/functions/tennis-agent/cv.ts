/**
 * Computer-vision service client (pose estimation on swing videos). The CV model runs outside
 * Supabase (e.g. a GPU worker running MediaPipe/MoveNet); set CV_SERVICE_URL to enable it.
 * Without it, a fixed sample of metrics is returned so the rest of the pipeline can run.
 */
export interface PoseMetrics {
  fps: number;
  phases: { key: string; frame_ms: number }[];
  joints: Record<string, number>;
  frames: { frame_ms: number; image_path: string | null; annotations: unknown[] }[];
  mocked?: boolean;
}

export async function extractPoseMetrics(videoUrl: string, stroke: string, fetchImpl: typeof fetch = fetch): Promise<PoseMetrics> {
  const base = Deno.env.get('CV_SERVICE_URL');
  if (!base) {
    return {
      fps: 60,
      phases: [{ key: 'preparation', frame_ms: 400 }, { key: 'contact_point', frame_ms: 900 }, { key: 'finish', frame_ms: 1300 }],
      joints: { shoulder_turn_deg: 92, contact_offset_cm: -8, elbow_angle_contact_deg: 158, knee_flex_deg: 34 },
      frames: [],
      mocked: true,
    };
  }
  const res = await fetchImpl(`${base.replace(/\/$/, '')}/pose`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${Deno.env.get('CV_SERVICE_TOKEN') ?? ''}` },
    body: JSON.stringify({ video_url: videoUrl, stroke }),
  });
  if (!res.ok) throw new Error(`CV service ${res.status}`);
  return (await res.json()) as PoseMetrics;
}
