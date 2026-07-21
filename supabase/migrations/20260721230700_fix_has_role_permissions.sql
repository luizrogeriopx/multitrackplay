-- Fixes the "permission denied for function has_role" error when executing RLS policies
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
