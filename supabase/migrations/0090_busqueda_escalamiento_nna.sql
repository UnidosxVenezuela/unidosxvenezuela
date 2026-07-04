-- ============================================================
-- 0090 — Búsqueda Fase 3: escalamiento + Enlace de contacto + reglas NNA
-- ------------------------------------------------------------
-- Cierra el flujo de la metodología con la PUERTA DEL MANDO y el rol ENLACE:
--   · El buscador marca `coincidencia_pendiente` (estado operativo, ya en 0086).
--   · El MANDO aprueba con `aprobar_coincidencia_busqueda` → `coincidencia_aprobada`
--     (sella la traza; el buscador NO puede auto-aprobar — 0086 lo blinda).
--   · No-NNA: el ENLACE registra la llamada con `registrar_contacto_busqueda`
--     → `reunificado`.
--   · NNA: NUNCA pasa por el Enlace. El mando `derivar_autoridad_busqueda`
--     → `derivado_autoridad`; y solo con custodia verificada + autoridad notificada
--     puede `reunificar_nna_busqueda` → `reunificado`.
--   · Cierre por el mando: `cerrar_busqueda` (descartado / encontrado_fallecido).
--
-- Además (hallazgo 2 de la revisión adversarial): la confirmación de `coincidencias`
-- se GATEA al mando — antes cualquier buscador podía poner estado='confirmada',
-- saltándose la aprobación (crítico para NNA). Ahora un trigger lo impide y
-- `confirmar_coincidencia` (DEFINER, mando) es la vía.
--
-- Enum-safety: el rol nuevo `enlace_contacto` SOLO se usa por comparación de TEXTO
-- o en cuerpos plpgsql / funciones (nunca cast eager en CREATE POLICY/DML).
-- Idempotente. Ejecutar tras 0089.
-- ============================================================

-- ── 1) Rol + grupo del Enlace de contacto ──
alter type public.rol_usuario add value if not exists 'enlace_contacto';

insert into public.grupos (nombre, area, clave, abierto) values
  ('Enlace de Contacto', 'gestion_informacion', 'enlace_contacto', false)
on conflict (clave) do update set nombre = excluded.nombre;

-- Mapeo grupo ↔ rol (plpgsql: se compila al llamar, tras el commit del enum).
create or replace function public.rol_de_grupo(p_clave text)
returns public.rol_usuario language plpgsql immutable as $$
begin
  return (case p_clave
    when 'gestion_casos'     then 'recopilacion'
    when 'verificacion'      then 'verificador'
    when 'busqueda'          then 'busqueda'
    when 'enlace_contacto'   then 'enlace_contacto'
    when 'digitalizacion'    then 'digitalizador'
    when 'redaccion'         then 'redaccion'
    when 'redes_sociales'    then 'redes_sociales'
    when 'diseno_grafico'    then 'diseno_grafico'
    when 'edicion_video'     then 'edicion_video'
    when 'influencers'       then 'influencers'
    when 'apoyo_psicosocial' then 'apoyo_psicosocial'
    when 'gestion_acopio'    then 'logistica'
    else null end)::public.rol_usuario;
end $$;

create or replace function public.clave_de_rol(p_rol public.rol_usuario)
returns text language plpgsql immutable as $$
begin
  return case p_rol::text
    when 'recopilacion'      then 'gestion_casos'
    when 'verificador'       then 'verificacion'
    when 'busqueda'          then 'busqueda'
    when 'enlace_contacto'   then 'enlace_contacto'
    when 'digitalizador'     then 'digitalizacion'
    when 'redaccion'         then 'redaccion'
    when 'redes_sociales'    then 'redes_sociales'
    when 'diseno_grafico'    then 'diseno_grafico'
    when 'edicion_video'     then 'edicion_video'
    when 'influencers'       then 'influencers'
    when 'apoyo_psicosocial' then 'apoyo_psicosocial'
    when 'logistica'         then 'gestion_acopio'
    else null end;
end $$;

-- ¿La persona actual es Enlace de contacto? (comparación por TEXTO)
create or replace function public.es_enlace()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(public.mis_roles()) r where r::text = 'enlace_contacto');
$$;
grant execute on function public.es_enlace() to authenticated;

