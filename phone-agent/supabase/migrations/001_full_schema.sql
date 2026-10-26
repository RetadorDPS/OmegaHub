-- ============================================================================
-- Phone Agent — 001_full_schema.sql
-- Esquema completo: 8 tablas, RLS, índices, triggers, seed y bucket screenshots.
-- Pegar en: Supabase Dashboard > SQL Editor > New query > Run
--        o: supabase db push (con CLI y este archivo en supabase/migrations/)
-- ============================================================================

-- Las extensiones van dentro de DO blocks: si el plan de Supabase no permite
-- crearlas, se avisa y el script SIGUE. Un "create extension" suelto que falle
-- abortaría la migración entera y no se crearía ni una tabla.
do $$
begin
  create extension if not exists "pgcrypto" with schema extensions;
exception when others then
  raise notice 'pgcrypto no disponible (%). gen_random_uuid() seguirá funcionando si ya existe.', sqlerrm;
end;
$$;

-- pg_cron solo existe si lo activaste en Dashboard > Database > Extensions.
-- No es imprescindible: delete_old_screenshots() también se invoca desde la
-- Edge Function check-alerts (ver su programación en el README §3.5).
do $$
begin
  create extension if not exists "pg_cron" with schema extensions;
exception when others then
  raise notice 'pg_cron no disponible (%). Actívalo en el dashboard o confía en check-alerts.', sqlerrm;
end;
$$;

-- ----------------------------------------------------------------------------
-- Trigger genérico: auto-update de updated_at
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 1) users — perfil espejo de auth.users
-- ============================================================================
create table if not exists public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  display_name text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_users_created_at on public.users (created_at desc);
drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at before update on public.users
  for each row execute function public.set_updated_at();

-- Crea el perfil automáticamente al registrarse un usuario en Auth.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 2) app_drivers — catálogo de apps autorizadas (CORE + PLUGINS)
--    Agregar una app nueva = 1 clase Driver en Android + 1 fila aquí.
--    user_id NULL = driver global del sistema. user_id NOT NULL = autorización
--    y/o copia personalizada de un usuario concreto.
-- ============================================================================
create table if not exists public.app_drivers (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.users (id) on delete cascade,
  driver_key        text not null,               -- 'claude', 'claude_dual', 'chatgpt', 'whatsapp'
  display_name      text not null,
  package_name      text not null,               -- package principal detectado
  package_patterns  jsonb not null default '[]'::jsonb,  -- patrones para clones/duales
  is_dual_variant   boolean not null default false,
  base_driver_key   text,                        -- driver del que hereda (clones)
  enabled           boolean not null default true,   -- activo en el sistema
  authorized        boolean not null default false,  -- autorizado por el usuario
  allowed_actions   jsonb not null default '["open_app","tap","swipe","scroll","type","read","verify","wait","back","home","long_press","clear_text","press_enter"]'::jsonb,
  detection_rules   jsonb not null default '{}'::jsonb,
  ui_map            jsonb not null default '{}'::jsonb,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists uq_app_drivers_global
  on public.app_drivers (driver_key) where user_id is null;
create unique index if not exists uq_app_drivers_user
  on public.app_drivers (user_id, driver_key) where user_id is not null;
create index if not exists idx_app_drivers_user_created on public.app_drivers (user_id, created_at desc);
create index if not exists idx_app_drivers_package on public.app_drivers (package_name);
drop trigger if exists trg_app_drivers_updated_at on public.app_drivers;
create trigger trg_app_drivers_updated_at before update on public.app_drivers
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 3) projects — contexto de trabajo que el agente recuerda entre sesiones
-- ============================================================================
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  name          text not null,
  phase         text not null default 'inicio',
  summary       text not null default '',
  pending_items jsonb not null default '[]'::jsonb,
  context       jsonb not null default '{}'::jsonb,
  is_active     boolean not null default false,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_projects_user_created on public.projects (user_id, created_at desc);
create index if not exists idx_projects_user_active on public.projects (user_id, is_active);
drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 4) agent_sessions — una fila por comando de voz ejecutado
-- ============================================================================
create table if not exists public.agent_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  project_id     uuid references public.projects (id) on delete set null,
  voice_command  text not null,
  status         text not null default 'planning'
                 check (status in ('planning','running','waiting_confirmation','completed','failed','cancelled')),
  autonomy_level text not null default 'draft' check (autonomy_level in ('read','draft','act')),
  current_app    text,
  plan           jsonb not null default '{}'::jsonb,
  result_summary text,
  error_message  text,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_sessions_user_created on public.agent_sessions (user_id, created_at desc);
