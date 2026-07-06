-- ============================================================
-- 0113 — Derivar un caso-requerimiento a Logística (Propuesta Fase 2)
-- ------------------------------------------------------------
-- Fase 2 de «De la información a la acción»: un caso CONFIRMADO que es una solicitud
-- de ayuda con ubicación (0112) se convierte en una SOLICITUD DE INSUMO enlazada, con
-- su tipo/cantidad/urgencia, para que Logística la coordine por estados hasta la
-- entrega. El enlace es bidireccional (caso ↔ solicitud) y ÚNICO por caso, para no
-- coordinar dos veces la misma necesidad.
--
-- · solicitudes_insumo += caso_id (FK a casos, on delete set null) + índice único
--   parcial (una sola solicitud por caso).
-- · derivar_caso_a_logistica(caso): SECURITY DEFINER — valida (requerimiento,
--   confirmado, ubicado, no Desaparecidos, no duplicado), crea la solicitud sellando
--   solicitado_por y caso_id, y deja traza en el historial del caso. Autoriza a la
--   Verificación (o admin/recopilación con identidad, o el creador). Salta la RLS de
--   solins_insert (owner) para poder validar/auditar de forma atómica.
-- · caso_de_solicitud(caso): devuelve numero+titulo del caso de origen a la audiencia
--   de Logística (admin/logística/verificación) SIN abrir la RLS de casos.
--
-- Reutiliza los enums existentes (tipo_insumo, prioridad, estado_insumo): la columna
-- req_tipo/req_urgencia del caso YA es de ese tipo, así que no hay casts de texto.
-- Idempotente. Ejecutar tras 0112.
-- ============================================================

-- ── Enlace caso ↔ solicitud ──
alter table public.solicitudes_insumo
  add column if not exists caso_id uuid references public.casos(id) on delete set null;

-- Una sola solicitud por caso (evita derivar/coordinar dos veces la misma necesidad).
create unique index if not exists uq_solins_caso
  on public.solicitudes_insumo (caso_id) where caso_id is not null;

-- ── Derivación (única vía: valida + crea + audita en una transacción) ──
create or replace function public.derivar_caso_a_logistica(p_caso uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_caso record; v_sol uuid;
begin
  select id, numero, titulo, descripcion, categoria, estado, es_requerimiento,
         lat, lng, req_tipo, req_cantidad, req_urgencia, creado_por
    into v_caso from public.casos where id = p_caso;
  if v_caso.id is null then raise exception 'Caso no encontrado.' using errcode = 'P0002'; end if;

  -- Autorización: la Verificación deriva (o admin, o recopilación con identidad, o el
  -- creador del caso). La RLS de casos ya restringe quién ve/confirma un caso.
  if not (public.es_admin() or public.puede_verificar() or public.opera_verificacion()
          or (public.tiene_rol('recopilacion') and public.identidad_aprobada())
          or v_caso.creado_por = auth.uid()) then
    raise exception 'No tienes permiso para derivar este caso a Logística.' using errcode = '42501';
  end if;

  -- Reglas de la propuesta: solo requerimientos CONFIRMADOS, ubicados y NO Desaparecidos.
  if not v_caso.es_requerimiento then
    raise exception 'Este caso no es una solicitud de ayuda con ubicación.'; end if;
  if v_caso.categoria is not distinct from 'Desaparecidos' then
    raise exception 'Los casos de «Desaparecidos» no se derivan a Logística.'; end if;
  if v_caso.estado::text not in ('confirmado', 'enviado_redaccion') then
    raise exception 'Solo se deriva un caso CONFIRMADO.'; end if;
  if v_caso.lat is null or v_caso.lng is null then
    raise exception 'El caso no tiene ubicación marcada en el mapa.'; end if;

  -- Enlace 1:1: no derivar dos veces el mismo caso.
  select id into v_sol from public.solicitudes_insumo where caso_id = p_caso;
  if v_sol is not null then
    raise exception 'Este caso ya fue derivado a Logística.' using errcode = '23505'; end if;

  insert into public.solicitudes_insumo
    (titulo, tipo, descripcion, cantidad, urgencia, estado, solicitado_por, caso_id)
  values (
    v_caso.titulo,
    coalesce(v_caso.req_tipo, 'otro'::public.tipo_insumo),
    v_caso.descripcion,
    v_caso.req_cantidad,
    coalesce(v_caso.req_urgencia, 'media'::public.prioridad),
    'solicitado'::public.estado_insumo,
    auth.uid(),
    p_caso
  ) returning id into v_sol;

  -- Traza en el historial del caso (lo pinta DetalleCaso).
  insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
  values (auth.uid(), 'casos:derivado', 'casos', p_caso::text,
          jsonb_build_object('solicitud_id', v_sol));

  return v_sol;
end $$;
grant execute on function public.derivar_caso_a_logistica(uuid) to authenticated;

-- ── Caso de origen para la vista de Logística (sin abrir la RLS de casos) ──
create or replace function public.caso_de_solicitud(p_caso uuid)
returns table (numero bigint, titulo text)
language sql stable security definer set search_path = public as $$
  select c.numero, c.titulo from public.casos c
  where c.id = p_caso
    and (public.es_admin() or public.puede_logistica() or public.puede_verificar());
$$;
grant execute on function public.caso_de_solicitud(uuid) to authenticated;
