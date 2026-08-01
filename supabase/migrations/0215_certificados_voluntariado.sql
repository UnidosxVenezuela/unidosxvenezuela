-- ============================================================
-- 0215 — Certificados de reconocimiento de voluntariado
-- ------------------------------------------------------------
-- Petición: que la administración pueda EMITIR el certificado de un miembro con sus
-- HORAS de voluntariado, y que esas horas se puedan AJUSTAR, porque hay actividades
-- que los voluntarios no registran en la plataforma.
--
-- EL PROBLEMA DE LAS HORAS: la migración 0164 cerró a propósito el alta y la edición
-- manual de `registro_horas` — la única vía es el conteo automático de sesión
-- (sumar_horas_sesion, 0017). Ese registro es la EVIDENCIA y no conviene tocarlo.
--
-- SOLUCIÓN (la que menos daña la integridad): no se modifica ni una fila de
-- `registro_horas`. Se añade una tabla de AJUSTES manuales que SUMA (o resta) horas,
-- cada uno con su MOTIVO, su autor y su fecha. El total de una persona pasa a ser
--   automáticas + ajustes
-- y ese mismo total es el que ve la persona y el que va al certificado. Es auditable
-- y reversible: borrar el ajuste devuelve el total anterior.
--
-- El certificado, además, CONGELA las horas y el nombre en el momento de emitirlo,
-- para que un documento ya entregado no cambie si después se registran más horas.
-- Idempotente. Ejecutar tras 0214.
-- ============================================================

-- ── (A) Ajustes manuales de horas ──
create table if not exists public.horas_ajustes (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references public.perfiles (id) on delete cascade,
  horas      numeric(6,2) not null check (horas <> 0 and horas >= -500 and horas <= 500),
  motivo     text not null check (length(btrim(motivo)) >= 3),
  fecha      date not null default current_date,
  creado_por uuid references public.perfiles (id) on delete set null,
  creado_en  timestamptz not null default now()
);
create index if not exists idx_horas_ajustes_perfil on public.horas_ajustes (perfil_id);

comment on table public.horas_ajustes is
  'Ajustes MANUALES de horas de voluntariado (0215): actividades que no quedaron registradas en la plataforma. Suman (o restan) al conteo automático de registro_horas, que NO se toca (0164). Cada ajuste exige motivo y queda a nombre de quien lo hizo.';

alter table public.horas_ajustes enable row level security;

-- Lectura: la propia persona (para que su total sea explicable) o la administración.
drop policy if exists hajus_select on public.horas_ajustes;
create policy hajus_select on public.horas_ajustes for select to authenticated
  using (perfil_id = auth.uid() or public.es_coordinacion());

-- Alta/baja: SOLO administración, y siempre a su nombre.
drop policy if exists hajus_insert on public.horas_ajustes;
create policy hajus_insert on public.horas_ajustes for insert to authenticated
  with check (public.es_coordinacion() and creado_por = auth.uid());

drop policy if exists hajus_delete on public.horas_ajustes;
create policy hajus_delete on public.horas_ajustes for delete to authenticated
  using (public.es_coordinacion());

-- ── (B) Total de horas de una persona = automáticas + ajustes ──
-- SECURITY DEFINER para poder sumar `registro_horas` de otra persona desde el panel de
-- administración (su RLS solo deja ver las propias). El permiso se comprueba aquí.
create or replace function public.horas_totales_perfil(p_perfil uuid)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v_auto numeric; v_ajus numeric;
begin
  if not (p_perfil = auth.uid() or public.es_coordinacion()) then
    raise exception 'No tienes permiso para consultar las horas de esta persona.' using errcode = '42501';
  end if;
  select coalesce(sum(horas), 0) into v_auto from public.registro_horas where perfil_id = p_perfil;
  select coalesce(sum(horas), 0) into v_ajus from public.horas_ajustes  where perfil_id = p_perfil;
  return greatest(v_auto + v_ajus, 0);
end $$;

