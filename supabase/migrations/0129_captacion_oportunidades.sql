-- ============================================================
-- 0129 — Captación de Oportunidades
-- ------------------------------------------------------------
-- Nuevo apartado para registrar y dar seguimiento a oportunidades / contactos
-- estratégicos, clasificados por CATEGORÍA (fundación · organización · empresa ·
-- proyecto · alianza) y por ESTADO (investigación → verificado → enviado).
-- Cada tarjeta lleva: foto/archivo adjunto, contacto, enlace, ubicación y
-- descripción.
--
-- Lo gestionan el ADMIN general y un rol nuevo `captacion` (scoped: solo ve esta
-- sección). Enum-safety: `captacion` se añade a rol_usuario y se usa SOLO por
-- comparación TEXT (nunca cast eager en esta migración), igual que 0125.
-- Idempotente. Tras 0128.
-- ============================================================

alter type public.rol_usuario add value if not exists 'captacion';

-- ¿Pertenece al equipo de Captación? (comparación TEXT → enum-safe)
create or replace function public.es_captacion()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(public.mis_roles()) r where r::text = 'captacion');
$$;
grant execute on function public.es_captacion() to authenticated;

-- Puede gestionar oportunidades: admin general o rol de captación.
create or replace function public.puede_captacion()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or public.es_captacion();
$$;
grant execute on function public.puede_captacion() to authenticated;

-- ── Tabla de oportunidades (tarjetas) ──
create table if not exists public.oportunidades (
  id             uuid primary key default gen_random_uuid(),
  categoria      text not null check (categoria in ('fundacion','organizacion','empresa','proyecto','alianza')),
  estado         text not null default 'investigacion' check (estado in ('investigacion','verificado','enviado')),
  titulo         text not null,
  contacto       text,
  enlace         text,
  ubicacion      text,
  descripcion    text,
  archivo_path   text,          -- foto/archivo en el bucket privado 'oportunidades'
  creado_por     uuid references public.perfiles (id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_oportunidades_cat on public.oportunidades (categoria);
create index if not exists idx_oportunidades_estado on public.oportunidades (estado);

alter table public.oportunidades enable row level security;
drop policy if exists oportunidades_select on public.oportunidades;
create policy oportunidades_select on public.oportunidades for select to authenticated
  using (public.puede_captacion());
drop policy if exists oportunidades_insert on public.oportunidades;
create policy oportunidades_insert on public.oportunidades for insert to authenticated
  with check (public.puede_captacion() and creado_por = auth.uid());
drop policy if exists oportunidades_update on public.oportunidades;
create policy oportunidades_update on public.oportunidades for update to authenticated
  using (public.puede_captacion()) with check (public.puede_captacion());
drop policy if exists oportunidades_delete on public.oportunidades;
create policy oportunidades_delete on public.oportunidades for delete to authenticated
  using (public.puede_captacion());

-- ── Bucket privado para la foto/archivo de cada oportunidad ──
insert into storage.buckets (id, name, public) values ('oportunidades', 'oportunidades', false)
on conflict (id) do nothing;

drop policy if exists oportunidades_obj_select on storage.objects;
create policy oportunidades_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'oportunidades' and public.puede_captacion());
drop policy if exists oportunidades_obj_insert on storage.objects;
create policy oportunidades_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'oportunidades' and public.puede_captacion());
drop policy if exists oportunidades_obj_delete on storage.objects;
create policy oportunidades_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'oportunidades' and public.puede_captacion());
