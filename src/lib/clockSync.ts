let serverOffset = 0;
let synced = false;

async function sampleOnce(): Promise<{ offset: number; rtt: number } | null> {
  try {
    const start = Date.now();
    const res = await fetch("/api/public/time", { cache: "no-store" });
    const end = Date.now();
    if (!res.ok) return null;
    const { now } = (await res.json()) as { now: number };
    const rtt = end - start;
    // Assume server processed request at midpoint of RTT
    const offset = now - (start + rtt / 2);
    return { offset, rtt };
  } catch {
    return null;
  }
}

export async function syncClockWithServer(samples = 7) {
  const results: { offset: number; rtt: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const r = await sampleOnce();
    if (r) results.push(r);
  }
  if (!results.length) {
    console.warn("[ClockSync] no samples");
    return;
  }
  // Pick sample with lowest RTT (most accurate)
  results.sort((a, b) => a.rtt - b.rtt);
  const best = results[0];
  serverOffset = best.offset;
  synced = true;
  console.log(`[ClockSync] offset=${serverOffset}ms best_rtt=${best.rtt}ms samples=${results.length}`);
}

export function getSyncTime(): number {
  return Math.round(Date.now() + serverOffset);
}


export function isClockSynced() {
  return synced;
}
