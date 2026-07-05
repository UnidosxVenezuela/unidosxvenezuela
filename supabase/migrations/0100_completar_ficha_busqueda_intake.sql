-- ============================================================
-- 0100 — Recopilación completa la ficha de búsqueda en el intake del caso
-- ------------------------------------------------------------
-- Cuando Recopilación crea un caso «Desaparecidos», el disparador (0098) crea su
-- ficha `busqueda_casos`, pero los datos de la persona (edad, sexo, última ubicación,
-- situación) y del reporte (quién reporta + teléfono) quedaban en blanco hasta que el
-- Grupo de Búsqueda los llenaba. Para que la ficha llegue MÁS COMPLETA, Recopilación
-- captura esos datos en el mismo formulario; esta RPC (SECURITY DEFINER) los vuelca en
-- la ficha, saltando la RLS de `busqueda_casos` (que el recopilador no puede tocar).
--
-- Autorización: solo el CREADOR del caso (o un admin). Solo rellena lo que se envía
-- (coalesce), sin pisar lo ya existente. No toca columnas blindadas (estado, es_nna,
-- traza…). Idempotente. Ejecutar tras 0099.
-- ============================================================

create or replace function public.completar_ficha_busqueda(
  p_caso             uuid,
  p_edad             int  default null,
  p_sexo             text default null,
  p_ultima_ubicacion text default null,
  p_situacion        text default null,
  p_reporta_nombre   text default null,
  p_reporta_telefono text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.es_admin() or exists (
    select 1 from public.casos c where c.id = p_caso and c.creado_por = auth.uid()
  )) then
    raise exception 'Solo quien reporta el caso (o un admin) puede completar su ficha.' using errcode = '42501';
  end if;
  if p_sexo is not null and nullif(btrim(p_sexo), '') is not null and p_sexo not in ('m','f','otro') then
    raise exception 'Sexo no válido.';
  end if;
  if p_situacion is not null and p_situacion not in
     ('reportado','hospitalizado','refugio','fallecido','no_identificado') then
    raise exception 'Situación no válida.';
  end if;
  if p_edad is not null and (p_edad < 0 or p_edad > 130) then
    raise exception 'Edad no válida.';
  end if;

  update public.busqueda_casos set
    edad             = coalesce(p_edad, edad),
    sexo             = coalesce(nullif(btrim(p_sexo), ''), sexo),
    ultima_ubicacion = coalesce(nullif(btrim(p_ultima_ubicacion), ''), ultima_ubicacion),
    situacion        = coalesce(p_situacion, situacion),
    reporta_nombre   = coalesce(nullif(btrim(p_reporta_nombre), ''), reporta_nombre),
    reporta_telefono = coalesce(nullif(btrim(p_reporta_telefono), ''), reporta_telefono)
  where caso_id = p_caso;
end $$;
grant execute on function public.completar_ficha_busqueda(uuid, int, text, text, text, text, text) to authenticated;