revoke all on function public.horas_totales_perfil(uuid) from public;
grant execute on function public.horas_totales_perfil(uuid) to authenticated;

-- Desglose para el panel: automáticas, ajustes y total, en una sola llamada.
create or replace function public.horas_desglose_perfil(p_perfil uuid)
returns table (automaticas numeric, ajustes numeric, total numeric, primera_fecha date, ultima_fecha date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (p_perfil = auth.uid() or public.es_coordinacion()) then
    raise exception 'No tienes permiso para consultar las horas de esta persona.' using errcode = '42501';
  end if;
  return query
    select coalesce((select sum(h.horas) from public.registro_horas h where h.perfil_id = p_perfil), 0)::numeric,
           coalesce((select sum(a.horas) from public.horas_ajustes  a where a.perfil_id = p_perfil), 0)::numeric,
           public.horas_totales_perfil(p_perfil),
           (select min(x.fecha) from (
              select h.fecha from public.registro_horas h where h.perfil_id = p_perfil
              union all
              select a.fecha from public.horas_ajustes a where a.perfil_id = p_perfil) x),
           (select max(x.fecha) from (
              select h.fecha from public.registro_horas h where h.perfil_id = p_perfil
              union all
              select a.fecha from public.horas_ajustes a where a.perfil_id = p_perfil) x);
end $$;

revoke all on function public.horas_desglose_perfil(uuid) from public;
grant execute on function public.horas_desglose_perfil(uuid) to authenticated;

-- ── (C) Certificados emitidos ──
-- Congela nombre y horas: un certificado ya entregado no cambia aunque después se
-- sumen horas o se corrija el nombre.
create table if not exists public.certificados (
  id              uuid primary key default gen_random_uuid(),
  folio           text not null unique,
  perfil_id       uuid not null references public.perfiles (id) on delete cascade,
  nombre          text not null,
  horas           numeric(6,2) not null check (horas >= 0),
  periodo_inicio  date,
  periodo_fin     date,
  emitido_por     uuid references public.perfiles (id) on delete set null,
  emitido_en      timestamptz not null default now(),
  anulado_en      timestamptz,
  anulado_por     uuid references public.perfiles (id) on delete set null,
  motivo_anulacion text
);
create index if not exists idx_certificados_perfil on public.certificados (perfil_id);
create sequence if not exists public.certificados_folio_seq;

comment on table public.certificados is
  'Certificados de reconocimiento emitidos (0215). Congela nombre y horas en el momento de la emisión. El folio (APV-AAAA-NNNNNN) permite verificarlo.';

alter table public.certificados enable row level security;

-- Cada quien ve los SUYOS; la administración, todos.
drop policy if exists cert_select on public.certificados;
create policy cert_select on public.certificados for select to authenticated
  using (perfil_id = auth.uid() or public.es_coordinacion());

-- La emisión y la anulación van por RPC (abajo); nada de escritura directa del cliente.

-- ── (D) Emitir un certificado ──
-- `p_horas` NULL = usa el total vigente (automáticas + ajustes). Si se pasa un número,
-- ese es el que se certifica (permite el caso «lo hablamos y son estas horas»), y queda
-- registrado en la auditoría junto al total calculado, para poder contrastarlos.
create or replace function public.emitir_certificado(
  p_perfil uuid,
  p_horas  numeric default null,
  p_inicio date default null,
  p_fin    date default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_nombre text; v_total numeric; v_horas numeric; v_folio text; v_id uuid;
        v_ini date; v_fin date;
begin
  if not public.es_coordinacion() then
    raise exception 'Solo la administración puede emitir certificados.' using errcode = '42501';
  end if;

  select nombre_completo into v_nombre from public.perfiles where id = p_perfil;
  if v_nombre is null then
    raise exception 'Persona no encontrada.' using errcode = 'P0002';
  end if;
  if btrim(v_nombre) = '' then
    raise exception 'Esa persona no tiene nombre completo en su perfil; complétalo antes de emitir el certificado.'
      using errcode = '22023';
  end if;

  v_total := public.horas_totales_perfil(p_perfil);
  v_horas := coalesce(p_horas, v_total);
  if v_horas < 0 then
    raise exception 'Las horas del certificado no pueden ser negativas.' using errcode = '22023';
  end if;

  -- Período: si no se indica, se toma el recorrido real de la persona.
  select coalesce(p_inicio, d.primera_fecha), coalesce(p_fin, d.ultima_fecha)
    into v_ini, v_fin
  from public.horas_desglose_perfil(p_perfil) d;
  if v_ini is not null and v_fin is not null and v_fin < v_ini then
    raise exception 'El período no es válido: la fecha final es anterior a la inicial.' using errcode = '22023';
  end if;

  v_folio := 'APV-' || to_char(now(), 'YYYY') || '-' ||
             lpad(nextval('public.certificados_folio_seq')::text, 6, '0');

  insert into public.certificados (folio, perfil_id, nombre, horas, periodo_inicio, periodo_fin, emitido_por)
  values (v_folio, p_perfil, btrim(v_nombre), v_horas, v_ini, v_fin, auth.uid())
  returning id into v_id;

  perform public.registrar_auditoria('emitir_certificado', 'certificados', v_id::text,
    jsonb_build_object('folio', v_folio, 'perfil_id', p_perfil,
                       'horas_certificadas', v_horas, 'horas_calculadas', v_total));
  return v_id;
end $$;

revoke all on function public.emitir_certificado(uuid, numeric, date, date) from public;
grant execute on function public.emitir_certificado(uuid, numeric, date, date) to authenticated;

-- ── (E) Anular un certificado (errores de emisión) ──
create or replace function public.anular_certificado(p_certificado uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_motivo text;
begin
  if not public.es_coordinacion() then
    raise exception 'Solo la administración puede anular certificados.' using errcode = '42501';
  end if;
  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is null then
    raise exception 'Indica el motivo de la anulación.' using errcode = '22023';
  end if;

  update public.certificados
     set anulado_en = now(), anulado_por = auth.uid(), motivo_anulacion = v_motivo
   where id = p_certificado and anulado_en is null;
  if not found then
    raise exception 'El certificado no existe o ya estaba anulado.' using errcode = 'P0002';
  end if;

  perform public.registrar_auditoria('anular_certificado', 'certificados', p_certificado::text,
    jsonb_build_object('motivo', v_motivo));
end $$;

revoke all on function public.anular_certificado(uuid, text) from public;
grant execute on function public.anular_certificado(uuid, text) to authenticated;

-- ── (F) Ajustar horas (con motivo obligatorio) ──
-- Envuelve el INSERT para dejar la auditoría hecha y validar en un solo sitio.
create or replace function public.ajustar_horas(p_perfil uuid, p_horas numeric, p_motivo text, p_fecha date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_motivo text; v_id uuid;
begin
  if not public.es_coordinacion() then
    raise exception 'Solo la administración puede ajustar las horas.' using errcode = '42501';
  end if;
  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'Indica el motivo del ajuste (por ejemplo: «jornada de acopio del 20/7»).' using errcode = '22023';
  end if;
  if p_horas is null or p_horas = 0 then
    raise exception 'Indica cuántas horas sumar o restar.' using errcode = '22023';
  end if;

  insert into public.horas_ajustes (perfil_id, horas, motivo, fecha, creado_por)
  values (p_perfil, p_horas, v_motivo, coalesce(p_fecha, current_date), auth.uid())
  returning id into v_id;

  perform public.registrar_auditoria('ajustar_horas', 'perfil', p_perfil::text,
    jsonb_build_object('horas', p_horas, 'motivo', v_motivo));
  return v_id;
end $$;

revoke all on function public.ajustar_horas(uuid, numeric, text, date) from public;
grant execute on function public.ajustar_horas(uuid, numeric, text, date) to authenticated;
