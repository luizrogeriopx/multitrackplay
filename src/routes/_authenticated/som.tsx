import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { PanelPlayer } from "@/components/PanelPlayer";

export const Route = createFileRoute("/_authenticated/som")({
  head: () => ({ meta: [{ title: "Som — Multitrack" }] }),
  beforeLoad: ({ context }: any) => {
    if (!context.roles?.includes("som") && !context.roles?.includes("admin")) {
      throw new Error("Sem acesso ao painel Som");
    }
  },
  component: SomPanel,
});

function SomPanel() {
  const { roles } = Route.useRouteContext() as any;
  return (
    <AppShell title="Som" roles={roles}>
      <PanelPlayer panel="som" />
    </AppShell>
  );
}
