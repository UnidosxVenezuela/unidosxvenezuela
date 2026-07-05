-- ============================================================
-- 0095 — Búsqueda Fase 7: situación del caso de desaparecido
-- ------------------------------------------------------------
-- Gestión de Casos alimenta a los buscadores con casos de desaparecidos de
-- distintas SITUACIONES (una desaparición reportada, o una persona ya localizada
-- en un hospital / refugio, un reporte de fallecimiento, o una persona no
-- identificada). Se registra la situación en el intake para priorizar y enrutar.
-- Campo informativo (no sensible): lo edita el buscador como edad/sexo. Idempotente.
-- ============================================================

alter table public.busqueda_casos
  add column if not exists situacion text
    check (situacion is null or situacion in
      ('reportado','hospitalizado','refugio','fallecido','no_identificado'));

create index if not exists idx_busqueda_situacion on public.busqueda_casos (situacion);

-- Intake atómico: se añade p_situacion. Cambia la firma → se borra la anterior.
drop function if exists public.crear_caso_busqueda(text, text, int, text, text, boolean, text, text, text);
create or replace function public.crear_caso_busqueda(
  p_titulo           text,
  p_descripcion      text default null,
  p_edad             int  default null,
  p_sexo             text default null,
  p_ultima_ubicacion text default null,
  p_es_nna           boolean default false,
  p_reporta_nombre   text default null,
  p_reporta_telefono text default null,
  p_fuente           text default null,
  p_situacion        text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_caso uuid; v_nna boolean := coalesce(p_es_nna, false);
begin
  if v_nna then
    if not (public.es_admin() or public.es_mando_busqueda()
            or (public.es_buscador_nna() and public.identidad_aprobada())) then
      raise exception 'Solo un Buscador NNA (o el mando) puede registrar un caso de menor.' using errcode = '42501';
    end if;
  else
    if not (public.es_admin() or public.es_mando_busqueda()
            or (public.es_busqueda() and public.identidad_aprobada())) then
      raise exception 'No tienes permiso para registrar un caso de búsqueda.' using errcode = '42501';
    end if;
  end if;
  if coalesce(btrim(p_titulo), '') = '' then
    raise exception 'El nombre de la persona es obligatorio.';
  end if;
  if p_situacion is not null and p_situacion not in
     ('reportado','hospitalizado','refugio','fallecido','no_identificado') then
    raise exception 'Situación no válida.';
  end if;

  insert into public.casos (titulo, descripcion, categoria, fuente, estado, creado_por)
  values (btrim(p_titulo), nullif(btrim(p_descripcion), ''), 'Desaparecidos',
          nullif(btrim(p_fuente), ''), 'en_proceso', auth.uid())
  returning id into v_caso;

  insert into public.busqueda_casos (
    caso_id, edad, sexo, ultima_ubicacion, es_nna,
    reporta_nombre, reporta_telefono, fuente_verifico, situacion
  ) values (
    v_caso, p_edad, nullif(btrim(p_sexo), ''), nullif(btrim(p_ultima_ubicacion), ''),
    v_nna, nullif(btrim(p_reporta_nombre), ''),
    nullif(btrim(p_reporta_telefono), ''), nullif(btrim(p_fuente), ''), p_situacion
  );

  return v_caso;
end $$;
grant execute on function public.crear_caso_busqueda(text, text, int, text, text, boolean, text, text, text, text) to authenticated;