create index if not exists idx_sessions_user_status on public.agent_sessions (user_id, status, created_at desc);
drop trigger if exists trg_sessions_updated_at on public.agent_sessions;
create trigger trg_sessions_updated_at before update on public.agent_sessions
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 5) session_steps — cada acción atómica ejecutada y su verificación
-- ============================================================================
create table if not exists public.session_steps (
  id                    uuid primary key default gen_random_uuid(),
  session_id            uuid not null references public.agent_sessions (id) on delete cascade,
  user_id               uuid not null references public.users (id) on delete cascade,
  step_number           integer not null,
  action_type           text not null, -- tap|swipe|type|scroll|wait|open_app|read|verify|back|home|long_press|clear_text|press_enter|request_confirmation|done
  action_params         jsonb not null default '{}'::jsonb,
  expected_result       text,
  screen_analysis       text,
  screenshot_before_url text,
  screenshot_after_url  text,
  verification          jsonb not null default '{}'::jsonb,
  status                text not null default 'pending'
                        check (status in ('pending','executing','verified','failed','skipped','needs_confirmation')),
  confidence            numeric(4,3),
  requires_confirmation boolean not null default false,
  error_message         text,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (session_id, step_number)
);
create index if not exists idx_steps_user_created on public.session_steps (user_id, created_at desc);
create index if not exists idx_steps_session on public.session_steps (session_id, step_number);
drop trigger if exists trg_steps_updated_at on public.session_steps;
create trigger trg_steps_updated_at before update on public.session_steps
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 6) macros — secuencias reutilizables grabadas por el usuario
-- ============================================================================
create table if not exists public.macros (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  name          text not null,
  description   text not null default '',
  driver_key    text,
  trigger_phrase text,
  steps         jsonb not null default '[]'::jsonb,
  enabled       boolean not null default true,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_macros_user_created on public.macros (user_id, created_at desc);
drop trigger if exists trg_macros_updated_at on public.macros;
create trigger trg_macros_updated_at before update on public.macros
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 7) capability_config — módulos activables: vision, voice, memory, planner…
-- ============================================================================
create table if not exists public.capability_config (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.users (id) on delete cascade, -- NULL = default global
  capability_key text not null, -- vision | voice | memory | planner | alerts
  enabled       boolean not null default true,
  model         text,           -- ej. claude-sonnet-4-20250514
  autonomy_level text not null default 'draft' check (autonomy_level in ('read','draft','act')),
  settings      jsonb not null default '{}'::jsonb,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists uq_capability_global
  on public.capability_config (capability_key) where user_id is null;
create unique index if not exists uq_capability_user
  on public.capability_config (user_id, capability_key) where user_id is not null;
create index if not exists idx_capability_user_created on public.capability_config (user_id, created_at desc);
drop trigger if exists trg_capability_updated_at on public.capability_config;
create trigger trg_capability_updated_at before update on public.capability_config
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 8) event_log — telemetría, errores y base del sistema de alertas (Fase 2)
-- ============================================================================
create table if not exists public.event_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.users (id) on delete cascade,
  session_id uuid references public.agent_sessions (id) on delete set null,
  level      text not null default 'info' check (level in ('debug','info','warn','error')),
  source     text not null default 'android', -- android | plan-task | verify-and-next | complete-session | check-alerts
  event_type text not null,
  message    text not null default '',
  payload    jsonb not null default '{}'::jsonb,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_eventlog_user_created on public.event_log (user_id, created_at desc);
create index if not exists idx_eventlog_type_created on public.event_log (event_type, created_at desc);
create index if not exists idx_eventlog_level_created on public.event_log (level, created_at desc);

-- ============================================================================
-- ROW LEVEL SECURITY — en TODAS las tablas
-- ============================================================================
alter table public.users             enable row level security;
alter table public.app_drivers       enable row level security;
alter table public.projects          enable row level security;
alter table public.agent_sessions    enable row level security;
alter table public.session_steps     enable row level security;
alter table public.macros            enable row level security;
alter table public.capability_config enable row level security;
alter table public.event_log         enable row level security;

-- users: cada quien solo su perfil
drop policy if exists "users_self_all" on public.users;
create policy "users_self_all" on public.users
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- app_drivers: lectura de globales + propios; escritura solo propios.
-- (Las Edge Functions usan service_role y saltan RLS.)
drop policy if exists "drivers_read" on public.app_drivers;
create policy "drivers_read" on public.app_drivers
  for select using (user_id is null or auth.uid() = user_id);
drop policy if exists "drivers_write_own" on public.app_drivers;
create policy "drivers_write_own" on public.app_drivers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "projects_own" on public.projects;
create policy "projects_own" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "sessions_own" on public.agent_sessions;
create policy "sessions_own" on public.agent_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "steps_own" on public.session_steps;
create policy "steps_own" on public.session_steps
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "macros_own" on public.macros;
create policy "macros_own" on public.macros
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "capability_read" on public.capability_config;
create policy "capability_read" on public.capability_config
  for select using (user_id is null or auth.uid() = user_id);
