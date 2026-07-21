import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getTrackSignedUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { songId: string }) => z.object({ songId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    // Faixas retornadas já obedecem RLS pelo cliente autenticado
    const { data: tracks, error } = await context.supabase
      .from("tracks")
      .select("id, name, storage_path, mime, duration_seconds, route, volume, order_index")
      .eq("song_id", data.songId)
      .order("order_index", { ascending: true });
    if (error) throw error;
    const out: Array<any> = [];
    for (const t of tracks ?? []) {
      const { data: signed } = await context.supabase.storage.from("tracks").createSignedUrl(t.storage_path, 60 * 60);
      out.push({ ...t, url: signed?.signedUrl ?? null });
    }
    return out;
  });
