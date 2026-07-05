-- ============================================================
-- 0094 — Búsqueda Fase 6: el Enlace opera; el mando confirma el cierre
-- ------------------------------------------------------------
-- Se reasignan los pasos operativos de la coincidencia al ENLACE DE CONTACTO y se
-- añade una SEGUNDA CONFIRMACIÓN del MANDO para TODOS los cierres (decisión 3B).
--
-- Nuevo reparto:
--   · Buscador / Buscador NNA → investigan → 'coincidencia_pendiente'.
--   · ENLACE → revisa y valida el trabajo del buscador, APRUEBA la coincidencia;
--       adulto → llamada de confirmación; NNA → deriva a autoridad + custodia/
--       autoridad + reunifica. Cada cierre queda en 'cierre_pendiente' (propuesto).
--   · MANDO (líder/coordinador) → revisa TODO el historial y CONFIRMA el cierre
--       real (o lo rechaza y lo devuelve a revisión). Aplica a reunificación de
--       adultos y de menores, descartado y fallecido.
--
-- El Enlace ahora VE los casos (adultos y NNA) desde la etapa de coincidencia
-- (no la investigación activa). La separación NNA de la fase de investigación
-- (0093) se conserva: el buscador general nunca ve un menor.
--
-- Enum-safety: el valor nuevo 'cierre_pendiente' de estado_busqueda solo se usa en
-- cuerpos plpgsql (funciones/trigger) o por comparación; las policies lo evitan con
-- `not in ('activo','en_revision')`. Idempotente. Ejecutar tras 0093.
-- ============================================================

-- ── 1) Estado nuevo + columnas de la propuesta de cierre ──
alter type public.estado_busqueda add value if not exists 'cierre_pendiente';

alter table public.busqueda_casos
  add column if not exists cierre_propuesto     text,        -- reunificado | descartado | encontrado_fallecido
  add column if not exists cierre_propuesto_por uuid references public.perfiles (id) on delete set null,
  add column if not exists cierre_propuesto_en  timestamptz;

-- ── 2) Blindaje: proteger las columnas de la propuesta y bloquear 'cierre_pendiente' ──
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
    new.cierre_propuesto     := old.cierre_propuesto;
    new.cierre_propuesto_por := old.cierre_propuesto_por;
    new.cierre_propuesto_en  := old.cierre_propuesto_en;
    if new.es_nna is distinct from old.es_nna and not public.es_mando_busqueda() then
      new.es_nna := old.es_nna;
    end if;
    if new.estado_busqueda is distinct from old.estado_busqueda
       and new.estado_busqueda in ('coincidencia_aprobada','cierre_pendiente','reunificado',
                                   'derivado_autoridad','descartado','encontrado_fallecido')
       and not public.es_mando_busqueda() then
      raise exception 'Ese cambio de estado solo procede por las acciones del Enlace o del mando.'
        using errcode = '42501';
    end if;
  end if;
  new.actualizado_en := now();
  return new;
end $$;

-- ── 3) Helper: ¿el caso está en una etapa que el Enlace atiende? (DEFINER) ──
create or replace function public.caso_busqueda_etapa_enlace(p_caso uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.busqueda_casos b
                 where b.caso_id = p_caso and b.estado_busqueda not in ('activo','en_revision'));
$$;
grant execute on function public.caso_busqueda_etapa_enlace(uuid) to authenticated;

-- ── 4) RLS: el Enlace ve adultos y NNA desde la etapa de coincidencia ──
drop policy if exists "busqueda_casos_select" on public.busqueda_casos;
create policy "busqueda_casos_select" on public.busqueda_casos for select to authenticated
  using (
    public.es_admin()
    or public.es_mando_busqueda()
    or (public.es_busqueda() and public.identidad_aprobada() and es_nna = false)
    or (public.es_buscador_nna() and public.identidad_aprobada() and es_nna = true)
    or (public.es_enlace() and public.identidad_aprobada()
        and estado_busqueda not in ('activo','en_revision'))
  );

