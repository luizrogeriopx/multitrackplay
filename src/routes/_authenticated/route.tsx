import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase
      .from("profiles").select("must_change_password").eq("id", data.user.id).maybeSingle();
    if (profile?.must_change_password) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", data.user.id);
    return {
      user: data.user,
      roles: (roles ?? []).map((r) => r.role) as Array<"admin" | "musico" | "som">,
    };
  },
  component: () => <Outlet />,
});
