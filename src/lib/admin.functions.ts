import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Forbidden");
}

function randomPassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { email: string; roles: Array<"musico" | "som"> }) =>
    z.object({
      email: z.string().email(),
      roles: z.array(z.enum(["musico", "som"])).min(1),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tempPassword = randomPassword();
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { must_change_password: true },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Falha ao criar usuário");
    const uid = created.user.id;
    await supabaseAdmin.from("profiles").upsert({ id: uid, email: data.email, must_change_password: true });
    const rows = data.roles.map((role) => ({ user_id: uid, role }));
    await supabaseAdmin.from("user_roles").upsert(rows, { onConflict: "user_id,role" });
    return { email: data.email, tempPassword };
  });

export const listInvitedUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles } = await supabaseAdmin
      .from("profiles").select("id, email, must_change_password, created_at").order("created_at", { ascending: false });
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const map = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      if (!map.has(r.user_id)) map.set(r.user_id, []);
      map.get(r.user_id)!.push(r.role);
    });
    return (profiles ?? []).map((p: any) => ({ ...p, roles: map.get(p.id) ?? [] }));
  });

export const deleteInvitedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("Não pode remover a si mesmo");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.auth.admin.deleteUser(data.userId);
    return { ok: true };
  });
