-- ============================================================
-- 0096 — Avisos: enrutar bien las notificaciones del flujo de Búsqueda
-- ------------------------------------------------------------
-- Tras el rol Buscador NNA (0093) y el reparto Enlace/mando (0094), dos avisos
-- quedaron mal dirigidos:
--   1) La coincidencia de digitalización (0083) avisaba a TODO 'busqueda' — no
--      incluía al Buscador NNA ni al Enlace (que ahora confirma), y molestaba al
--      buscador general con coincidencias de menores que ni ve. Se re-enruta al
--      BUSCADOR ASIGNADO del caso cruzado + el ENLACE + el MANDO (líderes).
--   2) La segunda confirmación del cierre no avisaba a quien lo propuso (el
--      Enlace): ahora se le notifica si el mando lo confirmó o lo devolvió.
-- Idempotente. Ejecutar tras 0095.
-- ============================================================

-- ── 1) Coincidencia de digitalización: aviso al asignado + Enlace + mando ──
create or replace function public.detectar_coincidencias_persona(p_persona uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_nombre_raw text; v_ced text; v_tokens text[]; v_tok text;
  v_caso record; v_txt text; v_hits int; v_n int := 0;
  v_casos_nuevos uuid[] := '{}';
begin
  select nombre_completo, nullif(regexp_replace(coalesce(cedula, ''), '\D', '', 'g'), '')
    into v_nombre_raw, v_ced
    from public.personas_listado where id = p_persona;
  if v_nombre_raw is null then return 0; end if;

  -- Tokens del nombre (>= 3 letras, sin acentos).
  select array_agg(t) into v_tokens from (
    select regexp_replace(t, '[^a-z0-9]', '', 'g') as t
    from unnest(regexp_split_to_array(translate(lower(v_nombre_raw), 'áéíóúüñ', 'aeiouun'), '\s+')) t
  ) s where length(regexp_replace(t, '[^a-z0-9]', '', 'g')) >= 3;

  for v_caso in select id, titulo, descripcion, notas from public.casos where categoria = 'Desaparecidos' loop
    v_txt := public.normalizar_nombre(coalesce(v_caso.titulo, '') || ' ' || coalesce(v_caso.descripcion, '') || ' ' || coalesce(v_caso.notas, ''));
    -- 1) Coincidencia fuerte por cédula.
    if v_ced is not null and v_ced <> '' and position(v_ced in v_txt) > 0 then
      insert into public.coincidencias (persona_listado_id, caso_id, motivo)
        values (p_persona, v_caso.id, 'cedula') on conflict do nothing;
      if found then v_n := v_n + 1; v_casos_nuevos := v_casos_nuevos || v_caso.id; end if;
      continue;
    end if;
    -- 2) Coincidencia por nombre: al menos 2 tokens presentes en el texto del caso.
    if coalesce(array_length(v_tokens, 1), 0) >= 2 then
      v_hits := 0;
      foreach v_tok in array v_tokens loop
        if v_tok <> '' and position(v_tok in v_txt) > 0 then v_hits := v_hits + 1; end if;
      end loop;
      if v_hits >= 2 then
        insert into public.coincidencias (persona_listado_id, caso_id, motivo)
          values (p_persona, v_caso.id, 'nombre') on conflict do nothing;
        if found then v_n := v_n + 1; v_casos_nuevos := v_casos_nuevos || v_caso.id; end if;
      end if;
    end if;
  end loop;

  -- Avisar SOLO a quien actúa: el buscador ASIGNADO del caso cruzado (ve su caso,
  -- adulto o NNA), el ENLACE (confirma las coincidencias) y el MANDO (supervisa).
  -- Así no se molesta al buscador general con coincidencias de menores que no ve.
  if array_length(v_casos_nuevos, 1) > 0 then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select destinatario, 'coincidencia', 'Posible coincidencia con un desaparecido',
           'Hay coincidencias nuevas por revisar en Coincidencias.', '/coincidencias'
    from (
      select c.asignado_a as destinatario from public.casos c
        where c.id = any(v_casos_nuevos) and c.asignado_a is not null
      union
      select pf.id from public.perfiles pf
        where pf.rol::text = 'enlace_contacto'
           or exists (select 1 from unnest(coalesce(pf.roles_extra, '{}'::public.rol_usuario[])) r where r::text = 'enlace_contacto')
      union
      select g.lider_id from public.grupos g
        where g.clave in ('busqueda','busqueda_nna') and g.lider_id is not null
    ) d
    where destinatario is not null;
  end if;
  return v_n;
end $$;

-- ── 2) La segunda confirmación avisa a quien propuso el cierre (el Enlace) ──
create or replace function public.confirmar_cierre_busqueda(p_caso uuid, p_aprobar boolean default true, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado public.estado_busqueda; v_prop text; v_por uuid;
begin
  if not public.es_mando_busqueda() then
    raise exception 'Solo el mando de Búsqueda puede confirmar el cierre de un caso.' using errcode = '42501';
  end if;
  select estado_busqueda, cierre_propuesto, cierre_propuesto_por
    into v_estado, v_prop, v_por from public.busqueda_casos where caso_id = p_caso;
  if not found then raise exception 'Ficha de búsqueda no encontrada.'; end if;
  if v_estado <> 'cierre_pendiente' then
    raise exception 'Este caso no está pendiente de confirmación de cierre.';
  end if;
  if not public.es_admin() and v_por = auth.uid() then
    raise exception 'La confirmación debe hacerla otra persona del mando, no quien propuso el cierre.' using errcode = '42501';
  end if;
  perform set_config('app.busqueda_mando', '1', true);
  if coalesce(p_aprobar, true) then
    update public.busqueda_casos
      set estado_busqueda = v_prop::public.estado_busqueda,
          cierre_propuesto = null, cierre_propuesto_por = null, cierre_propuesto_en = null
      where caso_id = p_caso;
    insert into public.bitacora_busqueda (caso_id, autor_id, contenido, tipo)
      values (p_caso, auth.uid(),
        'Cierre CONFIRMADO por el mando (' || v_prop || ')' || coalesce(': ' || nullif(btrim(p_nota), ''), ''), 'otro');
  else
    update public.busqueda_casos
      set estado_busqueda = (case when v_prop = 'reunificado' then 'coincidencia_aprobada' else 'en_revision' end)::public.estado_busqueda,
          cierre_propuesto = null, cierre_propuesto_por = null, cierre_propuesto_en = null
      where caso_id = p_caso;
    insert into public.bitacora_busqueda (caso_id, autor_id, contenido, tipo)
      values (p_caso, auth.uid(),
        'Cierre RECHAZADO por el mando; se devuelve para revisión' || coalesce(': ' || nullif(btrim(p_nota), ''), ''), 'otro');
  end if;
  -- Avisar a quien propuso el cierre (el Enlace) el resultado de la confirmación.
  if v_por is not null then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    values (v_por, 'busqueda_cierre',
      case when coalesce(p_aprobar, true) then 'Cierre confirmado por el mando' else 'Cierre devuelto a revisión' end,
      case when coalesce(p_aprobar, true)
           then 'El mando confirmó el cierre del caso que finalizaste.'
           else 'El mando devolvió a revisión el caso que finalizaste; revisa la bitácora.' end,
      '/busqueda/' || p_caso);
  end if;
end $$;
grant execute on function public.confirmar_cierre_busqueda(uuid, boolean, text) to authenticated;
