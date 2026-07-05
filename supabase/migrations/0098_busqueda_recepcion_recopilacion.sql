-- ============================================================
-- 0098 — Búsqueda RECIBE los casos de Recopilación (no los crea)
-- ------------------------------------------------------------
-- Corrección de flujo: el equipo de Búsqueda NO crea casos. Recopilación reporta
-- la información y, cuando marca un caso con categoría «Desaparecidos», ese caso
-- debe aparecer solo en el tablero /busqueda para que el equipo lo tome y trabaje.
--
-- Hoy el tablero /busqueda se alimenta de la tabla companion `busqueda_casos`, y
-- esa ficha solo se creaba desde el intake propio de Búsqueda (`crear_caso_busqueda`)
-- o desde un backfill de una-sola-vez (0086). Por eso un «Desaparecido» creado por
-- Recopilación en /casos quedaba SIN ficha y nunca llegaba a Búsqueda.
--
-- Esta migración:
--   1) Añade `casos.es_nna` (pista de intake: ¿la persona es menor?), que Recopilación
--      marca al crear el caso, para que el menor vaya directo al equipo Buscador NNA.
--   2) Crea un DISPARADOR: al insertar (o recategorizar a) un caso «Desaparecidos»,
--      se crea automáticamente su ficha `busqueda_casos` (respetando la separación
--      adultos/NNA). Reemplaza el backfill de-una-vez por un mecanismo vivo.
--   3) Re-encauza `crear_caso_busqueda` a SOLO admin (utilería interna) y lo hace
--      idempotente frente al disparador (upsert). La UI de Búsqueda ya no lo expone.
--   4) Backfill idempotente para los «Desaparecidos» que hoy no tengan ficha.
-- Idempotente. Ejecutar tras 0097.
-- ============================================================

-- ── 1) Pista de intake: ¿la persona reportada es menor de edad (NNA)? ──
-- La clasificación de trabajo vive en `busqueda_casos.es_nna` (reclasificable por el
-- mando); esta columna es el valor con el que NACE la ficha al marcarse «Desaparecidos».
alter table public.casos add column if not exists es_nna boolean not null default false;

-- ── 2) Disparador: «Desaparecidos» ⇒ ficha de búsqueda automática ──
-- SECURITY DEFINER: quien crea el caso (p. ej. Recopilación) no tiene INSERT sobre
-- `busqueda_casos` por RLS; el disparador la crea saltando la RLS. Crea-si-no-existe
-- para no chocar con `crear_caso_busqueda` ni duplicar en recategorizaciones.
create or replace function public.crear_ficha_busqueda_auto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.categoria = 'Desaparecidos'
     and not exists (select 1 from public.busqueda_casos b where b.caso_id = new.id) then
    insert into public.busqueda_casos (caso_id, es_nna)
    values (new.id, coalesce(new.es_nna, false));
  end if;
  return new;
end $$;

drop trigger if exists trg_casos_ficha_busqueda on public.casos;
create trigger trg_casos_ficha_busqueda
  after insert or update of categoria on public.casos
  for each row when (new.categoria = 'Desaparecidos')
  execute function public.crear_ficha_busqueda_auto();

-- ── 3) `crear_caso_busqueda`: idempotente frente al disparador (upsert) ──
-- El equipo de Búsqueda ya NO crea casos: la UI /busqueda/nuevo se retira. Se
-- conserva la RPC (utilería interna/admin) pero ahora a prueba del disparador: al
-- insertar el caso «Desaparecidos» el trigger YA crea la ficha, así que aquí se hace
-- upsert para completar los datos estructurados sin chocar con la clave única.
drop function if exists public.crear_caso_busqueda(text, text, int, text, text, boolean, text, text, text, text);
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

  -- El caso nace «Desaparecidos» con la pista es_nna → el disparador crea la ficha.
  insert into public.casos (titulo, descripcion, categoria, fuente, estado, creado_por, es_nna)
  values (btrim(p_titulo), nullif(btrim(p_descripcion), ''), 'Desaparecidos',
          nullif(btrim(p_fuente), ''), 'en_proceso', auth.uid(), v_nna)
  returning id into v_caso;

  -- Completa/afina los datos estructurados sobre la ficha ya creada por el trigger.
  insert into public.busqueda_casos (
    caso_id, edad, sexo, ultima_ubicacion, es_nna,
    reporta_nombre, reporta_telefono, fuente_verifico, situacion
  ) values (
    v_caso, p_edad, nullif(btrim(p_sexo), ''), nullif(btrim(p_ultima_ubicacion), ''),
    v_nna, nullif(btrim(p_reporta_nombre), ''),
    nullif(btrim(p_reporta_telefono), ''), nullif(btrim(p_fuente), ''), p_situacion
  )
  on conflict (caso_id) do update set
    edad = excluded.edad, sexo = excluded.sexo, ultima_ubicacion = excluded.ultima_ubicacion,
    es_nna = excluded.es_nna, reporta_nombre = excluded.reporta_nombre,
    reporta_telefono = excluded.reporta_telefono, fuente_verifico = excluded.fuente_verifico,
    situacion = excluded.situacion;

  return v_caso;
end $$;
grant execute on function public.crear_caso_busqueda(text, text, int, text, text, boolean, text, text, text, text) to authenticated;

-- ── 4) Backfill idempotente: «Desaparecidos» sin ficha reciben la suya ──
insert into public.busqueda_casos (caso_id, es_nna)
select c.id, coalesce(c.es_nna, false) from public.casos c
where c.categoria = 'Desaparecidos'
  and not exists (select 1 from public.busqueda_casos b where b.caso_id = c.id);
