import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Play, Pause, Radio, Trash2, Upload, CheckCircle2, XCircle, Loader2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { getSyncTime, syncClockWithServer } from "@/lib/clockSync";

type TrackRoute = "musicos" | "som" | "both";
type Track = {
  id: string;
  song_id: string;
  name: string;
  storage_path: string;
  route: TrackRoute;
  volume: number;
  order_index: number;
  mime: string | null;
};
type Song = { id: string; title: string; bpm: number | null; notes: string | null };

export const Route = createFileRoute("/_authenticated/admin/songs/$id")({
  head: () => ({ meta: [{ title: "Editor de canção — Multitrack" }] }),
  beforeLoad: ({ context }: any) => {
    if (!context.roles?.includes("admin")) throw new Error("Somente admin");
  },
  component: EditorPage,
});

function EditorPage() {
  const { id } = Route.useParams();
  const { roles } = Route.useRouteContext() as any;
  const [song, setSong] = useState<Song | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [uploading, setUploading] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [liveSongId, setLiveSongId] = useState<string | null>(null);
  const audiosRef = useRef<Record<string, HTMLAudioElement | null>>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  type UploadQueueItem = {
    id: string;
    name: string;
    size: number;
    status: 'pending' | 'uploading' | 'completed' | 'error';
    errorMessage?: string;
  };
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);

  async function load() {
    const { data: s } = await supabase.from("songs").select("*").eq("id", id).maybeSingle();
    setSong(s as any);
    const { data: t } = await supabase.from("tracks").select("*").eq("song_id", id).order("order_index", { ascending: true });
    setTracks((t as any) ?? []);
    const { data: pb } = await supabase.from("playback_state").select("current_song_id").eq("id", 1).maybeSingle();
    setLiveSongId((pb as any)?.current_song_id ?? null);
  }
  useEffect(() => {
    load();
    syncClockWithServer();
  }, [id]);

  // Signed URLs (admin lê tudo via RLS)
  useEffect(() => {
    (async () => {
      const map: Record<string, string> = {};
      for (const t of tracks) {
        const { data } = await supabase.storage.from("tracks").createSignedUrl(t.storage_path, 3600);
        if (data?.signedUrl) map[t.id] = data.signedUrl;
      }
      setUrls(map);
    })();
  }, [tracks]);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);

    const newItems: UploadQueueItem[] = Array.from(files).map((file, idx) => ({
      id: `${Date.now()}-${idx}-${file.name}`,
      name: file.name,
      size: file.size,
      status: 'pending',
    }));
    setUploadQueue(newItems);

    try {
      const fileArray = Array.from(files);
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        const queueItemId = newItems[i].id;

        setUploadQueue((prev) =>
          prev.map((item) => (item.id === queueItemId ? { ...item, status: 'uploading' } : item))
        );

        try {
          const path = `${id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          const { error: upErr } = await supabase.storage.from("tracks").upload(path, file, { contentType: file.type || "audio/mpeg" });
          if (upErr) throw upErr;

          const { error: insErr } = await supabase.from("tracks").insert({
            song_id: id, name: file.name.replace(/\.[^.]+$/, ""), storage_path: path,
            mime: file.type || null, route: "both", volume: 1, order_index: tracks.length + i,
          });
          if (insErr) throw insErr;

          setUploadQueue((prev) =>
            prev.map((item) => (item.id === queueItemId ? { ...item, status: 'completed' } : item))
          );
        } catch (err: any) {
          setUploadQueue((prev) =>
            prev.map((item) => (item.id === queueItemId ? { ...item, status: 'error', errorMessage: err.message } : item))
          );
        }
      }
      toast.success("Processamento de faixas concluído");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function updateTrack(t: Track, patch: Partial<Track>) {
    const { error } = await supabase.from("tracks").update(patch).eq("id", t.id);
    if (error) return toast.error(error.message);
    setTracks((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
  }
  async function removeTrack(t: Track) {
    if (!confirm(`Remover a faixa "${t.name}"?`)) return;
    await supabase.storage.from("tracks").remove([t.storage_path]);
    await supabase.from("tracks").delete().eq("id", t.id);
    load();
  }

  // Playback
  const allAudios = () => Object.values(audiosRef.current).filter(Boolean) as HTMLAudioElement[];

  useEffect(() => {
    const onTime = () => {
      const first = allAudios()[0];
      if (first) setPosition(first.currentTime);
    };
    const id = window.setInterval(onTime, 200);
    return () => window.clearInterval(id);
  }, []);

  async function putOnAir() {
    const { error } = await supabase.from("playback_state").update({
      current_song_id: id, is_playing: false, position_seconds: 0, started_at_ms: null, updated_at: new Date().toISOString(),
    }).eq("id", 1);
    if (error) return toast.error(error.message);
    setLiveSongId(id);
    toast.success("Canção no ar");
  }

  async function play() {
    const audios = allAudios();
    if (!audios.length) return;
    // sync to earliest position
    audios.forEach((a) => (a.currentTime = position));
    await Promise.all(audios.map((a) => a.play()));
    setIsPlaying(true);
    const startedAtMs = getSyncTime() - Math.floor(position * 1000);
    await supabase.from("playback_state").update({
      current_song_id: id, is_playing: true, position_seconds: position, started_at_ms: startedAtMs, updated_at: new Date().toISOString(),
    }).eq("id", 1);
  }
  async function pause() {
    const audios = allAudios();
    audios.forEach((a) => a.pause());
    const pos = audios[0]?.currentTime ?? position;
    setIsPlaying(false);
    setPosition(pos);
    await supabase.from("playback_state").update({
      is_playing: false, position_seconds: pos, started_at_ms: null, updated_at: new Date().toISOString(),
    }).eq("id", 1);
  }
  async function seek(v: number) {
    const audios = allAudios();
    audios.forEach((a) => (a.currentTime = v));
    setPosition(v);
    if (isPlaying) {
      const startedAtMs = getSyncTime() - Math.floor(v * 1000);
      await supabase.from("playback_state").update({
        position_seconds: v, started_at_ms: startedAtMs, updated_at: new Date().toISOString(),
      }).eq("id", 1);
    } else {
      await supabase.from("playback_state").update({
        position_seconds: v, updated_at: new Date().toISOString(),
      }).eq("id", 1);
    }
  }

  const isLive = liveSongId === id;

  return (
    <AppShell title="Editor" roles={roles}>
      <Link to="/admin" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      {song && (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="display text-4xl tracking-wide">{song.title}</h1>
            {song.bpm && <div className="text-sm text-muted-foreground">{song.bpm} BPM</div>}
          </div>
          <div className="flex items-center gap-2">
            {isLive && <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs uppercase tracking-widest"><span className="live-dot" /> No ar</span>}
            <button onClick={putOnAir} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent">
              <Radio className="h-4 w-4" /> Colocar no ar
            </button>
            {isPlaying ? (
              <button onClick={pause} className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><Pause className="h-4 w-4" /> Pausar</button>
            ) : (
              <button onClick={play} className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><Play className="h-4 w-4" /> Play</button>
            )}
          </div>
        </div>
      )}

      <div className="surface mb-6 p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{fmt(position)}</span>
          <span>{fmt(duration || 0)}</span>
        </div>
        <input
          type="range" min={0} max={duration || 0} step={0.1} value={position}
          onChange={(e) => seek(Number(e.target.value))}
          className="mt-2 w-full accent-primary"
        />
      </div>

      <label className="surface mb-6 flex cursor-pointer items-center justify-center gap-2 border-dashed p-8 text-sm text-muted-foreground hover:border-primary hover:text-foreground">
        <Upload className="h-4 w-4" />
        {uploading ? "Enviando…" : "Clique ou arraste faixas (mp3, wav, flac, m4a, ogg)"}
        <input type="file" multiple accept="audio/*" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      </label>

      {uploadQueue.length > 0 && (
        <div className="surface mb-6 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold">Progresso do Upload</span>
            <span className="text-xs text-muted-foreground">
              {uploadQueue.filter(x => x.status === 'completed').length} de {uploadQueue.length} concluído(s)
            </span>
          </div>

          <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{
                width: `${Math.round(
                  ((uploadQueue.filter(x => x.status === 'completed' || x.status === 'error').length) /
                    uploadQueue.length) *
                    100
                )}%`,
              }}
            />
          </div>

          <div className="max-h-48 overflow-y-auto space-y-2">
            {uploadQueue.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded bg-background/50 p-2 text-sm">
                <span className="truncate max-w-[70%] font-medium">{item.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {(item.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                  {item.status === 'pending' && (
                    <span className="text-xs text-muted-foreground">Pendente</span>
                  )}
                  {item.status === 'uploading' && (
                    <span className="inline-flex items-center gap-1 text-xs text-blue-400 font-semibold">
                      <Loader2 className="h-3 w-3 animate-spin" /> Enviando
                    </span>
                  )}
                  {item.status === 'completed' && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-400 font-semibold">
                      <CheckCircle2 className="h-3 w-3" /> OK
                    </span>
                  )}
                  {item.status === 'error' && (
                    <span className="inline-flex items-center gap-1 text-xs text-destructive font-semibold" title={item.errorMessage}>
                      <XCircle className="h-3 w-3" /> Falhou
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!uploading && uploadQueue.length > 0 && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => setUploadQueue([])}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Limpar lista
              </button>
            </div>
          )}
        </div>
      )}

      <ul className="space-y-2">
        {tracks.map((t) => (
          <li key={t.id} className="surface p-4">
            <div className="flex flex-wrap items-center gap-4">
              <input
                value={t.name}
                onChange={(e) => setTracks((p) => p.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)))}
                onBlur={(e) => updateTrack(t, { name: e.target.value })}
                className="min-w-[180px] flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium"
              />
              <select
                value={t.route}
                onChange={(e) => updateTrack(t, { route: e.target.value as TrackRoute })}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="both">Ambos os painéis</option>
                <option value="musicos">Só Músicos</option>
                <option value="som">Só Som</option>
              </select>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Vol
                <input type="range" min={0} max={1} step={0.05} value={t.volume}
                  onChange={(e) => updateTrack(t, { volume: Number(e.target.value) })} className="accent-primary" />
                <span className="w-8 text-right tabular-nums">{Math.round(t.volume * 100)}%</span>
              </label>
              <button onClick={() => removeTrack(t)} className="rounded-md p-2 text-muted-foreground hover:bg-destructive/20 hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {urls[t.id] && (
              <audio
                ref={(el) => { audiosRef.current[t.id] = el; }}
                src={urls[t.id]}
                preload="auto"
                onLoadedMetadata={(e) => setDuration((d) => Math.max(d, e.currentTarget.duration || 0))}
                onEnded={() => setIsPlaying(false)}
              />
            )}
            <div className="mt-2 text-xs text-muted-foreground">
              <RouteBadge route={t.route} />
            </div>
          </li>
        ))}
        {tracks.length === 0 && <li className="text-sm text-muted-foreground">Nenhuma faixa ainda.</li>}
      </ul>
    </AppShell>
  );
}

function RouteBadge({ route }: { route: TrackRoute }) {
  const map = {
    musicos: { label: "Músicos", color: "text-[color:var(--panel-musicos)]" },
    som: { label: "Som", color: "text-[color:var(--panel-som)]" },
    both: { label: "Ambos", color: "text-primary" },
  }[route];
  return <span className={`uppercase tracking-widest ${map.color}`}>→ {map.label}</span>;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
