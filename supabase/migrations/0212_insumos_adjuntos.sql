-- ============================================================
-- 0212 — Logística adjunta IMÁGENES a sus solicitudes
-- ------------------------------------------------------------
-- Petición del área de Logística: poder adjuntar imágenes a las solicitudes.
--
-- Hoy Logística solo puede subir UNA foto, y solo al final: la «evidencia de entrega»
-- (`solicitudes_insumo.entrega_evidencia_path`, 0149). Pero durante la gestión hacen
-- falta varias —el insumo recibido, la guía de despacho, el punto de entrega, el estado
-- de la carga— y en cualquier momento del proceso, no solo al entregar.
--
-- Aquí se añade una galería propia de la solicitud, con el MISMO molde que
-- `casos_adjuntos` (0015): tabla + bucket privado + RLS. Reutiliza el bucket
-- 'entregas' (0149), que ya es privado y acotado a `puede_logistica()`.
--
-- La «evidencia de entrega» se conserva TAL CUAL: es el comprobante del cierre y tiene
-- su propio sitio en el flujo. Esto se SUMA, no la reemplaza.
--
-- Alcance de lectura: Logística (rol logistica, admin_logistica) y admin — el mismo
-- que el bucket. Son fotos operativas que pueden mostrar domicilios y personas, así
-- que no se abren a otras áreas.
-- Idempotente. Ejecutar tras 0211.
-- ============================================================

create table if not exists public.insumos_adjuntos (
  id           uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes_insumo (id) on delete cascade,
  url          text not null,          -- ruta dentro del bucket privado 'entregas'
  nombre       text not null,
  mime         text,
  creado_por   uuid references public.perfiles (id) on delete set null,
  creado_en    timestamptz not null default now()
);
create index if not exists idx_insumos_adj_solicitud on public.insumos_adjuntos (solicitud_id);

comment on table public.insumos_adjuntos is
  'Imágenes/adjuntos de una solicitud de insumo (0212). Molde de casos_adjuntos: la fila guarda la RUTA dentro del bucket privado «entregas»; la app sirve URLs firmadas. Acotado a Logística.';

alter table public.insumos_adjuntos enable row level security;

-- Lectura: Logística (incluye admin_logistica) y admin — igual que el bucket 'entregas'.
drop policy if exists insadj_select on public.insumos_adjuntos;
create policy insadj_select on public.insumos_adjuntos for select to authenticated
  using (public.puede_logistica());

-- Alta: la misma audiencia, y siempre a nombre de quien sube (trazabilidad).
drop policy if exists insadj_insert on public.insumos_adjuntos;
create policy insadj_insert on public.insumos_adjuntos for insert to authenticated
  with check (public.puede_logistica() and creado_por = auth.uid());

-- Baja: quien lo subió (para corregir su propia carga) o la administración.
drop policy if exists insadj_delete on public.insumos_adjuntos;
create policy insadj_delete on public.insumos_adjuntos for delete to authenticated
  using (public.puede_logistica() and (creado_por = auth.uid() or public.es_admin()));

-- ── Storage: el bucket 'entregas' ya tiene SELECT/INSERT acotados a puede_logistica()
--    (0149). Falta el DELETE, para poder retirar una imagen mal subida. ──
drop policy if exists entregas_obj_delete on storage.objects;
create policy entregas_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'entregas' and public.puede_logistica());
