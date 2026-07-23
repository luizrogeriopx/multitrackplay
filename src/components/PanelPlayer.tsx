import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Radio } from "lucide-react";
import { syncClockWithServer, getSyncTime } from "@/lib/clockSync";
import { applyEffective, computeEffective, type PlaybackRow } from "@/lib/playbackSync";

type Track = { id: string; name: string; storage_path: string; route: "musicos" | "som" | "both"; volume: number; order_index: number };

export function PanelPlayer({ panel }: { panel: "musicos" | "som" }) {
  const [songId, setSongId] = useState<string | null>(null);
  const [songTitle, setSongTitle] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const audios = useRef<Record<string, HTMLAudioElement | null>>({});
  const songIdRef = useRef<string | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const stateRef = useRef<PlaybackRow | null>(null);
  const scheduledTimerRef = useRef<number | null>(null);

  async function loadTracksFor(sid: string) {
    songIdRef.current = sid;
    const { data: s } = await supabase.from("songs").select("title").eq("id", sid).maybeSingle();
    setSongTitle((s as any)?.title ?? null);
    const { data, error } = await supabase
      .from("tracks")
      .select("id, name, storage_path, route, volume, order_index")
      .eq("song_id", sid)
      .in("route", [panel, "both"])
      .order("order_index", { ascending: true });
    if (error) { toast.error(error.message); return; }
    setTracks((data as any) ?? []);
    const map: Record<string, string> = {};
    for (const t of (data as any[] ?? [])) {
      const { data: signed } = await supabase.storage.from("tracks").createSignedUrl(t.storage_path, 3600);
      if (signed?.signedUrl) map[t.id] = signed.signedUrl;
    }
    setUrls(map);
  }

  const syncAudio = () => {
    const state = stateRef.current;
    if (!state) return;

    const list = Object.values(audios.current).filter(Boolean) as HTMLAudioElement[];
    if (list.length === 0) return;

    const eff = computeEffective(state);
    setIsPlaying(eff.playing);
    setPosition(Math.max(0, eff.target));

    applyEffective(list, eff, {
      onAutoplayBlocked: () => setAutoplayBlocked(true),
    });

    // Schedule a precise re-sync exactly at the transition moment
    if (eff.transitionInMs != null && eff.transitionInMs > 0) {
      if (scheduledTimerRef.current) window.clearTimeout(scheduledTimerRef.current);
      scheduledTimerRef.current = window.setTimeout(() => {
        scheduledTimerRef.current = null;
        syncAudio();
      }, eff.transitionInMs);
    }
  };

  function normalize(row: any): PlaybackRow {
    return {
      is_playing: !!row.is_playing,
      position_seconds: Number(row.position_seconds || 0),
      started_at_ms: row.started_at_ms != null ? Number(row.started_at_ms) : null,
      scheduled_at_ms: row.scheduled_at_ms != null ? Number(row.scheduled_at_ms) : null,
      current_song_id: row.current_song_id ?? null,
    };
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      await syncClockWithServer();
      const { data } = await supabase.from("playback_state").select("*").eq("id", 1).maybeSingle();
      if (!mounted || !data) return;
      stateRef.current = normalize(data);
      const sid = stateRef.current.current_song_id;
      setSongId(sid);
      songIdRef.current = sid;
      if (sid) await loadTracksFor(sid);
      // Give audio a beat to attach
      setTimeout(syncAudio, 100);
    })();

    const channel = supabase
      .channel("playback")
      .on("postgres_changes", { event: "*", schema: "public", table: "playback_state" }, async (payload: any) => {
        const row = payload.new;
        if (!row) return;
        stateRef.current = normalize(row);
        if (row.current_song_id !== songIdRef.current) {
          songIdRef.current = row.current_song_id;
          setSongId(row.current_song_id);
          if (row.current_song_id) {
            await loadTracksFor(row.current_song_id);
            // Wait a tick for audio elements to mount and start buffering
            setTimeout(syncAudio, 150);
            return;
          } else {
            setSongTitle(null);
            setTracks([]);
          }
        }
        syncAudio();
      })
      .subscribe();

    // Light drift correction loop while playing
    const interval = window.setInterval(() => {
      const s = stateRef.current;
      if (!s) return;
      // Only run drift correction when actively playing (not during scheduled window)
      const eff = computeEffective(s);
      if (eff.playing) {
        const list = Object.values(audios.current).filter(Boolean) as HTMLAudioElement[];
        if (list.length) {
          setPosition(Math.max(0, eff.target));
          for (const a of list) {
            if (Math.abs(a.currentTime - eff.target) > 0.15) {
              a.currentTime = Math.max(0, eff.target);
            }
          }
        }
      }
    }, 1000);

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
      window.clearInterval(interval);
      if (scheduledTimerRef.current) window.clearTimeout(scheduledTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sync when new audio elements mount (tracks loaded)
  useEffect(() => {
    if (tracks.length > 0) {
      // Once metadata loads on all, run sync
      const t = window.setTimeout(syncAudio, 200);
      return () => window.clearTimeout(t);
    }
  }, [tracks, urls]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Ao vivo</div>
          <h1 className="display text-4xl tracking-wide">{songTitle ?? "Aguardando canção…"}</h1>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs uppercase tracking-widest">
          {isPlaying ? <><span className="live-dot" /> Tocando</> : <>Parado</>}
        </span>
      </div>

      {autoplayBlocked && (
        <div className="mb-6 rounded-md bg-amber-500/20 border border-amber-500/50 p-4 flex items-center justify-between">
          <div className="text-sm text-amber-200">
            O seu navegador bloqueou o início automático do som. Clique no botão ao lado para ativar a sincronização de áudio.
          </div>
          <button
            onClick={async () => {
              setAutoplayBlocked(false);
              const list = Object.values(audios.current).filter(Boolean) as HTMLAudioElement[];
              // Unlock by briefly playing & pausing so future scheduled plays work
              for (const a of list) {
                try { await a.play(); a.pause(); } catch {}
              }
              syncAudio();
            }}
            className="rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400"
          >
            Ativar Som
          </button>
        </div>
      )}

      <div className="surface mb-6 flex items-center gap-3 p-4">
        <Radio className="h-5 w-5 text-primary" />
        <div className="flex-1 text-sm text-muted-foreground">
          Posição: <span className="tabular-nums text-foreground">{fmt(position)}</span>
        </div>
      </div>

      {tracks.length === 0 && songId && (
        <p className="text-sm text-muted-foreground">Esta canção não tem faixas atribuídas ao painel <b>{panel === "musicos" ? "Músicos" : "Som"}</b>.</p>
      )}
      {!songId && (
        <p className="text-sm text-muted-foreground">O admin ainda não colocou nenhuma canção no ar.</p>
      )}

      <ul className="space-y-2">
        {tracks.map((t) => (
          <li key={t.id} className="surface p-4">
            <div className="flex items-center justify-between">
              <div className="font-medium">{t.name}</div>
              <div className="text-xs text-muted-foreground">Vol {Math.round(t.volume * 100)}%</div>
            </div>
            {urls[t.id] && (
              <audio
                ref={(el) => {
                  audios.current[t.id] = el;
                  if (el) el.volume = t.volume;
                }}
                src={urls[t.id]}
                preload="auto"
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
