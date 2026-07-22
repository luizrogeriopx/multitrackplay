let serverOffset = 0;

export async function syncClockWithServer() {
  try {
    const env = typeof import.meta !== 'undefined' && import.meta.env 
      ? import.meta.env 
      : (typeof process !== 'undefined' && process.env ? process.env : {});

    const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
    const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;

    if (!url || !key) {
      console.warn("[ClockSync] Supabase URL or publishable key not found. Skipping server clock synchronization.");
      return;
    }

    const start = Date.now();
    const response = await fetch(`${url}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        apikey: key,
      },
    });
    const serverDateStr = response.headers.get('date');
    if (serverDateStr) {
      const serverTime = new Date(serverDateStr).getTime();
      if (!isNaN(serverTime)) {
        const end = Date.now();
        const latency = (end - start) / 2;
        serverOffset = (serverTime + latency) - end;
        console.log(`[ClockSync] Clock synchronized with server. Offset: ${serverOffset}ms (latency: ${latency}ms)`);
      }
    }
  } catch (e) {
    console.error("[ClockSync] Failed to sync clock with Supabase server:", e);
  }
}

export function getSyncTime(): number {
  return Date.now() + serverOffset;
}
