-- ============================================================
-- 0079 — Auditoría de consultas de cédula (herramienta del Grupo de Búsqueda)
-- ------------------------------------------------------------
-- El Grupo de Búsqueda puede contrastar la cédula de un caso contra el registro
-- del CNE (vía CedulaVE API, solo servidor). Es un dato SENSIBLE, así que cada
-- consulta queda auditada. Como registro_auditoria no tiene política INSERT
-- (solo funciones SECURITY DEFINER escriben), se registra por esta función.
--
-- Autorización: admin, o rol 'busqueda' CON 2ª verificación (identidad)
-- aprobada — la misma regla que da acceso a los casos de desaparecidos (0078).
-- Idempotente. Ejecutar tras 0078.
-- ============================================================

create or replace function public.registrar_consulta_cedula(p_nac text, p_cedula text, p_encontrada boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.es_admin() or (public.es_busqueda() and public.identidad_aprobada())) then
    raise exception 'No autorizado para consultar cédulas.' using errcode = '42501';
  end if;
  insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
  values (auth.uid(), 'cedula:consulta', 'cedula',
          nullif(regexp_replace(coalesce(p_cedula, ''), '\D', '', 'g'), ''),
          jsonb_build_object('nac', p_nac, 'encontrada', coalesce(p_encontrada, false)));
end; $$;

revoke all on function public.registrar_consulta_cedula(text, text, boolean) from public;
grant execute on function public.registrar_consulta_cedula(text, text, boolean) to authenticated;
