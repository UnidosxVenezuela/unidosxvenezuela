-- ============================================================
-- 0163 — Bitácora de la solicitud de insumos + Captación en modo consulta
-- ------------------------------------------------------------
-- Captación necesita VER las solicitudes de Logística (sin editar ni avanzar:
-- eso es de Logística) y dejar NOTAS con las empresas/alianzas que puedan
-- ayudar a completarlas, para que Logística tenga esas referencias a mano.
--
-- La lectura ya la permite la RLS (solins_lectura = es_verificado, 0050) y la
-- escritura de la solicitud sigue cerrada (solins_update = puede_logistica).
-- Lo que falta es la BITÁCORA: no existía para solicitudes_insumo. Se crea con
-- el molde de bitacora_oportunidad (0141). Cada nota queda además en el
-- Registro de actividad (la app llama registrar_auditoria al guardarla).
-- Idempotente. Ejecutar tras 0162.
-- ============================================================

create table if not exists public.bitacora_solicitud (
  id           uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes_insumo (id) on delete cascade,
  autor_id     uuid not null references public.perfiles (id) on delete cascade,
  contenido    text not null,
  creado_en    timestamptz not null default now()
);
create index if not exists idx_bitac_sol on public.bitacora_solicitud (solicitud_id, creado_en desc);
alter table public.bitacora_solicitud enable row level security;

-- Leen todas las cuentas verificadas (igual que la solicitud misma).
drop policy if exists bitsol_select on public.bitacora_solicitud;
create policy bitsol_select on public.bitacora_solicitud for select to authenticated
  using (public.es_verificado());
-- Escriben, a su propio nombre, quienes gestionan (Logística) o consultan para
-- sugerir aliados (Captación).
drop policy if exists bitsol_insert on public.bitacora_solicitud;
create policy bitsol_insert on public.bitacora_solicitud for insert to authenticated
  with check (autor_id = auth.uid()
    and (public.puede_logistica() or public.puede_captacion()));
-- Borra el autor de la nota, Logística o un admin.
drop policy if exists bitsol_delete on public.bitacora_solicitud;
create policy bitsol_delete on public.bitacora_solicitud for delete to authenticated
  using (autor_id = auth.uid() or public.es_admin() or public.puede_logistica());
