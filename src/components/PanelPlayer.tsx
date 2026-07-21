import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Radio } from "lucide-react";

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
  const playbackStateRef = useRef<{ is_playing: boolean; started_at_ms: number | null; position_seconds: number } | null>(null);

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
    const state = playbackStateRef.current;
    if (!state) return;

    const list = Object.values(audios.current).filter(Boolean) as HTMLAudioElement[];
    if (list.length === 0) return;

    if (state.is_playing && state.started_at_ms) {
      const target = (Date.now() - state.started_at_ms) / 1000;
      setPosition(target);
      setIsPlaying(true);

      list.forEach((a) => {
        if (a.paused) {
          a.play().catch((err) => {
            if (err.name === "NotAllowedError") {
              setAutoplayBlocked(true);
            }
          });
        }
        // Sync if drift is > 300ms
        if (Math.abs(a.currentTime - target) > 0.3) {
          a.currentTime = target;
        }
      });
    } else {
      setPosition(state.position_seconds);
      setIsPlaying(false);

      list.forEach((a) => {
        if (!a.paused) a.pause();
        if (Math.abs(a.currentTime - state.position_seconds) > 0.15) {
          a.currentTime = state.position_seconds;
        }
      });
    }
  };

  // Subscribe to playback state
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.from("playback_state").select("*").eq("id", 1).maybeSingle();
      if (!mounted || !data) return;
      const sid = (data as any).current_song_id as string | null;
      setSongId(sid);
      songIdRef.current = sid;
      playbackStateRef.current = {
        is_playing: (data as any).is_playing,
        started_at_ms: (data as any).started_at_ms ? Number((data as any).started_at_ms) : null,
        position_seconds: Number((data as any).position_seconds || 0),
      };
      if (sid) await loadTracksFor(sid);
      syncAudio();
    })();

    const channel = supabase
      .channel("playback")
      .on("postgres_changes", { event: "*", schema: "public", table: "playback_state" }, async (payload: any) => {
        const state = payload.new;
        if (!state) return;

        playbackStateRef.current = {
          is_playing: state.is_playing,
          started_at_ms: state.started_at_ms ? Number(state.started_at_ms) : null,
          position_seconds: Number(state.position_seconds || 0),
        };

        if (state.current_song_id !== songIdRef.current) {
          songIdRef.current = state.current_song_id;
          setSongId(state.current_song_id);
          if (state.current_song_id) {
            await loadTracksFor(state.current_song_id);
          } else {
            setSongTitle(null);
            setTracks([]);
          }
        }
        setTimeout(syncAudio, 50);
      })
      .subscribe();

    const interval = setInterval(syncAudio, 500);

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              for (const a of list) {
                try {
                  await a.play();
                } catch (e) {}
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
