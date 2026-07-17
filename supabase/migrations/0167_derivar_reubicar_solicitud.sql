-- ============================================================
-- 0167 — Derivar / reubicar una solicitud (caso) desde Verificación / Recopilación
-- ------------------------------------------------------------
-- (1) «Enviar a Redacción» también lo puede hacer VERIFICACIÓN (además de Redacción /
--     admin / opera_redes). La difusión automática de Redacción NO cambia: sigue viendo
--     todas las confirmadas; esto solo agrega el envío manual y explícito. Conserva las
--     guardas de estado (solo «confirmado») y de categoría (los «Desaparecidos» no pasan).
-- (2) Nuevo RPC: reubicar una solicitud MAL CLASIFICADA como Donación-Ofrecimiento.
--     A veces lo que llega como «solicitud» es en realidad alguien que OFRECE ayuda; en
--     ese caso Recopilación o Verificación la reubican: se crea el ofrecimiento con sus
--     datos y la solicitud original queda DESCARTADA con una nota que enlaza al nuevo
--     «OF-xxxxx» (traza auditable; no se borra). Devuelve el id del ofrecimiento.
-- Idempotente (create or replace). Ejecutar tras 0166.
-- ============================================================

-- (1) Ampliar enviar_caso_redaccion a Verificación (base: 0106; se conservan sus guardas).
create or replace function public.enviar_caso_redaccion(p_caso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado public.estado_caso; v_cat text;
begin
  if not (public.tiene_rol('admin') or public.tiene_rol('redaccion') or public.opera_redes()
          or public.puede_verificar() or public.opera_verificacion()) then
    raise exception 'No tienes permiso para enviar a Redacción.' using errcode = '42501';
  end if;
  select estado, categoria into v_estado, v_cat from public.casos where id = p_caso;
  if not found then raise exception 'Caso no encontrado.'; end if;
  if v_estado::text <> 'confirmado' then raise exception 'Solo se envían casos confirmados.'; end if;
  if v_cat is not distinct from 'Desaparecidos' then
    raise exception 'Los casos de Desaparecidos no pasan a Redacción; los gestiona el Grupo de Búsqueda.' using errcode = '42501';
  end if;
  update public.casos set estado = 'enviado_redaccion', actualizado_en = now() where id = p_caso;
end $$;
grant execute on function public.enviar_caso_redaccion(uuid) to authenticated;

-- (2) Reubicar una solicitud como Donación-Ofrecimiento.
create or replace function public.reubicar_caso_como_ofrecimiento(p_caso uuid, p_clase text default 'donacion')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_caso record; v_of uuid; v_num bigint; v_clase text;
begin
  select id, numero, titulo, descripcion, contacto, estado, creado_por
    into v_caso from public.casos where id = p_caso;
  if v_caso.id is null then raise exception 'Solicitud no encontrada.' using errcode = 'P0002'; end if;

  -- Autorización: Recopilación (con identidad) / Verificación / admin / el propio creador.
  if not (public.es_admin() or public.puede_verificar() or public.opera_verificacion()
          or (public.tiene_rol('recopilacion') and public.identidad_aprobada())
          or v_caso.creado_por = auth.uid()) then
    raise exception 'No tienes permiso para reubicar esta solicitud.' using errcode = '42501';
  end if;
  if v_caso.estado::text = 'falso' then
    raise exception 'Esta solicitud ya está descartada.'; end if;

  v_clase := case when p_clase = 'servicio' then 'servicio' else 'donacion' end;

  -- Crea el ofrecimiento con lo que se pueda mapear; Recopilación luego completa/afina.
  insert into public.oportunidades_donacion (organizacion, contacto, descripcion, clase, estado, creado_por)
  values (
    coalesce(nullif(btrim(v_caso.titulo), ''), 'Ofrecimiento reubicado'),
    v_caso.contacto,
    v_caso.descripcion,
    v_clase,
    'nueva',
    coalesce(v_caso.creado_por, auth.uid())
  )
  returning id, numero into v_of, v_num;

  -- La solicitud original sale del flujo (descartada) con la traza al nuevo ofrecimiento.
  update public.casos
     set estado = 'falso',
         notas = trim(both E'\n' from coalesce(notas, '') || E'\n' ||
                 '↪ Reubicada como Donación-Ofrecimiento OF-' || lpad(v_num::text, 5, '0') || '.'),
         actualizado_en = now()
   where id = p_caso;

  return v_of;
end $$;
grant execute on function public.reubicar_caso_como_ofrecimiento(uuid, text) to authenticated;
