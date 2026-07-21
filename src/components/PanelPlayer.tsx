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

  function applyState(state: { current_song_id: string | null; is_playing: boolean; position_seconds: number; started_at_ms: number | null }) {
    const target = state.is_playing && state.started_at_ms
      ? (Date.now() - state.started_at_ms) / 1000
      : state.position_seconds;
    setPosition(target);
    const list = Object.values(audios.current).filter(Boolean) as HTMLAudioElement[];
    list.forEach((a) => {
      if (Math.abs(a.currentTime - target) > 0.25) a.currentTime = target;
    });
    if (state.is_playing) {
      list.forEach((a) => { a.play().catch(() => {}); });
      setIsPlaying(true);
    } else {
      list.forEach((a) => a.pause());
      setIsPlaying(false);
    }
  }

  // Subscribe to playback state
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.from("playback_state").select("*").eq("id", 1).maybeSingle();
      if (!mounted || !data) return;
      const sid = (data as any).current_song_id as string | null;
      setSongId(sid);
      songIdRef.current = sid;
      if (sid) await loadTracksFor(sid);
      setTimeout(() => applyState(data as any), 250);
    })();
    const channel = supabase
      .channel("playback")
      .on("postgres_changes", { event: "*", schema: "public", table: "playback_state" }, async (payload: any) => {
        const state = payload.new;
        if (!state) return;
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
        setTimeout(() => applyState(state), 200);
      })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
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
