-- ============================================================
-- 0080 — Digitalización de listados de personas (OCR + confirmación)
-- ------------------------------------------------------------
-- El OCR corre en el navegador (Tesseract.js, sin enviar la imagen a terceros);
-- aquí solo se guardan las líneas ya CONFIRMADAS por una persona y el documento
-- escaneado (bucket privado). Datos personales sensibles → RLS estricta.
--
-- Acceso por tipo de lugar (D-Quién):
--   · Búsqueda (con 2ª verificación): 'hospital' | 'albergue' | 'otro'
--     (heridos / desaparecidos hallados).
--   · Logística: 'acopio' | 'albergue' (personas en centros de acopio).
--   · Admin: todo.
-- Idempotente. Ejecutar tras 0079.
-- ============================================================

-- ── Helpers de autorización ──
-- ¿Puede ver/gestionar listados de un tipo de lugar dado?
create or replace function public.puede_ver_listado(p_tipo text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin()
    or (public.es_busqueda() and public.identidad_aprobada() and p_tipo in ('hospital','albergue','otro'))
    or (public.tiene_rol('logistica') and p_tipo in ('acopio','albergue'));
$$;
grant execute on function public.puede_ver_listado(text) to authenticated;

-- ¿Puede usar la sección de digitalización (subir/escanear)?
create or replace function public.puede_digitalizar()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin()
    or (public.es_busqueda() and public.identidad_aprobada())
    or public.tiene_rol('logistica');
$$;
grant execute on function public.puede_digitalizar() to authenticated;

-- ── Tablas ──
-- Un listado = un documento digitalizado, anclado a un lugar (punto del mapa).
create table if not exists public.listados_digitalizados (
  id             uuid primary key default gen_random_uuid(),
  tipo_lugar     text not null default 'otro' check (tipo_lugar in ('hospital','albergue','acopio','otro')),
  lugar_nombre   text not null,
  punto_acopio_id uuid references public.puntos_acopio (id) on delete set null,
  lat            double precision,
  lng            double precision,
  documento_path text,                       -- scan en el bucket privado 'digitalizacion'
  notas          text,
  creado_por     uuid references public.perfiles (id),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_listados_tipo on public.listados_digitalizados (tipo_lugar, creado_en desc);

-- Una fila por persona ya confirmada (línea por línea).
create table if not exists public.personas_listado (
  id             uuid primary key default gen_random_uuid(),
  listado_id     uuid not null references public.listados_digitalizados (id) on delete cascade,
  nombre_completo text not null,
  cedula         text,
  edad           int check (edad is null or (edad >= 0 and edad <= 130)),
  condicion      text not null default 'otro' check (condicion in ('herido','refugiado','fallecido','sano','desconocida','otro')),
  estado         text,
  notas          text,
  confianza      numeric,                    -- confianza OCR de la línea (0–100)
  confirmada     boolean not null default true,
  creado_por     uuid references public.perfiles (id),
  creado_en      timestamptz not null default now()
);
create index if not exists idx_personas_listado on public.personas_listado (listado_id);
create index if not exists idx_personas_cedula on public.personas_listado (cedula) where cedula is not null;

alter table public.listados_digitalizados enable row level security;
alter table public.personas_listado enable row level security;

-- ── RLS: listados ──
drop policy if exists listados_select on public.listados_digitalizados;
create policy listados_select on public.listados_digitalizados for select to authenticated
  using (public.puede_ver_listado(tipo_lugar));

drop policy if exists listados_insert on public.listados_digitalizados;
create policy listados_insert on public.listados_digitalizados for insert to authenticated
  with check (creado_por = auth.uid() and public.puede_ver_listado(tipo_lugar));

drop policy if exists listados_update on public.listados_digitalizados;
create policy listados_update on public.listados_digitalizados for update to authenticated
  using (public.puede_ver_listado(tipo_lugar)) with check (public.puede_ver_listado(tipo_lugar));

drop policy if exists listados_delete on public.listados_digitalizados;
create policy listados_delete on public.listados_digitalizados for delete to authenticated
  using (public.es_admin() or creado_por = auth.uid());

-- ── RLS: personas (la visibilidad hereda del listado padre) ──
drop policy if exists personas_select on public.personas_listado;
create policy personas_select on public.personas_listado for select to authenticated
  using (exists (select 1 from public.listados_digitalizados l
                 where l.id = listado_id and public.puede_ver_listado(l.tipo_lugar)));

drop policy if exists personas_insert on public.personas_listado;
create policy personas_insert on public.personas_listado for insert to authenticated
  with check (creado_por = auth.uid() and exists (select 1 from public.listados_digitalizados l
              where l.id = listado_id and public.puede_ver_listado(l.tipo_lugar)));

drop policy if exists personas_update on public.personas_listado;
create policy personas_update on public.personas_listado for update to authenticated
  using (exists (select 1 from public.listados_digitalizados l
                 where l.id = listado_id and public.puede_ver_listado(l.tipo_lugar)))
  with check (exists (select 1 from public.listados_digitalizados l
                 where l.id = listado_id and public.puede_ver_listado(l.tipo_lugar)));

drop policy if exists personas_delete on public.personas_listado;
create policy personas_delete on public.personas_listado for delete to authenticated
  using (public.es_admin() or creado_por = auth.uid()
    or exists (select 1 from public.listados_digitalizados l
               where l.id = listado_id and public.puede_ver_listado(l.tipo_lugar)));

-- ── Bucket privado para los documentos escaneados ──
insert into storage.buckets (id, name, public) values ('digitalizacion', 'digitalizacion', false)
on conflict (id) do nothing;

drop policy if exists digitalizacion_select on storage.objects;
create policy digitalizacion_select on storage.objects for select to authenticated
  using (bucket_id = 'digitalizacion' and public.puede_digitalizar());

drop policy if exists digitalizacion_insert on storage.objects;
create policy digitalizacion_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'digitalizacion' and public.puede_digitalizar());

drop policy if exists digitalizacion_delete on storage.objects;
create policy digitalizacion_delete on storage.objects for delete to authenticated
  using (bucket_id = 'digitalizacion' and public.puede_digitalizar());
