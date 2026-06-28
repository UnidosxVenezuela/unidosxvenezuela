-- ============================================================
-- 0013 — Auditoría endurecida
-- ============================================================
-- Enum cerrado de acciones + valida que el actor es coordinación.
-- El actor SIEMPRE es auth.uid().
-- ============================================================

do $$ begin
  create type public.accion_auditoria as enum ('cambio_rol', 'cambio_verificacion');
exception when duplicate_object then null; end $$;

create or replace function public.registrar_auditoria(
  p_accion     public.accion_auditoria,
  p_entidad_id text,
  p_metadata   jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_coordinacion() then
    raise exception 'No autorizado para registrar esta auditoría.' using errcode = '42501';
  end if;
  insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
  values (auth.uid(), p_accion::text, 'perfil', p_entidad_id, coalesce(p_metadata, '{}'::jsonb));
end; $$;

revoke all on function public.registrar_auditoria(public.accion_auditoria, text, jsonb) from public;
grant execute on function public.registrar_auditoria(public.accion_auditoria, text, jsonb) to authenticated;
