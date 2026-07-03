-- ============================================================
-- 0073 — Editar casos por el creador + registro de actividad de Redacción
-- ------------------------------------------------------------
-- 1) El CREADOR (recopilación) puede corregir/completar su propio caso mientras
--    siga EN PROCESO (antes de que Verificación lo confirme o descarte). Admin y
--    verificador conservan sus permisos. La edición queda auditada (trigger).
-- 2) RPC para registrar cuando Redacción COPIA/DESCARGA un caso (monitoreo): deja
--    un evento en la auditoría a nombre del usuario, visible en el historial.
-- Idempotente.
-- ============================================================

drop policy if exists "casos_update" on public.casos;
create policy "casos_update" on public.casos for update to authenticated
  using (
    (public.puede_verificar() and (estado::text <> 'enviado_redaccion' or public.es_admin()))
    or (creado_por = auth.uid() and estado::text = 'en_proceso')
  )
  with check (
    (public.puede_verificar() and (estado::text <> 'enviado_redaccion' or public.es_admin()))
    or (creado_por = auth.uid() and estado::text = 'en_proceso')
  );

create or replace function public.registrar_evento_caso(p_caso uuid, p_accion text)
returns void language plpgsql security definer set search_path = public as $$
declare v_acc text := case when p_accion = 'descarga' then 'descarga' else 'copia' end;
begin
  if not (public.es_verificado() and (
      public.tiene_rol('admin') or public.tiene_rol('verificador')
      or public.tiene_rol('recopilacion') or public.tiene_rol('redaccion'))) then
    raise exception 'No tienes permiso para registrar esta actividad.' using errcode = '42501';
  end if;
  insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
  values (auth.uid(), 'casos:' || v_acc, 'casos', p_caso::text,
          jsonb_build_object('caso_id', p_caso::text));
end; $$;
grant execute on function public.registrar_evento_caso(uuid, text) to authenticated;
