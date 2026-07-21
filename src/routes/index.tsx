import { createFileRoute, Link } from "@tanstack/react-router";
import { Music, Radio, Sliders } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Multitrack — Painéis Músicos & Som" },
      { name: "description", content: "Cadastre canções, envie faixas separadas e sincronize a reprodução entre os painéis de músicos e som." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            <span className="display text-xl tracking-widest">MULTITRACK</span>
          </div>
          <Link
            to="/auth"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs uppercase tracking-widest text-muted-foreground">
            <span className="live-dot" /> Player sincronizado
          </span>
          <h1 className="display mt-6 text-6xl leading-none tracking-tight text-foreground md:text-8xl">
            Duas cabines,<br />
            <span className="text-primary">um só groove.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Cadastre suas canções, envie as faixas separadas e atribua cada uma ao painel dos músicos, ao painel do som ou a ambos. Você controla o play — todos ouvem em sincronia.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/auth"
              className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Entrar no painel
            </Link>
          </div>
        </div>

        <div className="mt-20 grid gap-6 md:grid-cols-3">
          <Feature icon={<Music className="h-5 w-5" />} title="Faixas por canção" desc="Upload de múltiplas faixas em qualquer formato de áudio." />
          <Feature icon={<Sliders className="h-5 w-5" />} title="Roteamento por painel" desc="Cada faixa vai para /musicos, /som ou ambos." />
          <Feature icon={<Radio className="h-5 w-5" />} title="Sincronia em tempo real" desc="Admin controla o play; os painéis obedecem." />
        </div>
      </main>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="surface p-6">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
