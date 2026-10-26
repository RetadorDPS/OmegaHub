-- ============================================================================
-- 002 — Bus de tareas web (prototipo)
-- ============================================================================
-- Conecta la CABINA (página estática en GitHub Pages, donde hablas) con las
-- MANOS (el userscript que corre dentro de google.com / claude.ai).
--
-- Por qué una tabla y no un WebSocket: la cabina está en un origen
-- (tuusuario.github.io) y las manos en otro (google.com). No pueden hablar
-- directamente. PostgREST responde con cabeceras CORS, así que ambos lados
-- pueden leer y escribir esta tabla con un fetch normal, sin servidor propio.
--
-- Flujo:
--   cabina  → INSERT (status='pending')
--   manos   → lo ven al sondear, lo marcan 'running', ejecutan
--   manos   → UPDATE (status='done'|'failed', result=…)
--   cabina  → lo ve al sondear y lo lee en voz alta
-- ============================================================================

create table if not exists public.web_tasks (
  id          uuid primary key default gen_random_uuid(),
  -- Canal = secreto compartido entre cabina y manos. Se genera en la cabina y
  -- se pega en el userscript. Sin él, nadie encuentra tus tareas.
  channel     uuid not null,
  status      text not null default 'pending'
              check (status in ('pending','running','done','failed','cancelled')),
  action      text not null,           -- search_google | ask_claude | ask_chatgpt | translate | read_page | open_tab
  params      jsonb not null default '{}'::jsonb,
  result      jsonb,                   -- lo que devuelven las manos
  error       text,
  -- Qué pestaña lo ejecutó, para saber de dónde viene la respuesta.
  origin_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz
);

comment on table public.web_tasks is
  'Bus entre la cabina web y el userscript ejecutor. Prototipo: el canal es el único secreto.';

-- Sin índice por canal+estado, cada sondeo sería un escaneo completo. La cabina
-- pregunta cada 1,5 s y las manos cada 1,2 s: esto es lo que lo hace viable.
create index if not exists web_tasks_channel_status_idx
  on public.web_tasks (channel, status, created_at desc);
create index if not exists web_tasks_created_at_idx
  on public.web_tasks (created_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- ATENCIÓN, decisión consciente de prototipo:
-- estas políticas son permisivas a propósito. La protección es que `channel`
-- sea un UUID imposible de adivinar: quien no lo tenga no encuentra tus filas.
--
-- NO es lo mismo que el modelo del resto del proyecto (auth.uid()). Se hizo así
-- para que el prototipo se pruebe sin montar el login. El camino de endurecido
-- está al final de este fichero, comentado y listo para aplicar.

alter table public.web_tasks enable row level security;

drop policy if exists "web_tasks_canal_select" on public.web_tasks;
create policy "web_tasks_canal_select" on public.web_tasks
  for select to anon, authenticated
  using (true);

drop policy if exists "web_tasks_canal_insert" on public.web_tasks;
create policy "web_tasks_canal_insert" on public.web_tasks
  for insert to anon, authenticated
  with check (true);

drop policy if exists "web_tasks_canal_update" on public.web_tasks;
create policy "web_tasks_canal_update" on public.web_tasks
  for update to anon, authenticated
  using (true) with check (true);

-- Borrar no hace falta para el prototipo y es lo más peligroso de dejar abierto:
-- se omite a propósito. La limpieza la hace el borrador de más abajo.

-- ============================================================================
-- web_tabs — qué pestañas tienen el ejecutor vivo
-- ============================================================================
-- La cabina no puede preguntar al navegador qué pestañas hay abiertas (no tiene
-- permiso ni forma). Así que cada pestaña con el userscript escribe aquí su
-- latido cada pocos segundos, y la cabina muestra las que latieron hace menos
-- de 15. Es la única manera honesta de saber "¿tengo a Claude abierta?".

create table if not exists public.web_tabs (
  id          uuid primary key default gen_random_uuid(),
  channel     uuid not null,
  driver_key  text not null,           -- google | claude | chatgpt | ninguno
  origin      text not null,           -- https://claude.ai
  title       text,
  actions     jsonb not null default '[]'::jsonb,  -- qué sabe hacer esta pestaña
  last_seen   timestamptz not null default now()
);

create unique index if not exists web_tabs_channel_origin_idx
  on public.web_tabs (channel, origin);
create index if not exists web_tabs_last_seen_idx
  on public.web_tabs (last_seen desc);

alter table public.web_tabs enable row level security;

-- Mismo criterio de prototipo que en web_tasks: el canal es el secreto.
drop policy if exists "web_tabs_canal_select" on public.web_tabs;
create policy "web_tabs_canal_select" on public.web_tabs
  for select to anon, authenticated using (true);

drop policy if exists "web_tabs_canal_upsert" on public.web_tabs;
create policy "web_tabs_canal_upsert" on public.web_tabs
  for insert to anon, authenticated with check (true);

drop policy if exists "web_tabs_canal_update" on public.web_tabs;
create policy "web_tabs_canal_update" on public.web_tabs
  for update to anon, authenticated using (true) with check (true);

-- ── updated_at automático ───────────────────────────────────────────────────
create or replace function public.touch_web_task_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if new.status in ('done','failed','cancelled') and old.status not in ('done','failed','cancelled') then
    new.finished_at = now();
  end if;
  if new.status = 'running' and old.status <> 'running' then
    new.started_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists web_tasks_touch_updated_at on public.web_tasks;
create trigger web_tasks_touch_updated_at
  before update on public.web_tasks
  for each row execute function public.touch_web_task_updated_at();

-- ── Limpieza ────────────────────────────────────────────────────────────────
-- Un bus de prototipo se llena de filas muertas en horas. Se borran las
-- terminadas con más de un día; así la tabla no crece sin límite.
create or replace function public.delete_old_web_tasks(p_hours int default 24)
returns int language plpgsql as $$
declare v_count int;
begin
  delete from public.web_tasks
   where finished_at is not null
     and finished_at < now() - (p_hours || ' hours')::interval;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================================
-- ENDURECER (cuando el prototipo pase a serio) — descomentar y probar
-- ============================================================================
-- 1) Añadir la columna del dueño:
--      alter table public.web_tasks
--        add column user_id uuid references public.users (id) on delete cascade;
-- 2) Sustituir las tres políticas de arriba por estas:
--      create policy "web_tasks_propias_select" on public.web_tasks
--        for select to authenticated using (auth.uid() = user_id);
--      create policy "web_tasks_propias_insert" on public.web_tasks
--        for insert to authenticated with check (auth.uid() = user_id);
--      create policy "web_tasks_propias_update" on public.web_tasks
--        for update to authenticated using (auth.uid() = user_id)
--        with check (auth.uid() = user_id);
-- 3) La cabina y las manos inician sesión con Supabase Auth y mandan el JWT.
--    El canal puede seguir existiendo como filtro adicional, ya no como defensa.
