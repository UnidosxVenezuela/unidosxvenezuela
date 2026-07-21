-- ============================================================
-- 0192 — Puente Captación → Donación-Ofrecimiento (sin re-tipear)
-- ------------------------------------------------------------
-- Una entidad del CRM de Captación (public.oportunidades) que decide DONAR había
-- que re-tipearla a mano como ofrecimiento (public.oportunidades_donacion) y se
-- perdía el vínculo. Esta migración añade:
--   · Columna de procedencia `captacion_oportunidad_id` en el ofrecimiento (con
--     índice único: 1 entidad de Captación → ≤1 ofrecimiento).
--   · RPC `crear_ofrecimiento_desde_captacion(p_oportunidad)` SECURITY DEFINER que
--     crea el ofrecimiento copiando los datos de la entidad y conservando el
--     vínculo. Idempotente: si ya se creó, devuelve el existente. Deja traza en la
--     bitácora del ofrecimiento.
-- Gate: Captación, Logística o administración (roles del área «donaciones»). Al
-- crearse, el trigger de aviso (0144) notifica a Logística/Verificación: el
-- handoff queda avisado. Idempotente. Ejecutar tras 0191.
-- ============================================================

alter table public.oportunidades_donacion
  add column if not exists captacion_oportunidad_id uuid references public.oportunidades(id) on delete set null;

create unique index if not exists idx_oportdon_captacion
  on public.oportunidades_donacion(captacion_oportunidad_id)
  where captacion_oportunidad_id is not null;

comment on column public.oportunidades_donacion.captacion_oportunidad_id is
  'Entidad del CRM de Captación (public.oportunidades) de la que nació este ofrecimiento (procedencia).';

create or replace function public.crear_ofrecimiento_desde_captacion(p_oportunidad uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_o record; v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado.' using errcode = '42501'; end if;
  if not (public.es_admin() or public.puede_captacion() or public.puede_logistica()) then
    raise exception 'Solo Captación, Logística o administración pueden crear el ofrecimiento.' using errcode = '42501';
  end if;

  select * into v_o from public.oportunidades where id = p_oportunidad;
  if v_o.id is null then
    raise exception 'No existe esa entidad de Captación.' using errcode = '42501';
  end if;

  -- Idempotente: si ya hay un ofrecimiento para esta entidad, devolverlo (no duplicar).
  select id into v_id from public.oportunidades_donacion
    where captacion_oportunidad_id = p_oportunidad limit 1;
  if v_id is not null then return v_id; end if;

  -- Las entidades de Captación son organizaciones/fundaciones/empresas → origen
  -- 'organizacion', clase 'donacion', tipo por defecto 'especie' (editable luego).
  insert into public.oportunidades_donacion
    (organizacion, contacto, descripcion, ubicacion, enlace,
     tipo_oferta, clase, origen, captacion_oportunidad_id, creado_por)
  values
    (v_o.titulo, v_o.contacto, v_o.descripcion, v_o.ubicacion, v_o.enlace,
     'especie', 'donacion', 'organizacion', p_oportunidad, auth.uid())
  returning id into v_id;

  -- Traza de procedencia en la bitácora del ofrecimiento.
  insert into public.bitacora_oportunidad (oportunidad_id, autor_id, contenido, canal, resultado)
  values (v_id, auth.uid(),
          'Ofrecimiento creado desde el CRM de Captación: «' || coalesce(v_o.titulo, '') ||
          '» (' || coalesce(v_o.categoria, '—') || ').', 'otro', 'positivo');

  return v_id;
end $$;

grant execute on function public.crear_ofrecimiento_desde_captacion(uuid) to authenticated;