-- ── 2) Blindaje reforzado: proteger también custodia/autoridad (NNA) ──
-- Solo las funciones DEFINER (con el flag app.busqueda_mando) tocan la traza, las
-- transiciones de cierre/mando y ahora los flags de NNA.
create or replace function public.busqueda_casos_blindaje()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_flag text := current_setting('app.busqueda_mando', true);
begin
  new.numero := old.numero;
  new.codigo := old.codigo;
  if v_flag is distinct from '1' then
    new.aprobado_por := old.aprobado_por;
    new.aprobado_en  := old.aprobado_en;
    new.contacto_por := old.contacto_por;
    new.contacto_en  := old.contacto_en;
    new.custodia_verificada  := old.custodia_verificada;
    new.autoridad_notificada := old.autoridad_notificada;
    if new.estado_busqueda is distinct from old.estado_busqueda
       and new.estado_busqueda in ('coincidencia_aprobada','reunificado','derivado_autoridad',
                                   'descartado','encontrado_fallecido')
       and not public.es_mando_busqueda() then
      raise exception 'Solo el mando de Búsqueda puede llevar el caso a ese estado.'
        using errcode = '42501';
    end if;
  end if;
  new.actualizado_en := now();
  return new;
end $$;

-- ── 3) SELECT de busqueda_casos: se añade la rama del Enlace ──
-- El Enlace (con identidad) ve SOLO los casos NO-NNA aprobados (su cola) y los que
-- él mismo cerró. No ve la investigación activa ni los casos de menores.
drop policy if exists "busqueda_casos_select" on public.busqueda_casos;
create policy "busqueda_casos_select" on public.busqueda_casos for select to authenticated
  using (
    public.es_admin()
    or (public.es_busqueda() and public.identidad_aprobada())
    or (public.es_enlace() and public.identidad_aprobada() and es_nna = false
        and (estado_busqueda = 'coincidencia_aprobada' or contacto_por = auth.uid()))
  );

-- ── 4) Puertas del mando / enlace (SECURITY DEFINER; fijan el flag de blindaje) ──

