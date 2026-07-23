import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/time")({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify({ now: Date.now() }), {
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        }),
    },
  },
});
