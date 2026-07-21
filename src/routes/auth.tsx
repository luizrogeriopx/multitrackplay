import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Radio } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — Multitrack" }] }),
  component: AuthPage,
});

async function routeAfterLogin(userId: string, navigate: ReturnType<typeof useNavigate>) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.must_change_password) {
    return { needChange: true };
  }
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const list = (roles ?? []).map((r) => r.role);
  if (list.includes("admin")) navigate({ to: "/admin" });
  else if (list.includes("musico")) navigate({ to: "/musicos" });
  else if (list.includes("som")) navigate({ to: "/som" });
  else navigate({ to: "/" });
  return { needChange: false };
}

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [needChange, setNeedChange] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const r = await routeAfterLogin(data.user.id, navigate);
        if (r.needChange) setNeedChange(true);
      }
    });
  }, [navigate]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error || !data.user) {
      toast.error("Credenciais inválidas");
      return;
    }
    const r = await routeAfterLogin(data.user.id, navigate);
    if (r.needChange) setNeedChange(true);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPass.length < 6) return toast.error("A nova senha precisa ter pelo menos 6 caracteres");
    if (newPass !== confirmPass) return toast.error("As senhas não coincidem");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) { setLoading(false); return toast.error(error.message); }
    const { data: u } = await supabase.auth.getUser();
    if (u.user) {
      await supabase.from("profiles").update({ must_change_password: false }).eq("id", u.user.id);
      toast.success("Senha alterada");
      setNeedChange(false);
      await routeAfterLogin(u.user.id, navigate);
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Radio className="h-6 w-6 text-primary" />
          <span className="display text-2xl tracking-widest">MULTITRACK</span>
        </div>
        <div className="surface p-6">
          {needChange ? (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Defina sua nova senha</h2>
                <p className="mt-1 text-sm text-muted-foreground">Primeiro acesso: escolha uma senha pessoal.</p>
              </div>
              <Field label="Nova senha" type="password" value={newPass} onChange={setNewPass} />
              <Field label="Confirmar" type="password" value={confirmPass} onChange={setConfirmPass} />
              <SubmitBtn loading={loading}>Salvar e continuar</SubmitBtn>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Entrar</h2>
                <p className="mt-1 text-sm text-muted-foreground">Acesse com o email e senha fornecidos.</p>
              </div>
              <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
              <Field label="Senha" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
              <SubmitBtn loading={loading}>Entrar</SubmitBtn>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, type, value, onChange, autoComplete }: { label: string; type: string; value: string; onChange: (v: string) => void; autoComplete?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
      />
    </label>
  );
}

function SubmitBtn({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
    >
      {loading ? "Aguarde…" : children}
    </button>
  );
}
