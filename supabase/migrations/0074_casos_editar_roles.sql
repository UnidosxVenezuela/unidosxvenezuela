-- ============================================================
-- 0074 — Validación y Envío a Redacción también pueden editar el caso
-- ------------------------------------------------------------
-- Amplía quién puede corregir/completar los datos de un caso:
--   · admin: cualquiera.
--   · verificador (Validación): mientras el caso NO esté enviado a Redacción.
--   · redacción (Envío a Redacción): los casos que trabaja (confirmados o ya
--     enviados a Redacción).
--   · creador (recopilación): su propio caso mientras siga «en proceso».
-- Toda edición queda auditada por el trigger (casos:update) y, además, se
-- registra un evento explícito «casos:edicion» desde la acción editarCaso.
-- Idempotente.
-- ============================================================

drop policy if exists "casos_update" on public.casos;
create policy "casos_update" on public.casos for update to authenticated
  using (
    public.es_admin()
    or (public.puede_verificar() and estado::text <> 'enviado_redaccion')
    or (public.es_verificado() and public.tiene_rol('redaccion') and estado::text in ('confirmado','enviado_redaccion'))
    or (creado_por = auth.uid() and estado::text = 'en_proceso')
  )
  with check (
    public.es_admin()
    or (public.puede_verificar() and estado::text <> 'enviado_redaccion')
    or (public.es_verificado() and public.tiene_rol('redaccion') and estado::text in ('confirmado','enviado_redaccion'))
    or (creado_por = auth.uid() and estado::text = 'en_proceso')
  );

-- Registro de actividad de casos: admite ahora también 'edicion' (además de
-- 'copia'/'descarga' de 0073) para que la edición quede clara en el historial.
create or replace function public.registrar_evento_caso(p_caso uuid, p_accion text)
returns void language plpgsql security definer set search_path = public as $$
declare v_acc text := case p_accion when 'descarga' then 'descarga' when 'edicion' then 'edicion' else 'copia' end;
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
