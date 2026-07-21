import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export function AppShell({ title, children, roles = [] }: { title: string; children: React.ReactNode; roles?: string[] }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            <span className="display text-lg tracking-widest">MULTITRACK</span>
            <span className="ml-3 text-sm text-muted-foreground">/ {title}</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {roles?.includes("admin") && <NavLink to="/admin">Admin</NavLink>}
            {(roles?.includes("admin") || roles?.includes("musico")) && <NavLink to="/musicos">Músicos</NavLink>}
            {(roles?.includes("admin") || roles?.includes("som")) && <NavLink to="/som">Som</NavLink>}
            <button onClick={signOut} className="ml-2 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      activeProps={{ className: "rounded-md px-3 py-1.5 bg-accent text-foreground" }}
    >
      {children}
    </Link>
  );
}
