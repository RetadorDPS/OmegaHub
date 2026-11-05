-- =====================================================================
--  MAZE RUNNER MOBILE — Esquema de backend (Supabase / PostgreSQL)
--  Ejecuta este script en el SQL Editor de tu proyecto Supabase.
--  Compatible con el cliente REST que usa el juego (src/storage.js).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensiones
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. Perfiles de corredores (los habitantes del Área)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id            UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    total_runs    INT   DEFAULT 0,
    best_escape_time FLOAT DEFAULT NULL,
    sector_record INT   DEFAULT 1
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Perfiles visibles por todos" ON public.profiles;
CREATE POLICY "Perfiles visibles por todos"
    ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "El usuario edita su perfil" ON public.profiles;
CREATE POLICY "El usuario edita su perfil"
    ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "El usuario crea su perfil" ON public.profiles;
CREATE POLICY "El usuario crea su perfil"
    ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Crea el perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)))
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. Semillas diarias y configuración de sectores
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_mazes (
    id                   BIGSERIAL PRIMARY KEY,
    maze_date            DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
    seed_value           INT  NOT NULL,
    active_sectors       INT  DEFAULT 8,
    underground_unlocked BOOLEAN DEFAULT true,
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.daily_mazes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Semilla diaria legible por autenticados" ON public.daily_mazes;
CREATE POLICY "Semilla diaria legible por autenticados"
    ON public.daily_mazes FOR SELECT USING (true);   -- abierto: el juego la lee con la anon key

DROP POLICY IF EXISTS "Semilla diaria escribible" ON public.daily_mazes;
CREATE POLICY "Semilla diaria escribible"
    ON public.daily_mazes FOR INSERT WITH CHECK (true);

-- Devuelve (y crea si no existe) la semilla del día.
-- Uso desde el cliente:  POST /rest/v1/rpc/get_daily_seed
CREATE OR REPLACE FUNCTION public.get_daily_seed()
RETURNS INT AS $$
DECLARE
    v_date DATE := CURRENT_DATE;
    v_seed INT;
BEGIN
    SELECT seed_value INTO v_seed FROM public.daily_mazes WHERE maze_date = v_date;
    IF v_seed IS NULL THEN
        v_seed := (abs(hashtext(v_date::text)) % 900000) + 100000;
        INSERT INTO public.daily_mazes (maze_date, seed_value)
        VALUES (v_date, v_seed)
        ON CONFLICT (maze_date) DO NOTHING;
    END IF;
    RETURN v_seed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------
-- 3. Clasificación de escapes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leaderboard (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    username            TEXT NOT NULL,
    escape_time_seconds FLOAT NOT NULL,
    sector_reached      INT  DEFAULT 1,
    seed_used           INT  DEFAULT NULL,
    completed_at        TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS leaderboard_time_idx  ON public.leaderboard (escape_time_seconds ASC);
CREATE INDEX IF NOT EXISTS leaderboard_user_idx  ON public.leaderboard (user_id);

ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clasificación pública" ON public.leaderboard;
CREATE POLICY "Clasificación pública"
    ON public.leaderboard FOR SELECT USING (true);

-- El prototipo web envía el nombre sin sesión: permitimos el inserto anónimo.
DROP POLICY IF EXISTS "Registrar tiempos" ON public.leaderboard;
CREATE POLICY "Registrar tiempos"
    ON public.leaderboard FOR INSERT WITH CHECK (true);

-- Vista del top 10
CREATE OR REPLACE VIEW public.leaderboard_top AS
    SELECT username, escape_time_seconds, sector_reached, completed_at
    FROM public.leaderboard
    ORDER BY escape_time_seconds ASC
    LIMIT 10;

-- ---------------------------------------------------------------------
-- 4. Datos de ejemplo (opcional)
-- ---------------------------------------------------------------------
INSERT INTO public.daily_mazes (maze_date, seed_value)
VALUES (CURRENT_DATE, (abs(hashtext(CURRENT_DATE::text)) % 900000) + 100000)
ON CONFLICT (maze_date) DO NOTHING;

-- =====================================================================
--  Notas de integración
--  · REST:  GET  {URL}/rest/v1/leaderboard?select=*&order=escape_time_seconds.asc&limit=10
--           POST {URL}/rest/v1/leaderboard   {username, escape_time_seconds, sector_reached}
--  · RPC :  POST {URL}/rest/v1/rpc/get_daily_seed   body "{}"
--  · Cabeceras: apikey + Authorization: Bearer <anon key>
--  · Si quieres ranking estrictamente por usuario autenticado, cambia la
--    política de INSERT a: WITH CHECK (auth.uid() = user_id).
-- =====================================================================