-- casos: el Enlace ve el caso (nombre) de lo que atiende (etapa de coincidencia).
drop policy if exists "casos_select" on public.casos;
create policy "casos_select" on public.casos for select to authenticated
  using (public.es_verificado() and (
    public.es_admin()
    or (public.tiene_rol('verificador') and categoria is distinct from 'Desaparecidos')
    or (public.es_mando_busqueda() and categoria = 'Desaparecidos')
    or (public.es_busqueda() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and not public.caso_busqueda_es_nna(id))
    or (public.es_buscador_nna() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and public.caso_busqueda_es_nna(id))
    or (public.es_enlace() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and public.caso_busqueda_etapa_enlace(id))
    or (public.tiene_rol('redaccion') and estado::text in ('confirmado','enviado_redaccion')
        and categoria is distinct from 'Desaparecidos')
    or (creado_por = auth.uid() and public.identidad_aprobada())
  ));

-- ── 5) Bitácora: el Enlace también la lee/escribe (para validar) en su etapa ──
create or replace function public.puede_atender_busqueda(p_caso uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_mando_busqueda()
    or exists (select 1 from public.casos c where c.id = p_caso and c.asignado_a = auth.uid())
    or (public.es_enlace() and public.identidad_aprobada() and public.caso_busqueda_etapa_enlace(p_caso));
$$;
grant execute on function public.puede_atender_busqueda(uuid) to authenticated;

-- ── 6) Puertas operativas: ahora del ENLACE (o el mando). Cierres → 'cierre_pendiente'. ──
create or replace function public.aprobar_coincidencia_busqueda(p_caso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado public.estado_busqueda;
begin
  if not (public.es_enlace() or public.es_mando_busqueda()) then
    raise exception 'Solo el Enlace de contacto (o el mando) puede aprobar una coincidencia.' using errcode = '42501';
  end if;
  if not (public.es_admin() or public.identidad_aprobada()) then
    raise exception 'Necesitas tu segunda verificación aprobada.' using errcode = '42501';
  end if;
  select estado_busqueda into v_estado from public.busqueda_casos where caso_id = p_caso;
  if not found then raise exception 'Ficha de búsqueda no encontrada.'; end if;
  if v_estado <> 'coincidencia_pendiente' then
    raise exception 'Solo se aprueban coincidencias en estado pendiente.';
  end if;
  perform set_config('app.busqueda_mando', '1', true);
  update public.busqueda_casos
    set estado_busqueda = 'coincidencia_aprobada', aprobado_por = auth.uid(), aprobado_en = now()
    where caso_id = p_caso;
end $$;

-- Adulto: llamada de confirmación → cierre_pendiente (propuesto = reunificado).
create or replace function public.registrar_contacto_busqueda(p_caso uuid, p_resultado text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado public.estado_busqueda; v_nna boolean;
begin
  if not (public.es_enlace() or public.es_mando_busqueda()) then
    raise exception 'Solo el Enlace de contacto (o el mando) puede registrar la llamada.' using errcode = '42501';
  end if;
  if not (public.es_admin() or public.identidad_aprobada()) then
    raise exception 'Necesitas tu segunda verificación aprobada.' using errcode = '42501';
  end if;
  select estado_busqueda, es_nna into v_estado, v_nna from public.busqueda_casos where caso_id = p_caso;
  if not found then raise exception 'Ficha de búsqueda no encontrada.'; end if;
  if v_nna then
    raise exception 'Un menor (NNA) se cierra por reunificación con la autoridad, no por la llamada de adultos.' using errcode = '42501';
  end if;
  if v_estado <> 'coincidencia_aprobada' then
    raise exception 'Solo se registra el contacto de una coincidencia aprobada.';
  end if;
  perform set_config('app.busqueda_mando', '1', true);
  update public.busqueda_casos
    set estado_busqueda = 'cierre_pendiente', cierre_propuesto = 'reunificado',
        cierre_propuesto_por = auth.uid(), cierre_propuesto_en = now(),
        contacto_por = auth.uid(), contacto_en = now()
    where caso_id = p_caso;
  insert into public.bitacora_busqueda (caso_id, autor_id, contenido, tipo, resultado)
    values (p_caso, auth.uid(),
            coalesce(nullif(btrim(p_resultado), ''), 'Llamada de confirmación realizada.'), 'llamada', 'encontrado');
end $$;

-- NNA: derivar a la autoridad (aprobada → derivado_autoridad).
create or replace function public.derivar_autoridad_busqueda(p_caso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado public.estado_busqueda;
begin
  if not (public.es_enlace() or public.es_mando_busqueda()) then
    raise exception 'Solo el Enlace de contacto (o el mando) puede derivar a la autoridad.' using errcode = '42501';
  end if;
  if not (public.es_admin() or public.identidad_aprobada()) then
    raise exception 'Necesitas tu segunda verificación aprobada.' using errcode = '42501';
  end if;
  select estado_busqueda into v_estado from public.busqueda_casos where caso_id = p_caso;
  if not found then raise exception 'Ficha de búsqueda no encontrada.'; end if;
  if v_estado <> 'coincidencia_aprobada' then
    raise exception 'Solo se deriva una coincidencia aprobada.';
  end if;
  perform set_config('app.busqueda_mando', '1', true);
  update public.busqueda_casos set estado_busqueda = 'derivado_autoridad' where caso_id = p_caso;
end $$;

create or replace function public.actualizar_custodia_nna(p_caso uuid, p_custodia boolean, p_autoridad boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.es_enlace() or public.es_mando_busqueda()) then
    raise exception 'Solo el Enlace de contacto (o el mando) puede actualizar la custodia.' using errcode = '42501';
  end if;
  if not (public.es_admin() or public.identidad_aprobada()) then
    raise exception 'Necesitas tu segunda verificación aprobada.' using errcode = '42501';
  end if;
  perform set_config('app.busqueda_mando', '1', true);
  update public.busqueda_casos
    set custodia_verificada = coalesce(p_custodia, false), autoridad_notificada = coalesce(p_autoridad, false)
    where caso_id = p_caso;
end $$;

-- NNA: reunificar (derivado_autoridad + custodia + autoridad) → cierre_pendiente.
create or replace function public.reunificar_nna_busqueda(p_caso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado public.estado_busqueda; v_cust boolean; v_aut boolean; v_nna boolean;
begin
  if not (public.es_enlace() or public.es_mando_busqueda()) then
    raise exception 'Solo el Enlace de contacto (o el mando) puede reunificar.' using errcode = '42501';
  end if;
  if not (public.es_admin() or public.identidad_aprobada()) then
    raise exception 'Necesitas tu segunda verificación aprobada.' using errcode = '42501';
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
    set estado_busqueda = 'cierre_pendiente', cierre_propuesto = 'reunificado',
        cierre_propuesto_por = auth.uid(), cierre_propuesto_en = now(),
        contacto_por = auth.uid(), contacto_en = now()
    where caso_id = p_caso;
end $$;

-- Descartar / fallecido → cierre_pendiente (propuesto).
create or replace function public.cerrar_busqueda(p_caso uuid, p_estado text, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.es_enlace() or public.es_mando_busqueda()) then
    raise exception 'Solo el Enlace de contacto o el mando puede cerrar el caso.' using errcode = '42501';
  end if;
  if not (public.es_admin() or public.identidad_aprobada()) then
    raise exception 'Necesitas tu segunda verificación aprobada.' using errcode = '42501';
  end if;
  if p_estado not in ('descartado', 'encontrado_fallecido') then
    raise exception 'Estado de cierre no válido.';
  end if;
  perform set_config('app.busqueda_mando', '1', true);
  update public.busqueda_casos
    set estado_busqueda = 'cierre_pendiente', cierre_propuesto = p_estado,
        cierre_propuesto_por = auth.uid(), cierre_propuesto_en = now()
    where caso_id = p_caso;
  if nullif(btrim(coalesce(p_nota, '')), '') is not null then
    insert into public.bitacora_busqueda (caso_id, autor_id, contenido, tipo)
      values (p_caso, auth.uid(), p_nota, 'otro');
  end if;
end $$;

-- ── 7) Segunda confirmación del MANDO (3B): confirma o rechaza el cierre ──
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
  -- La confirmación la hace OTRA persona del mando (no quien propuso), salvo admin.
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
end $$;
grant execute on function public.confirmar_cierre_busqueda(uuid, boolean, text) to authenticated;

-- ── 8) Coincidencias (cruce con personas halladas): confirmar → ahora el Enlace ──
create or replace function public.coincidencias_gate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'confirmada' and old.estado is distinct from 'confirmada'
     and not (public.es_enlace() or public.es_mando_busqueda()) then
    raise exception 'Solo el Enlace de contacto (o el mando) puede confirmar una coincidencia.' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.confirmar_coincidencia(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.es_enlace() or public.es_mando_busqueda()) then
    raise exception 'Solo el Enlace de contacto (o el mando) puede confirmar una coincidencia.' using errcode = '42501';
  end if;
  update public.coincidencias set estado = 'confirmada', revisado_por = auth.uid(), revisado_en = now()
    where id = p_id and estado = 'nueva';
  if not found then raise exception 'La coincidencia no existe o ya fue resuelta.'; end if;
end $$;

-- ── 9) Avisos: coincidencia pendiente → Enlace; cierre pendiente → mando ──
create or replace function public.notificar_estado_busqueda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado_busqueda = 'coincidencia_pendiente'
     and old.estado_busqueda is distinct from 'coincidencia_pendiente' then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select pf.id, 'busqueda_enlace', 'Coincidencia por revisar',
           'Un caso tiene una coincidencia pendiente de tu revisión y aprobación.', '/busqueda/' || new.caso_id
    from public.perfiles pf
    where pf.rol::text = 'enlace_contacto'
       or exists (select 1 from unnest(coalesce(pf.roles_extra, '{}'::public.rol_usuario[])) r where r::text = 'enlace_contacto');
  end if;
  if new.estado_busqueda = 'cierre_pendiente'
     and old.estado_busqueda is distinct from 'cierre_pendiente' then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select g.lider_id, 'busqueda_confirmacion', 'Cierre por confirmar',
           'Un caso fue finalizado por el Enlace y espera tu confirmación final.', '/busqueda/' || new.caso_id
    from public.grupos g where g.clave in ('busqueda','busqueda_nna') and g.lider_id is not null;
  end if;
  return new;
end $$;

-- ── 10) Cola del Enlace: casos por revisar/actuar (pendiente, aprobada, derivado) ──
-- Cambia la firma de retorno (0090) → hay que borrarla antes de recrearla.
drop function if exists public.listar_cola_enlace();
create or replace function public.listar_cola_enlace()
returns table (
  caso_id uuid, codigo text, titulo text, edad int, sexo text, es_nna boolean,
  ultima_ubicacion text, estado_busqueda text, custodia_verificada boolean,
  autoridad_notificada boolean, aprobado_en timestamptz, creado_en timestamptz
) language sql stable security definer set search_path = public as $$
  select b.caso_id, b.codigo, c.titulo, b.edad, b.sexo, b.es_nna, b.ultima_ubicacion,
         b.estado_busqueda::text, b.custodia_verificada, b.autoridad_notificada,
         b.aprobado_en, b.creado_en
  from public.busqueda_casos b
  join public.casos c on c.id = b.caso_id
  where (public.es_admin() or public.es_mando_busqueda()
         or (public.es_enlace() and public.identidad_aprobada()))
    and b.estado_busqueda in ('coincidencia_pendiente','coincidencia_aprobada','derivado_autoridad')
  order by (b.estado_busqueda = 'coincidencia_pendiente') desc,
           (b.estado_busqueda = 'coincidencia_aprobada') desc,
           b.aprobado_en asc nulls last, b.creado_en asc
  limit 300;
$$;
grant execute on function public.listar_cola_enlace() to authenticated;
