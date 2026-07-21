
CREATE TYPE public.app_role AS ENUM ('admin', 'musico', 'som');
CREATE TYPE public.track_route AS ENUM ('musicos', 'som', 'both');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, must_change_password)
  VALUES (NEW.id, NEW.email, COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, true))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  bpm INTEGER,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.songs TO authenticated;
GRANT ALL ON public.songs TO service_role;
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "songs read all authenticated" ON public.songs FOR SELECT TO authenticated USING (true);
CREATE POLICY "songs admin write" ON public.songs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime TEXT,
  duration_seconds NUMERIC,
  route public.track_route NOT NULL DEFAULT 'both',
  volume NUMERIC NOT NULL DEFAULT 1.0,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracks TO authenticated;
GRANT ALL ON public.tracks TO service_role;
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tracks read by role" ON public.tracks FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin')
  OR (public.has_role(auth.uid(),'musico') AND route IN ('musicos','both'))
  OR (public.has_role(auth.uid(),'som') AND route IN ('som','both'))
);
CREATE POLICY "tracks admin write" ON public.tracks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.playback_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  current_song_id UUID REFERENCES public.songs(id) ON DELETE SET NULL,
  is_playing BOOLEAN NOT NULL DEFAULT false,
  position_seconds NUMERIC NOT NULL DEFAULT 0,
  started_at_ms BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.playback_state (id) VALUES (1);
GRANT SELECT ON public.playback_state TO authenticated;
GRANT ALL ON public.playback_state TO service_role;
ALTER TABLE public.playback_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "playback read auth" ON public.playback_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "playback admin write" ON public.playback_state FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.playback_state;
ALTER TABLE public.playback_state REPLICA IDENTITY FULL;

CREATE POLICY "tracks bucket read by role" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'tracks' AND (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'musico')
    OR public.has_role(auth.uid(),'som')
  )
);
CREATE POLICY "tracks bucket admin write" ON storage.objects FOR ALL TO authenticated
USING (bucket_id='tracks' AND public.has_role(auth.uid(),'admin'))
WITH CHECK (bucket_id='tracks' AND public.has_role(auth.uid(),'admin'));

DO $$
DECLARE admin_id UUID;
BEGIN
  SELECT id INTO admin_id FROM auth.users WHERE email='luizrogeriopx@gmail.com';
  IF admin_id IS NULL THEN
    admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated','authenticated',
      'luizrogeriopx@gmail.com', crypt('123456', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      '{"must_change_password":true}'::jsonb,
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), admin_id, admin_id::text,
      format('{"sub":"%s","email":"%s"}', admin_id, 'luizrogeriopx@gmail.com')::jsonb,
      'email', now(), now(), now());
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (admin_id, 'admin') ON CONFLICT DO NOTHING;
END $$;
