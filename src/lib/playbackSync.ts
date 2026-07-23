import { getSyncTime } from "./clockSync";

export type PlaybackRow = {
  is_playing: boolean;
  position_seconds: number;
  started_at_ms: number | null;
  scheduled_at_ms: number | null;
  current_song_id: string | null;
};

export type Effective = {
  playing: boolean;
  target: number;
  transitionInMs: number | null; // >0 if scheduled transition in the future
};

/**
 * Compute the effective playback state at the current wall clock.
 * See semantics in playback module.
 */
export function computeEffective(state: PlaybackRow, nowMs = getSyncTime()): Effective {
  const sched = state.scheduled_at_ms ?? 0;
  const startedAt = state.started_at_ms;
  const pos = Number(state.position_seconds) || 0;

  if (state.is_playing) {
    if (nowMs < sched) {
      return { playing: false, target: pos, transitionInMs: sched - nowMs };
    }
    const target = startedAt != null ? (nowMs - startedAt) / 1000 : pos;
    return { playing: true, target, transitionInMs: null };
  } else {
    if (nowMs < sched && startedAt != null) {
      // Still playing until scheduled pause
      const target = (nowMs - startedAt) / 1000;
      return { playing: true, target, transitionInMs: sched - nowMs };
    }
    return { playing: false, target: pos, transitionInMs: null };
  }
}

/**
 * Apply the effective state to a list of HTMLAudioElements with drift correction.
 * Returns whether autoplay was blocked (NotAllowedError).
 */
export function applyEffective(
  audios: HTMLAudioElement[],
  eff: Effective,
  opts: { onAutoplayBlocked?: () => void; playDriftSec?: number; pauseDriftSec?: number } = {}
) {
  const playDrift = opts.playDriftSec ?? 0.08;
  const pauseDrift = opts.pauseDriftSec ?? 0.05;

  if (eff.playing) {
    for (const a of audios) {
      if (isFinite(eff.target) && Math.abs(a.currentTime - eff.target) > playDrift) {
        a.currentTime = Math.max(0, eff.target);
      }
      if (a.paused) {
        a.play().catch((err) => {
          if (err?.name === "NotAllowedError") opts.onAutoplayBlocked?.();
        });
      }
    }
  } else {
    for (const a of audios) {
      if (!a.paused) a.pause();
      if (isFinite(eff.target) && Math.abs(a.currentTime - eff.target) > pauseDrift) {
        a.currentTime = Math.max(0, eff.target);
      }
    }
  }
}
