-- ============================================================
-- 0050 — Módulo de Insumos / Logística
-- ============================================================
-- Organiza la ayuda a los centros de acopio: solicitudes de insumos con flujo
-- (Solicitado → En gestión → En ruta → Entregado), directorio de proveedores,
-- envíos (voluntario + tipo de vehículo + flete) y donaciones.
--
-- Rol nuevo 'logistica'. Lectura para cualquier verificado; crear una solicitud
-- lo puede hacer cualquier verificado (el pedido puede venir de campo); la
-- gestión (avanzar, proveedores, envíos, donaciones) es de puede_logistica().
-- Idempotente.
-- ============================================================

alter type public.rol_usuario add value if not exists 'logistica';

do $$ begin create type public.tipo_insumo as enum ('medicamentos','alimentos','agua','higiene','refugio','otro'); exception when duplicate_object then null; end $$;
do $$ begin create type public.estado_insumo as enum ('solicitado','en_gestion','en_ruta','entregado','cancelado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.estado_donacion as enum ('comprometida','recibida','asignada'); exception when duplicate_object then null; end $$;

-- ¿Puede gestionar logística? admin/coordinador/logistica. plpgsql para no chocar
-- con el valor de enum recién agregado en la misma migración.
create or replace function public.puede_logistica()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return public.tiene_rol('admin') or public.tiene_rol('coordinador') or public.tiene_rol('logistica');
end $$;
grant execute on function public.puede_logistica() to authenticated;

-- Proveedores / transportistas
create table if not exists public.proveedores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  tipo       text,                 -- farmacia, mayorista, transportista, otro
  contacto   text,                 -- teléfono / whatsapp
  notas      text,
  creado_por uuid references public.perfiles (id) on delete set null,
  creado_en  timestamptz not null default now()
);

-- Solicitudes de insumo (el tablero)
create table if not exists public.solicitudes_insumo (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null,
  tipo           public.tipo_insumo not null default 'otro',
  descripcion    text,
  cantidad       text,             -- libre: "50 cajas", "200 kg"
  urgencia       public.prioridad not null default 'media',
  estado         public.estado_insumo not null default 'solicitado',
  punto_id       uuid references public.puntos_acopio (id) on delete set null,
  proveedor_id   uuid references public.proveedores (id) on delete set null,
  solicitado_por uuid references public.perfiles (id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_solins_estado on public.solicitudes_insumo (estado);

-- Envíos (transporte de una solicitud)
create table if not exists public.envios (
  id            uuid primary key default gen_random_uuid(),
  solicitud_id  uuid not null references public.solicitudes_insumo (id) on delete cascade,
  voluntario_id uuid references public.perfiles (id) on delete set null,
  tipo_vehiculo text,              -- moto, camioneta, camion, furgon, otro
  flete         numeric,           -- costo del flete
  origen        text,
  destino       text,
  notas         text,
  creado_por    uuid references public.perfiles (id) on delete set null,
  creado_en     timestamptz not null default now()
);
create index if not exists idx_envios_solicitud on public.envios (solicitud_id);

-- Donaciones
create table if not exists public.donaciones (
  id           uuid primary key default gen_random_uuid(),
  donante      text not null,
  tipo         text not null default 'especie',   -- dinero | especie
  descripcion  text,
  monto        numeric,
  estado       public.estado_donacion not null default 'comprometida',
  solicitud_id uuid references public.solicitudes_insumo (id) on delete set null,
  creado_por   uuid references public.perfiles (id) on delete set null,
  creado_en    timestamptz not null default now()
);

-- ── RLS ──
alter table public.proveedores        enable row level security;
alter table public.solicitudes_insumo enable row level security;
alter table public.envios             enable row level security;
alter table public.donaciones         enable row level security;

drop policy if exists "prov_lectura" on public.proveedores;
create policy "prov_lectura" on public.proveedores for select to authenticated using (public.es_verificado());
drop policy if exists "prov_gestion" on public.proveedores;
create policy "prov_gestion" on public.proveedores for all to authenticated
  using (public.puede_logistica()) with check (public.puede_logistica());

drop policy if exists "solins_lectura" on public.solicitudes_insumo;
create policy "solins_lectura" on public.solicitudes_insumo for select to authenticated using (public.es_verificado());
drop policy if exists "solins_insert" on public.solicitudes_insumo;
create policy "solins_insert" on public.solicitudes_insumo for insert to authenticated
  with check (public.es_verificado() and solicitado_por = auth.uid());
drop policy if exists "solins_update" on public.solicitudes_insumo;
create policy "solins_update" on public.solicitudes_insumo for update to authenticated
  using (public.puede_logistica()) with check (public.puede_logistica());
drop policy if exists "solins_delete" on public.solicitudes_insumo;
create policy "solins_delete" on public.solicitudes_insumo for delete to authenticated
  using (public.puede_logistica());

drop policy if exists "envios_lectura" on public.envios;
create policy "envios_lectura" on public.envios for select to authenticated using (public.es_verificado());
drop policy if exists "envios_gestion" on public.envios;
create policy "envios_gestion" on public.envios for all to authenticated
  using (public.puede_logistica()) with check (public.puede_logistica());

drop policy if exists "don_lectura" on public.donaciones;
create policy "don_lectura" on public.donaciones for select to authenticated using (public.es_verificado());
drop policy if exists "don_gestion" on public.donaciones;
create policy "don_gestion" on public.donaciones for all to authenticated
  using (public.puede_logistica()) with check (public.puede_logistica());

-- ── Realtime (idempotente) ──
do $$ begin alter publication supabase_realtime add table public.solicitudes_insumo; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.envios;             exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.donaciones;         exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.proveedores;        exception when duplicate_object then null; end $$;
