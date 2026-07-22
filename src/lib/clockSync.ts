let serverOffset = 0;

export async function syncClockWithServer() {
  try {
    const start = Date.now();
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    });
    const serverDateStr = response.headers.get('date');
    if (serverDateStr) {
      const serverTime = new Date(serverDateStr).getTime();
      const end = Date.now();
      const latency = (end - start) / 2;
      serverOffset = (serverTime + latency) - end;
      console.log(`[ClockSync] Clock synchronized with server. Offset: ${serverOffset}ms (latency: ${latency}ms)`);
    }
  } catch (e) {
    console.error("[ClockSync] Failed to sync clock with Supabase server:", e);
  }
}

export function getSyncTime(): number {
  return Date.now() + serverOffset;
}
