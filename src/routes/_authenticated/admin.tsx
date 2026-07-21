import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2, UserPlus, Copy } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { inviteUser, listInvitedUsers, deleteInvitedUser } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Multitrack" }] }),
  beforeLoad: ({ context }: any) => {
    if (!context.roles?.includes("admin")) throw new Error("Somente admin");
  },
  component: AdminPage,
});

type Song = { id: string; title: string; bpm: number | null; created_at: string };

function AdminPage() {
  const { roles } = Route.useRouteContext() as any;
  const [songs, setSongs] = useState<Song[]>([]);
  const [title, setTitle] = useState("");
  const [bpm, setBpm] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoles, setInviteRoles] = useState<{ musico: boolean; som: boolean }>({ musico: false, som: false });
  const invite = useServerFn(inviteUser);
  const list = useServerFn(listInvitedUsers);
  const del = useServerFn(deleteInvitedUser);
  const navigate = useNavigate();

  async function reloadSongs() {
    const { data } = await supabase.from("songs").select("id, title, bpm, created_at").order("created_at", { ascending: false });
    setSongs((data as any) ?? []);
  }
  async function reloadUsers() {
    try { setUsers(await list({} as any)); } catch (e: any) { toast.error(e.message); }
  }
  useEffect(() => { reloadSongs(); reloadUsers(); }, []);

  async function createSong(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const { data, error } = await supabase.from("songs").insert({ title, bpm: bpm ? Number(bpm) : null }).select("id").single();
    if (error) return toast.error(error.message);
    setTitle(""); setBpm("");
    navigate({ to: "/admin/songs/$id", params: { id: (data as any).id } });
  }

  async function removeSong(id: string) {
    if (!confirm("Excluir esta canção e suas faixas?")) return;
    const { error } = await supabase.from("songs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    reloadSongs();
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const roles = (["musico", "som"] as const).filter((r) => inviteRoles[r]);
    if (roles.length === 0) return toast.error("Escolha ao menos um painel");
    try {
      const res = await invite({ data: { email: inviteEmail, roles } } as any);
      toast.success(`Convidado. Senha temporária: ${res.tempPassword}`, {
        duration: 20000,
        action: {
          label: "Copiar",
          onClick: () => navigator.clipboard.writeText(`${res.email} / ${res.tempPassword}`),
        },
      });
      setInviteEmail(""); setInviteRoles({ musico: false, som: false });
      reloadUsers();
    } catch (e: any) { toast.error(e.message); }
  }

  async function removeUser(id: string) {
    if (!confirm("Remover este usuário?")) return;
    try { await del({ data: { userId: id } } as any); reloadUsers(); } catch (e: any) { toast.error(e.message); }
  }

  return (
    <AppShell title="Admin" roles={roles}>
      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h1 className="display text-3xl tracking-wide">Canções</h1>
          </div>
          <form onSubmit={createSong} className="surface mb-6 flex flex-wrap items-end gap-3 p-4">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Título</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div className="w-24">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">BPM</label>
              <input value={bpm} onChange={(e) => setBpm(e.target.value)} type="number"
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <button className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              <Plus className="h-4 w-4" /> Criar
            </button>
          </form>

          <ul className="space-y-2">
            {songs.map((s) => (
              <li key={s.id} className="surface flex items-center justify-between p-4">
                <div>
                  <Link to="/admin/songs/$id" params={{ id: s.id }} className="text-lg font-semibold hover:text-primary">{s.title}</Link>
                  <div className="text-xs text-muted-foreground">{s.bpm ? `${s.bpm} BPM · ` : ""}{new Date(s.created_at).toLocaleDateString("pt-BR")}</div>
                </div>
                <button onClick={() => removeSong(s.id)} className="rounded-md p-2 text-muted-foreground hover:bg-destructive/20 hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
            {songs.length === 0 && <li className="text-sm text-muted-foreground">Nenhuma canção ainda.</li>}
          </ul>
        </section>

        <section>
          <h2 className="display text-2xl tracking-wide">Convidados</h2>
          <form onSubmit={handleInvite} className="surface mt-4 space-y-3 p-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Email</label>
              <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={inviteRoles.musico} onChange={(e) => setInviteRoles((v) => ({ ...v, musico: e.target.checked }))} /> Músicos</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={inviteRoles.som} onChange={(e) => setInviteRoles((v) => ({ ...v, som: e.target.checked }))} /> Som</label>
            </div>
            <button className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              <UserPlus className="h-4 w-4" /> Convidar
            </button>
          </form>

          <ul className="mt-4 space-y-2">
            {users.map((u) => (
              <li key={u.id} className="surface flex items-center justify-between p-3 text-sm">
                <div>
                  <div className="font-medium">{u.email}</div>
                  <div className="text-xs text-muted-foreground">{u.roles.join(", ") || "sem papel"}{u.must_change_password ? " · aguarda 1º acesso" : ""}</div>
                </div>
                {!u.roles.includes("admin") && (
                  <button onClick={() => removeUser(u.id)} className="rounded-md p-2 text-muted-foreground hover:bg-destructive/20 hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