-- Aprobar coincidencia: pendiente → aprobada (mando). Sella la traza y avisa al Enlace.
create or replace function public.aprobar_coincidencia_busqueda(p_caso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado public.estado_busqueda; v_nna boolean;
begin
  if not public.es_mando_busqueda() then
    raise exception 'Solo el mando de Búsqueda puede aprobar una coincidencia.' using errcode = '42501';
  end if;
  select estado_busqueda, es_nna into v_estado, v_nna from public.busqueda_casos where caso_id = p_caso;
  if not found then raise exception 'Ficha de búsqueda no encontrada.'; end if;
  if v_estado <> 'coincidencia_pendiente' then
    raise exception 'Solo se aprueban coincidencias en estado pendiente.';
  end if;
  perform set_config('app.busqueda_mando', '1', true);
  update public.busqueda_casos
    set estado_busqueda = 'coincidencia_aprobada', aprobado_por = auth.uid(), aprobado_en = now()
    where caso_id = p_caso;
  -- No-NNA → a la cola del Enlace. NNA → lo maneja el mando (derivar a autoridad).
  if not v_nna then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select pf.id, 'busqueda_enlace', 'Coincidencia aprobada: llamada de confirmación',
           'Un caso fue aprobado y espera la llamada de confirmación del Enlace.', '/busqueda/enlace'
    from public.perfiles pf
    where pf.rol::text = 'enlace_contacto'
       or exists (select 1 from unnest(coalesce(pf.roles_extra, '{}'::public.rol_usuario[])) r where r::text = 'enlace_contacto');
  end if;
end $$;
grant execute on function public.aprobar_coincidencia_busqueda(uuid) to authenticated;

-- Registrar la llamada de confirmación (Enlace/mando): aprobada → reunificado (NO-NNA).
create or replace function public.registrar_contacto_busqueda(p_caso uuid, p_resultado text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado public.estado_busqueda; v_nna boolean;
begin
  if not (public.es_enlace() or public.es_mando_busqueda()) then
    raise exception 'Solo el Enlace de contacto o el mando puede registrar la llamada.' using errcode = '42501';
  end if;
  if not public.identidad_aprobada() then
    raise exception 'Necesitas tu segunda verificación aprobada.' using errcode = '42501';
  end if;
  select estado_busqueda, es_nna into v_estado, v_nna from public.busqueda_casos where caso_id = p_caso;
  if not found then raise exception 'Ficha de búsqueda no encontrada.'; end if;
  if v_nna then
    raise exception 'Los casos de menores (NNA) no pasan por el Enlace; se derivan a la autoridad.' using errcode = '42501';
  end if;
  if v_estado <> 'coincidencia_aprobada' then
    raise exception 'Solo se registra el contacto de una coincidencia aprobada.';
  end if;
  perform set_config('app.busqueda_mando', '1', true);
  update public.busqueda_casos
    set estado_busqueda = 'reunificado', contacto_por = auth.uid(), contacto_en = now()
    where caso_id = p_caso;
  insert into public.bitacora_busqueda (caso_id, autor_id, contenido, tipo, resultado)
    values (p_caso, auth.uid(),
            coalesce(nullif(btrim(p_resultado), ''), 'Llamada de confirmación realizada.'), 'llamada', 'encontrado');
end $$;
grant execute on function public.registrar_contacto_busqueda(uuid, text) to authenticated;

-- Derivar a la autoridad (mando): aprobada → derivado_autoridad (para NNA).
create or replace function public.derivar_autoridad_busqueda(p_caso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado public.estado_busqueda;
begin
  if not public.es_mando_busqueda() then
    raise exception 'Solo el mando de Búsqueda puede derivar a la autoridad.' using errcode = '42501';
  end if;
  select estado_busqueda into v_estado from public.busqueda_casos where caso_id = p_caso;
  if not found then raise exception 'Ficha de búsqueda no encontrada.'; end if;
  if v_estado <> 'coincidencia_aprobada' then
    raise exception 'Solo se deriva una coincidencia aprobada.';
  end if;
  perform set_config('app.busqueda_mando', '1', true);
  update public.busqueda_casos set estado_busqueda = 'derivado_autoridad' where caso_id = p_caso;
end $$;
grant execute on function public.derivar_autoridad_busqueda(uuid) to authenticated;

-- Actualizar los flags de custodia/autoridad de un NNA (mando).
create or replace function public.actualizar_custodia_nna(p_caso uuid, p_custodia boolean, p_autoridad boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_mando_busqueda() then
    raise exception 'Solo el mando de Búsqueda puede actualizar la custodia.' using errcode = '42501';
  end if;
  perform set_config('app.busqueda_mando', '1', true);
  update public.busqueda_casos
    set custodia_verificada = coalesce(p_custodia, false), autoridad_notificada = coalesce(p_autoridad, false)
    where caso_id = p_caso;
end $$;
grant execute on function public.actualizar_custodia_nna(uuid, boolean, boolean) to authenticated;

-- Reunificar un NNA (mando): derivado_autoridad → reunificado, con custodia + autoridad.
create or replace function public.reunificar_nna_busqueda(p_caso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado public.estado_busqueda; v_cust boolean; v_aut boolean; v_nna boolean;
begin
  if not public.es_mando_busqueda() then
    raise exception 'Solo el mando de Búsqueda puede reunificar.' using errcode = '42501';
  end if;
  select estado_busqueda, custodia_verificada, autoridad_notificada, es_nna
    into v_estado, v_cust, v_aut, v_nna from public.busqueda_casos where caso_id = p_caso;
  if not found then raise exception 'Ficha de búsqueda no encontrada.'; end if;
  if not v_nna then raise exception 'Esta función es solo para casos de menores (NNA).'; end if;
  if v_estado <> 'derivado_autoridad' then raise exception 'El menor debe estar derivado a la autoridad.'; end if;
  if not (v_cust and v_aut) then
    raise exception 'Antes de reunificar, verifica la custodia y notifica a la autoridad.' using errcode = '42501';
  end if;
  perform set_config('app.busqueda_mando', '1', true);
  update public.busqueda_casos
    set estado_busqueda = 'reunificado', contacto_por = auth.uid(), contacto_en = now()
    where caso_id = p_caso;
end $$;
grant execute on function public.reunificar_nna_busqueda(uuid) to authenticated;

-- Cierre por el mando: descartado / encontrado_fallecido (con nota opcional).
create or replace function public.cerrar_busqueda(p_caso uuid, p_estado text, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_mando_busqueda() then
    raise exception 'Solo el mando de Búsqueda puede cerrar el caso.' using errcode = '42501';
  end if;
  if p_estado not in ('descartado', 'encontrado_fallecido') then
    raise exception 'Estado de cierre no válido.';
  end if;
  perform set_config('app.busqueda_mando', '1', true);
  update public.busqueda_casos set estado_busqueda = p_estado::public.estado_busqueda where caso_id = p_caso;
  if nullif(btrim(coalesce(p_nota, '')), '') is not null then
    insert into public.bitacora_busqueda (caso_id, autor_id, contenido, tipo)
      values (p_caso, auth.uid(), p_nota, 'otro');
  end if;
end $$;
grant execute on function public.cerrar_busqueda(uuid, text, text) to authenticated;

-- Cola del Enlace (DEFINER): casos aprobados no-NNA + los que él cerró. Devuelve el
-- nombre (casos.titulo) sin que el Enlace necesite acceso RLS a `casos`.
create or replace function public.listar_cola_enlace()
returns table (
  caso_id uuid, codigo text, titulo text, edad int, sexo text,
  ultima_ubicacion text, estado_busqueda text, aprobado_en timestamptz
) language sql stable security definer set search_path = public as $$
  select b.caso_id, b.codigo, c.titulo, b.edad, b.sexo, b.ultima_ubicacion,
         b.estado_busqueda::text, b.aprobado_en
  from public.busqueda_casos b
  join public.casos c on c.id = b.caso_id
  where (public.es_admin() or (public.es_enlace() and public.identidad_aprobada()))
    and b.es_nna = false
    and (b.estado_busqueda = 'coincidencia_aprobada' or b.contacto_por = auth.uid())
  order by (b.estado_busqueda = 'coincidencia_aprobada') desc, b.aprobado_en asc nulls last
  limit 200;
$$;
grant execute on function public.listar_cola_enlace() to authenticated;

-- ── 5) Gate de la confirmación de coincidencias (hallazgo 2) ──
-- La transición de coincidencias.estado a 'confirmada' queda restringida al mando.
create or replace function public.coincidencias_gate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'confirmada' and old.estado is distinct from 'confirmada'
     and not public.es_mando_busqueda() then
    raise exception 'Solo el mando de Búsqueda puede confirmar una coincidencia.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_coincidencias_gate on public.coincidencias;
create trigger trg_coincidencias_gate before update on public.coincidencias
  for each row execute function public.coincidencias_gate();

-- Vía DEFINER para el mando: nueva → confirmada.
create or replace function public.confirmar_coincidencia(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_mando_busqueda() then
    raise exception 'Solo el mando de Búsqueda puede confirmar una coincidencia.' using errcode = '42501';
  end if;
  update public.coincidencias set estado = 'confirmada', revisado_por = auth.uid(), revisado_en = now()
    where id = p_id and estado = 'nueva';
  if not found then raise exception 'La coincidencia no existe o ya fue resuelta.'; end if;
end $$;
grant execute on function public.confirmar_coincidencia(uuid) to authenticated;

-- ── 6) Aviso al mando cuando entra una coincidencia por aprobar ──
create or replace function public.notificar_estado_busqueda()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lider uuid;
begin
  if new.estado_busqueda = 'coincidencia_pendiente'
     and old.estado_busqueda is distinct from 'coincidencia_pendiente' then
    select lider_id into v_lider from public.grupos where clave = 'busqueda';
    if v_lider is not null then
      insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
      values (v_lider, 'busqueda_aprobacion', 'Coincidencia por aprobar',
              'Un caso tiene una coincidencia pendiente de tu aprobación.', '/busqueda/' || new.caso_id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_notificar_estado_busqueda on public.busqueda_casos;
create trigger trg_notificar_estado_busqueda after update of estado_busqueda on public.busqueda_casos
  for each row execute function public.notificar_estado_busqueda();
