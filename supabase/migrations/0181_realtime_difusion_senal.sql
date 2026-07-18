-- ============================================================
-- 0181 — Realtime seguro para Envío a Redacción (sin exponer el contacto)
-- ------------------------------------------------------------
-- Contexto: la Fase 2b (0180) quitó a Redacción/Redes el acceso RLS a `casos` y la
-- movió a la vista curada `casos_difusion`. Efecto colateral: dejó de recibir
-- actualización EN VIVO, porque Supabase Realtime respeta la RLS de la TABLA y —esto es
-- lo clave— entrega la FILA COMPLETA (con `contacto`) por el WebSocket a quien pueda
-- leerla. Es decir: NO se pueden «filtrar columnas» en una suscripción a `casos` sin
-- que el contacto interno viaje al navegador de Redacción. Devolverle RLS sobre `casos`
-- reabriría exactamente el hueco que cerró el Paso 10.
--
-- Solución: una tabla-SEÑAL sin datos sensibles (`casos_difusion_senal`: solo
-- `caso_id` + `estado` + sello de tiempo). Un trigger sobre `casos` la sella cuando
-- cambia algo relevante para difusión; Redacción se suscribe a ESA tabla (cuyo payload
-- jamás contiene contacto) y al recibir el evento refresca la vista curada
-- `casos_difusion` del lado del servidor (router.refresh). El contacto nunca sale de la
-- base por el canal de realtime. Idempotente. Ejecutar tras 0180.
-- ============================================================

-- ── (1) Tabla-señal: SOLO columnas seguras (nunca contacto ni PII) ──
create table if not exists public.casos_difusion_senal (
  caso_id        uuid primary key references public.casos(id) on delete cascade,
  estado         public.estado_caso,
  actualizado_en timestamptz not null default now()
);

-- REPLICA IDENTITY FULL: para que Realtime evalúe la RLS también en UPDATE/DELETE.
-- (La fila «vieja» tampoco tiene datos sensibles, así que es seguro.)
alter table public.casos_difusion_senal replica identity full;

alter table public.casos_difusion_senal enable row level security;

-- Solo Redacción/Redes/admin (verificados) reciben la señal — mismos roles que la vista
-- curada. Sin políticas de escritura: únicamente el trigger (SECURITY DEFINER) escribe.
drop policy if exists "senal_difusion_select" on public.casos_difusion_senal;
create policy "senal_difusion_select" on public.casos_difusion_senal for select to authenticated
  using (
    public.es_verificado()
    and (public.es_admin() or public.opera_redes() or public.tiene_rol('redaccion'))
  );

-- Privilegio de tabla (la RLS decide qué filas; el GRANT habilita el acceso base y el realtime).
grant select on public.casos_difusion_senal to authenticated;

-- ── (2) Trigger sobre casos: sella/borra la señal según sea relevante para difusión ──
-- Copia SOLO id + estado (nunca contacto). Cuando el caso deja de ser relevante
-- (p. ej. se «des-confirma»), borra la señal → Redacción también recibe ese cambio.
create or replace function public.tocar_senal_difusion() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.categoria is distinct from 'Desaparecidos'
     and (new.estado::text in ('confirmado', 'enviado_redaccion') or new.publicado_en is not null) then
    insert into public.casos_difusion_senal (caso_id, estado, actualizado_en)
      values (new.id, new.estado, now())
    on conflict (caso_id) do update
      set estado = excluded.estado, actualizado_en = excluded.actualizado_en;
  else
    delete from public.casos_difusion_senal where caso_id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists trg_senal_difusion on public.casos;
create trigger trg_senal_difusion
  after insert or update of
    estado, publicado_en, publicacion_url, redactor_id, canales_publicacion,
    requiere_difusion, titulo, descripcion, categoria, contacto_difusion,
    autoriza_difusion, notas, req_tipo, req_cantidad, req_urgencia,
    fuente, fuente_url, fecha_publicacion
  on public.casos
  for each row execute function public.tocar_senal_difusion();

-- ── (3) Publicar la tabla-señal en la publicación de realtime (idempotente) ──
do $$ begin
  alter publication supabase_realtime add table public.casos_difusion_senal;
exception when duplicate_object then null; end $$;

-- ── (4) Backfill: sembrar la señal para los casos ya visibles a difusión ──
insert into public.casos_difusion_senal (caso_id, estado, actualizado_en)
  select c.id, c.estado, now()
  from public.casos c
  where c.categoria is distinct from 'Desaparecidos'
    and (c.estado::text in ('confirmado', 'enviado_redaccion') or c.publicado_en is not null)
on conflict (caso_id) do nothing;

comment on table public.casos_difusion_senal is
  'Paso 10 (realtime seguro, 0181): tabla-señal SIN datos sensibles (solo caso_id+estado+sello). Un trigger sobre casos la sella en cambios relevantes para difusión; Redacción/Redes se suscriben por realtime y refrescan la vista curada casos_difusion. Nunca lleva contacto — por eso restaura el «en vivo» sin reabrir el hueco de la Fase 2b.';
