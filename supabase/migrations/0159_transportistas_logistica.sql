-- ============================================================
-- 0159 — Registro de transportistas/conductores de Logística
-- ------------------------------------------------------------
-- El envío de una solicitud elegía «Conductor / voluntario» de ENTRE TODOS los usuarios de
-- la plataforma, aunque la mayoría no ofrece transporte. Se pide que ese selector muestre
-- SOLO a las personas registradas que ofrecen el servicio de transporte, y que Logística
-- pueda registrar ese listado tomando los datos de los Donación-Ofrecimientos de transporte.
--
-- Se crea un registro propio `transportistas_logistica` (nombre, contacto, vehículo…), que
-- puede alimentarse desde un ofrecimiento (guardando su `oportunidad_id` de origen) o a mano.
-- Sirve para personas EXTERNAS (no necesariamente usuarias de la app). El envío enlaza al
-- transportista con `envios.transportista_id` (se conserva `voluntario_id` para el histórico).
--
-- Lo gestiona Logística (puede_logistica: admin / coordinador / logística). Idempotente.
-- Ejecutar tras 0158.
-- ============================================================

create table if not exists public.transportistas_logistica (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  contacto       text,                     -- libre: «teléfono · correo»
  vehiculo       text,                     -- moto, camioneta, camión, furgón…
  notas          text,
  oportunidad_id uuid references public.oportunidades_donacion (id) on delete set null,  -- origen (si vino de un ofrecimiento)
  activo         boolean not null default true,
  creado_por     uuid references public.perfiles (id) on delete set null,
  creado_en      timestamptz not null default now()
);
create index if not exists idx_transp_log_activo on public.transportistas_logistica (activo);
-- Un mismo ofrecimiento se registra una sola vez (evita duplicados al registrar dos veces).
create unique index if not exists uq_transp_log_oportunidad
  on public.transportistas_logistica (oportunidad_id) where oportunidad_id is not null;

alter table public.transportistas_logistica enable row level security;

-- Solo Logística ve y gestiona el registro (mismo criterio que proveedores/insumos).
drop policy if exists tl_select on public.transportistas_logistica;
create policy tl_select on public.transportistas_logistica for select to authenticated
  using (public.puede_logistica());
drop policy if exists tl_insert on public.transportistas_logistica;
create policy tl_insert on public.transportistas_logistica for insert to authenticated
  with check (public.puede_logistica() and creado_por = auth.uid());
drop policy if exists tl_update on public.transportistas_logistica;
create policy tl_update on public.transportistas_logistica for update to authenticated
  using (public.puede_logistica()) with check (public.puede_logistica());
drop policy if exists tl_delete on public.transportistas_logistica;
create policy tl_delete on public.transportistas_logistica for delete to authenticated
  using (public.puede_logistica());

-- El envío enlaza al transportista registrado (conductor). Se conserva voluntario_id (0050)
-- para no perder los envíos históricos; los nuevos usan transportista_id.
alter table public.envios
  add column if not exists transportista_id uuid references public.transportistas_logistica (id) on delete set null;
