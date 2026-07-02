-- ============================================================
-- Apoyo por Venezuela — Notificaciones push (Web Push / VAPID)
-- ------------------------------------------------------------
-- Guarda las suscripciones push de cada navegador. El ENVÍO lo hace el
-- Route Handler /api/push (en Vercel), disparado por un Database Webhook de
-- Supabase al insertarse una fila en `notificaciones` (el mismo trigger que
-- ya crea la campana). El envío usa service_role y SALTA estas políticas;
-- la RLS de aquí solo protege que cada quien administre lo suyo desde la app.
-- Idempotente: puede ejecutarse varias veces sin romper nada.
-- ============================================================

create table if not exists public.push_suscripciones (
  id          uuid primary key default gen_random_uuid(),
  perfil_id   uuid not null references public.perfiles (id) on delete cascade,
  endpoint    text not null unique,          -- identifica al navegador ante el push service
  p256dh      text not null,                 -- clave pública del cliente (cifrado del payload)
  auth        text not null,                 -- secreto de autenticación del cliente
  user_agent  text,                          -- para que la persona reconozca el dispositivo
  creado_en   timestamptz not null default now(),
  usado_en    timestamptz
);

create index if not exists idx_push_perfil on public.push_suscripciones (perfil_id);

alter table public.push_suscripciones enable row level security;

-- Cada quien administra SOLO las suscripciones de sus propios navegadores.
drop policy if exists push_select on public.push_suscripciones;
create policy push_select on public.push_suscripciones
  for select using (perfil_id = auth.uid());

drop policy if exists push_insert on public.push_suscripciones;
create policy push_insert on public.push_suscripciones
  for insert with check (perfil_id = auth.uid());

drop policy if exists push_update on public.push_suscripciones;
create policy push_update on public.push_suscripciones
  for update using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

drop policy if exists push_delete on public.push_suscripciones;
create policy push_delete on public.push_suscripciones
  for delete using (perfil_id = auth.uid());