drop policy if exists "capability_write_own" on public.capability_config;
create policy "capability_write_own" on public.capability_config
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "eventlog_own_select" on public.event_log;
create policy "eventlog_own_select" on public.event_log
  for select using (auth.uid() = user_id);
drop policy if exists "eventlog_own_insert" on public.event_log;
create policy "eventlog_own_insert" on public.event_log
  for insert with check (auth.uid() = user_id or user_id is null);

-- ============================================================================
-- STORAGE — bucket 'screenshots' (privado) + auto-borrado a las 24 h
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', false)
on conflict (id) do nothing;

drop policy if exists "screenshots_read_own" on storage.objects;
create policy "screenshots_read_own" on storage.objects
  for select using (bucket_id = 'screenshots' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "screenshots_write_own" on storage.objects;
create policy "screenshots_write_own" on storage.objects
  for insert with check (bucket_id = 'screenshots' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "screenshots_delete_own" on storage.objects;
create policy "screenshots_delete_own" on storage.objects
  for delete using (bucket_id = 'screenshots' and auth.uid()::text = (storage.foldername(name))[1]);

-- Borra objetos del bucket con más de 24 h. Devuelve cuántos eliminó.
create or replace function public.delete_old_screenshots()
returns integer language plpgsql security definer set search_path = public, storage as $$
declare v_count integer;
begin
  delete from storage.objects
  where bucket_id = 'screenshots' and created_at < now() - interval '24 hours';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Programa el borrado diario si pg_cron está disponible (no falla si no lo está).
do $$
begin
  perform cron.schedule('phone-agent-clean-screenshots', '17 3 * * *',
    $job$ select public.delete_old_screenshots(); $job$);
exception when others then
  raise notice 'pg_cron no disponible (%). Llama delete_old_screenshots() desde check-alerts.', sqlerrm;
end;
$$;

-- ============================================================================
-- SEED — las 4 apps del MVP + config de capacidades por defecto
-- Idempotente: se puede ejecutar las veces que quieras.
-- Uso:  select public.seed_initial_data();                      -- global
--       select public.seed_initial_data('uuid-del-usuario');    -- por usuario
-- ============================================================================
create or replace function public.seed_initial_data(p_user_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- ---------- Claude (normal) ----------
  insert into public.app_drivers
    (user_id, driver_key, display_name, package_name, package_patterns,
     is_dual_variant, base_driver_key, enabled, authorized, allowed_actions,
     detection_rules, ui_map, metadata)
  values (
    p_user_id, 'claude', 'Claude', 'com.anthropic.claude',
    '["com.anthropic.claude"]'::jsonb,
    false, null, true, false,
    '["open_app","tap","swipe","scroll","type","read","verify","wait","back","home","long_press","clear_text","press_enter"]'::jsonb,
    '{"strategy":"exact_package","known_packages":["com.anthropic.claude"]}'::jsonb,
    '{
       "app_kind": "assistant",
       "input_hints": ["Message Claude", "Escribe un mensaje", "How can I help you?"],
       "send_button_descriptions": ["Send message", "Enviar mensaje", "Send"],
       "new_chat_texts": ["New chat", "Nuevo chat"],
       "drawer_texts": ["Recents", "Recientes", "Chats"],
       "account_texts": ["Settings", "Ajustes", "Account"],
       "model_texts": ["Sonnet", "Opus", "Haiku"],
       "stop_texts": ["Stop response", "Detener"]
     }'::jsonb,
    '{"vendor":"Anthropic","mvp":true}'::jsonb)
  on conflict do nothing;

  -- ---------- Claude Dual (clonada) ----------
  insert into public.app_drivers
    (user_id, driver_key, display_name, package_name, package_patterns,
     is_dual_variant, base_driver_key, enabled, authorized, allowed_actions,
     detection_rules, ui_map, metadata)
  values (
    p_user_id, 'claude_dual', 'Claude Dual', 'com.anthropic.claude',
    '["com.anthropic.claude", "%.dual", "%.clone", "%dual%claude%", "%claude%dual%", "com.lbe.parallel%", "com.parallel.space%", "com.excelliance.multiaccount%", "com.dualspace%"]'::jsonb,
    true, 'claude', true, false,
    '["open_app","tap","swipe","scroll","type","read","verify","wait","back","home","long_press","clear_text","press_enter"]'::jsonb,
    '{"strategy":"dynamic","note":"La app clonada comparte package o vive en un perfil de usuario secundario (Dual Messenger / Parallel Space). Android la resuelve con DualAppDetector: perfiles de usuario + LauncherApps + patrones de package.","profile_strategies":["secondary_user_profile","work_profile","clone_package_pattern"]}'::jsonb,
    '{
       "app_kind": "assistant",
       "input_hints": ["Message Claude", "Escribe un mensaje", "How can I help you?"],
       "send_button_descriptions": ["Send message", "Enviar mensaje", "Send"],
       "new_chat_texts": ["New chat", "Nuevo chat"],
       "drawer_texts": ["Recents", "Recientes", "Chats"],
       "account_texts": ["Settings", "Ajustes", "Account"],
       "model_texts": ["Sonnet", "Opus", "Haiku"],
       "stop_texts": ["Stop response", "Detener"]
     }'::jsonb,
    '{"vendor":"Anthropic","mvp":true,"dual":true}'::jsonb)
  on conflict do nothing;

  -- ---------- ChatGPT ----------
  insert into public.app_drivers
    (user_id, driver_key, display_name, package_name, package_patterns,
     is_dual_variant, base_driver_key, enabled, authorized, allowed_actions,
     detection_rules, ui_map, metadata)
  values (
    p_user_id, 'chatgpt', 'ChatGPT', 'com.openai.chatgpt',
    '["com.openai.chatgpt"]'::jsonb,
    false, null, true, false,
    '["open_app","tap","swipe","scroll","type","read","verify","wait","back","home","long_press","clear_text","press_enter"]'::jsonb,
    '{"strategy":"exact_package","known_packages":["com.openai.chatgpt"]}'::jsonb,
    '{
       "app_kind": "assistant",
       "input_hints": ["Message ChatGPT", "Pregunta lo que sea", "Ask anything"],
       "send_button_descriptions": ["Send message", "Enviar mensaje", "Send prompt"],
       "new_chat_texts": ["New chat", "Nuevo chat"],
       "drawer_texts": ["Search chats", "Buscar chats", "Library", "Biblioteca"],
       "account_texts": ["Settings", "Ajustes", "Personalization"],
       "model_texts": ["GPT-4o", "GPT-5", "o4"],
       "stop_texts": ["Stop generating", "Detener"]
     }'::jsonb,
    '{"vendor":"OpenAI","mvp":true}'::jsonb)
  on conflict do nothing;

  -- ---------- WhatsApp ----------
  insert into public.app_drivers
    (user_id, driver_key, display_name, package_name, package_patterns,
     is_dual_variant, base_driver_key, enabled, authorized, allowed_actions,
     detection_rules, ui_map, metadata)
  values (
    p_user_id, 'whatsapp', 'WhatsApp', 'com.whatsapp',
    '["com.whatsapp", "com.whatsapp.w4b"]'::jsonb,
    false, null, true, false,
    '["open_app","tap","swipe","scroll","type","read","verify","wait","back","home","long_press","clear_text","press_enter"]'::jsonb,
    '{"strategy":"exact_package","known_packages":["com.whatsapp","com.whatsapp.w4b"]}'::jsonb,
    '{
       "app_kind": "messaging",
       "input_hints": ["Message", "Mensaje", "Escribe un mensaje"],
       "send_button_descriptions": ["Send", "Enviar"],
       "search_texts": ["Search", "Buscar", "Search name or number"],
       "new_chat_texts": ["New chat", "Nuevo chat"],
       "tabs": ["Chats", "Updates", "Novedades", "Calls", "Llamadas", "Communities", "Comunidades"],
       "attach_descriptions": ["Attach", "Adjuntar"]
     }'::jsonb,
    '{"vendor":"Meta","mvp":true}'::jsonb)
  on conflict do nothing;

  -- ---------- Capacidades por defecto ----------
  insert into public.capability_config (user_id, capability_key, enabled, model, autonomy_level, settings)
  values
    (p_user_id, 'planner', true, 'claude-sonnet-4-20250514', 'draft',
     '{"max_steps": 25, "step_timeout_ms": 45000, "verify_each_step": true}'::jsonb),
    (p_user_id, 'vision', true, 'claude-sonnet-4-20250514', 'draft',
     '{"jpeg_quality": 80, "max_width_px": 1080, "send_ui_tree": true}'::jsonb),
    (p_user_id, 'voice', true, null, 'draft',
     '{"language": "es-ES", "wake_word": "oye agente", "tts_language": "es-ES"}'::jsonb),
    (p_user_id, 'memory', true, null, 'draft',
     '{"update_project_on_complete": true}'::jsonb),
    (p_user_id, 'alerts', true, null, 'read',
     '{"error_burst_threshold": 3, "failed_steps_threshold": 5, "stuck_minutes": 15}'::jsonb)
  on conflict do nothing;
end;
$$;

-- Seed global inmediato (drivers del sistema + config por defecto).
select public.seed_initial_data(null);
