import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { PanelPlayer } from "@/components/PanelPlayer";

export const Route = createFileRoute("/_authenticated/musicos")({
  head: () => ({ meta: [{ title: "Músicos — Multitrack" }] }),
  beforeLoad: ({ context }: any) => {
    if (!context.roles?.includes("musico") && !context.roles?.includes("admin")) {
      throw new Error("Sem acesso ao painel Músicos");
    }
  },
  component: MusicosPanel,
});

function MusicosPanel() {
  const { roles } = Route.useRouteContext() as any;
  return (
    <AppShell title="Músicos" roles={roles}>
      <PanelPlayer panel="musicos" />
    </AppShell>
  );
}
