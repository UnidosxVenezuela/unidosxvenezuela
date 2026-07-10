-- ============================================================
-- 0139 — Telegram como canal de notificaciones (Bot API)
-- ------------------------------------------------------------
-- Tercer canal de aviso, ADITIVO a la campana in-app y al web-push. La persona
-- vincula su Telegram UNA sola vez con un enlace profundo
-- `t.me/<bot>?start=<token>`; a partir de ahí, cada aviso que hoy sale por push
-- también le llega por Telegram, con un botón que abre la app (protegida por
-- RLS). Quien no vincule sigue igual (campana + push).
--
-- Blindaje (NNA / datos sensibles): el mensaje de Telegram reutiliza el titular
-- discreto (0123) — sin nombres de menores ni datos de víctimas — y el botón es
-- un deep-link a la app RLS-gated. Telegram nunca transporta el dato sensible.
--
-- * perfiles.telegram_chat_id / telegram_username: el chat vinculado. Auto-
--   editable por la propia persona (NO va a la lista negra
--   `proteger_campos_perfil` de 0124, que solo protege rol/verificado/
--   roles_extra; precedente: whatsapp 0045, estado_presencia 0117).
-- * telegram_enlaces: tokens de un solo uso (15 min) para la vinculación. El
--   webhook del bot valida el token con service_role (bypassa RLS) y escribe el
--   chat_id; estas políticas RLS son para que la persona gestione, desde
--   /perfil, sus propios tokens.
-- Idempotente. Ejecutar tras 0138.
-- ============================================================

-- ── Columnas en perfiles (el chat de Telegram vinculado) ──
alter table public.perfiles add column if not exists telegram_chat_id text;
alter table public.perfiles add column if not exists telegram_username text;

-- Un chat de Telegram ↔ una sola cuenta (molde: whatsapp 0045).
create unique index if not exists idx_perfiles_telegram_chat
  on public.perfiles (telegram_chat_id) where telegram_chat_id is not null;

-- ── Tabla de tokens de vinculación (un solo uso) ──
create table if not exists public.telegram_enlaces (
  token      text primary key,
  perfil_id  uuid not null references public.perfiles (id) on delete cascade,
  creado_en  timestamptz not null default now(),
  expira_en  timestamptz not null,
  usado_en   timestamptz
);
create index if not exists idx_telegram_enlaces_perfil on public.telegram_enlaces (perfil_id);

alter table public.telegram_enlaces enable row level security;

-- La persona gestiona SUS propios tokens (crear/leer/borrar) desde /perfil. No
-- hay UPDATE de usuario: el webhook marca `usado_en` con service_role, que
-- bypassa RLS (molde de per-fila: verificaciones_identidad 0063).
drop policy if exists te_select on public.telegram_enlaces;
create policy te_select on public.telegram_enlaces for select to authenticated
  using (perfil_id = auth.uid());

drop policy if exists te_insert on public.telegram_enlaces;
create policy te_insert on public.telegram_enlaces for insert to authenticated
  with check (perfil_id = auth.uid());

drop policy if exists te_delete on public.telegram_enlaces;
create policy te_delete on public.telegram_enlaces for delete to authenticated
  using (perfil_id = auth.uid());
