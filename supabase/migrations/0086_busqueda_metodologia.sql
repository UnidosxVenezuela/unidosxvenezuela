-- ============================================================
-- 0086 — Metodología del Grupo de Búsqueda (Fase 1: modelo + intake + tablero)
-- ------------------------------------------------------------
-- El Grupo de Búsqueda (rol 'busqueda') atiende los casos de DESAPARECIDOS. Un
-- desaparecido sigue siendo una fila de `casos` (categoria='Desaparecidos') — así
-- se conservan el cruce con Coincidencias (0083), la frontera por categoría (0078)
-- y la 2ª verificación de identidad. Encima se añade una CAPA COMPANION 1:1
-- `busqueda_casos` con los datos y el flujo propios de su metodología, clonando el
-- patrón confidencial de Psicosocial (0052) y endureciéndolo según la revisión
-- adversarial del plan.
--
-- Predicado base de la capa:  es_admin() OR (es_busqueda() AND identidad_aprobada()).
-- Mando del equipo:  es_mando_busqueda() = admin, o líder del grupo 'busqueda', o
--   coordinador miembro de ese grupo — SIEMPRE con 2ª verificación (salvo admin).
--
-- Blindaje (revisión adversarial):
--   · La puerta de aprobación NO puede evadirse con un UPDATE directo: el buscador
--     queda acotado por `with check` a los estados operativos, y un trigger BEFORE
--     UPDATE bloquea las transiciones de cierre/mando y protege las columnas de
--     traza (aprobado_por/en, contacto_por/en) — solo escribibles por las funciones
--     DEFINER (Fase 3), señaladas con el flag transaccional app.busqueda_mando.
--   · El intake es ATÓMICO (RPC `crear_caso_busqueda`): crea el caso + la ficha en
--     una sola transacción; y un trigger ata la ficha a un caso 'Desaparecidos'.
--   · El código humano (A-00X / N-00X) se CONGELA en el alta y no muta si cambia es_nna.
--
-- Enum-safety: `estado_busqueda` es un TIPO NUEVO (sus valores se usan en la misma
-- migración sin riesgo). No se toca `rol_usuario`. Idempotente. Ejecutar tras 0085.
-- ============================================================

-- ── 1) Enum de estados del flujo de búsqueda (tipo nuevo) ──
do $$ begin
  create type public.estado_busqueda as enum (
    'activo', 'en_revision', 'coincidencia_pendiente', 'coincidencia_aprobada',
    'encontrado_fallecido', 'reunificado', 'derivado_autoridad', 'descartado'
  );
exception when duplicate_object then null; end $$;

-- ── 2) Mando del Grupo de Búsqueda ──
-- admin, o líder del grupo 'busqueda', o coordinador miembro de ese grupo. Exige
-- identidad_aprobada() salvo para admin (mismo invariante que el resto de la capa;
-- si no, un líder/coordinador sin 2ª verificación aprobaría por la vía DEFINER
-- filas que ni siquiera puede leer). Escopado SIEMPRE a clave='busqueda'.
create or replace function public.es_mando_busqueda()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or (
    public.identidad_aprobada() and (
      exists (select 1 from public.grupos g
              where g.clave = 'busqueda' and g.lider_id = auth.uid())
      or (public.tiene_rol('coordinador') and exists (
            select 1 from public.grupos g
            join public.miembros_grupo m on m.grupo_id = g.id
            where g.clave = 'busqueda' and m.perfil_id = auth.uid()))
    )
  );
$$;
grant execute on function public.es_mando_busqueda() to authenticated;

-- ── 3) Secuencia + tabla companion ──
create sequence if not exists public.busqueda_numero_seq;

create table if not exists public.busqueda_casos (
  id                  uuid primary key default gen_random_uuid(),
  caso_id             uuid not null unique references public.casos (id) on delete cascade,
  numero              bigint not null default nextval('public.busqueda_numero_seq'),
  codigo              text,                              -- A-00X / N-00X, congelado en el alta
  -- Persona (el nombre y la descripción viven en casos.titulo / casos.descripcion)
  sexo                text check (sexo is null or sexo in ('m','f','otro')),
  edad                int  check (edad is null or (edad >= 0 and edad <= 130)),
  ultima_ubicacion    text,
  es_nna              boolean not null default false,    -- menor de edad (NNA)
  -- Reporte
  reporta_nombre      text,
  reporta_telefono    text,
  -- Flujo
  estado_busqueda     public.estado_busqueda not null default 'activo',
  fuente_verifico     text,                              -- plataforma que verificó
  proxima_revision    timestamptz not null default now() + interval '12 hours',
  ultimo_recordatorio timestamptz,
  -- NNA
  custodia_verificada  boolean not null default false,
  autoridad_notificada boolean not null default false,
  -- Traza del mando (aprobación) y del enlace (llamada). Protegidas por trigger.
  aprobado_por        uuid references public.perfiles (id) on delete set null,
  aprobado_en         timestamptz,
  contacto_por        uuid references public.perfiles (id) on delete set null,
  contacto_en         timestamptz,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
create index if not exists idx_busqueda_estado   on public.busqueda_casos (estado_busqueda);
create index if not exists idx_busqueda_revision  on public.busqueda_casos (proxima_revision);
create index if not exists idx_busqueda_nna       on public.busqueda_casos (es_nna);

-- ── 4) Código humano congelado (A-00X adulto / N-00X NNA) ──
-- Se calcula UNA vez en el INSERT desde el es_nna de ese instante; luego el
-- trigger de blindaje lo mantiene inmutable, así el identificador no muta si el
-- caso se reclasifica (las reglas NNA se aplican por el boolean, no por el prefijo).
create or replace function public.busqueda_casos_codigo()
returns trigger language plpgsql set search_path = public as $$
begin
  new.codigo := (case when coalesce(new.es_nna, false) then 'N-' else 'A-' end)
                || lpad(new.numero::text, 3, '0');
  return new;
end $$;
drop trigger if exists trg_busqueda_codigo on public.busqueda_casos;
create trigger trg_busqueda_codigo before insert on public.busqueda_casos
  for each row execute function public.busqueda_casos_codigo();

-- ── 5) Integridad de frontera: la ficha solo cuelga de un caso 'Desaparecidos' ──
create or replace function public.busqueda_casos_categoria()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select categoria from public.casos where id = new.caso_id) is distinct from 'Desaparecidos' then
    raise exception 'La ficha de búsqueda solo puede asociarse a un caso de Desaparecidos.'
      using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists trg_busqueda_categoria on public.busqueda_casos;
create trigger trg_busqueda_categoria before insert or update of caso_id on public.busqueda_casos
  for each row execute function public.busqueda_casos_categoria();

-- El caso no puede salir de 'Desaparecidos' mientras tenga ficha de búsqueda.
create or replace function public.casos_proteger_categoria_busqueda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.categoria is distinct from old.categoria
     and old.categoria = 'Desaparecidos'
     and exists (select 1 from public.busqueda_casos b where b.caso_id = new.id) then
    raise exception 'No se puede cambiar la categoría: el caso tiene una ficha de búsqueda asociada.'
      using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_casos_categoria_busqueda on public.casos;
create trigger trg_casos_categoria_busqueda before update of categoria on public.casos
  for each row execute function public.casos_proteger_categoria_busqueda();

-- ── 6) Blindaje de la ficha (BEFORE UPDATE) ──
-- (a) numero/codigo inmutables; (b) columnas de traza solo escribibles por las
-- funciones DEFINER (flag transaccional app.busqueda_mando='1'); (c) las
-- transiciones a estados de cierre/mando solo por el mando o por esas funciones.
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
drop trigger if exists trg_busqueda_blindaje on public.busqueda_casos;
create trigger trg_busqueda_blindaje before update on public.busqueda_casos
  for each row execute function public.busqueda_casos_blindaje();

-- ── 7) RLS ──
alter table public.busqueda_casos enable row level security;

-- SELECT: admin o buscador con 2ª verificación. (La rama del Enlace se añade en Fase 3.)
drop policy if exists "busqueda_casos_select" on public.busqueda_casos;
create policy "busqueda_casos_select" on public.busqueda_casos for select to authenticated
  using (public.es_admin() or (public.es_busqueda() and public.identidad_aprobada()));

-- INSERT: normalmente por la RPC atómica (DEFINER). Si se inserta directo, se exige
-- el predicado de la capa y que arranque en 'activo' (no crear ya en un cierre).
drop policy if exists "busqueda_casos_insert" on public.busqueda_casos;
create policy "busqueda_casos_insert" on public.busqueda_casos for insert to authenticated
  with check ((public.es_admin() or (public.es_busqueda() and public.identidad_aprobada()))
              and estado_busqueda = 'activo');

-- UPDATE: la rama del buscador queda acotada por `with check` a los estados
-- operativos; el mando/admin pueden cualquier estado. El trigger de blindaje
-- refuerza las transiciones y las columnas de traza.
drop policy if exists "busqueda_casos_update" on public.busqueda_casos;
create policy "busqueda_casos_update" on public.busqueda_casos for update to authenticated
  using (public.es_admin() or (public.es_busqueda() and public.identidad_aprobada()))
  with check (
    public.es_admin() or public.es_mando_busqueda()
    or (public.es_busqueda() and public.identidad_aprobada()
        and estado_busqueda in ('activo','en_revision','coincidencia_pendiente'))
  );

-- DELETE: admin o mando (con la es_mando_busqueda endurecida, ya exige identidad).
drop policy if exists "busqueda_casos_delete" on public.busqueda_casos;
create policy "busqueda_casos_delete" on public.busqueda_casos for delete to authenticated
  using (public.es_admin() or public.es_mando_busqueda());

-- ── 8) Intake atómico: crea el caso Desaparecido + su ficha en una transacción ──
create or replace function public.crear_caso_busqueda(
  p_titulo           text,
  p_descripcion      text default null,
  p_edad             int  default null,
  p_sexo             text default null,
  p_ultima_ubicacion text default null,
  p_es_nna           boolean default false,
  p_reporta_nombre   text default null,
  p_reporta_telefono text default null,
  p_fuente           text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_caso uuid;
begin
  if not (public.es_admin() or (public.es_busqueda() and public.identidad_aprobada())) then
    raise exception 'No tienes permiso para registrar un caso de búsqueda.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_titulo), '') = '' then
    raise exception 'El nombre de la persona es obligatorio.';
  end if;

  insert into public.casos (titulo, descripcion, categoria, fuente, estado, creado_por)
  values (btrim(p_titulo), nullif(btrim(p_descripcion), ''), 'Desaparecidos',
          nullif(btrim(p_fuente), ''), 'en_proceso', auth.uid())
  returning id into v_caso;

  insert into public.busqueda_casos (
    caso_id, edad, sexo, ultima_ubicacion, es_nna,
    reporta_nombre, reporta_telefono, fuente_verifico
  ) values (
    v_caso, p_edad, nullif(btrim(p_sexo), ''), nullif(btrim(p_ultima_ubicacion), ''),
    coalesce(p_es_nna, false), nullif(btrim(p_reporta_nombre), ''),
    nullif(btrim(p_reporta_telefono), ''), nullif(btrim(p_fuente), '')
  );

  return v_caso;
end $$;
grant execute on function public.crear_caso_busqueda(text, text, int, text, text, boolean, text, text, text) to authenticated;

-- ── 9) Resumen agregado para supervisión (admin) — sin exponer filas ──
-- Mismo umbral de 2ª verificación que el resto de la capa (no es_busqueda() a secas).
create or replace function public.resumen_busqueda()
returns table (
  total                 bigint,
  activos               bigint,
  en_revision           bigint,
  coincidencia_pendiente bigint,
  coincidencia_aprobada bigint,
  reunificados          bigint,
  derivados_autoridad   bigint,
  encontrado_fallecido  bigint,
  descartados           bigint,
  sin_asignar           bigint,
  nna                   bigint,
  vencidos              bigint,
  nuevos_7d             bigint
) language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.es_admin() or (public.es_busqueda() and public.identidad_aprobada())) then
    raise exception 'Sin permiso para ver el resumen de búsqueda.' using errcode = '42501';
  end if;
  return query
  select
    count(*)::bigint,
    count(*) filter (where b.estado_busqueda = 'activo')::bigint,
    count(*) filter (where b.estado_busqueda = 'en_revision')::bigint,
    count(*) filter (where b.estado_busqueda = 'coincidencia_pendiente')::bigint,
    count(*) filter (where b.estado_busqueda = 'coincidencia_aprobada')::bigint,
    count(*) filter (where b.estado_busqueda = 'reunificado')::bigint,
    count(*) filter (where b.estado_busqueda = 'derivado_autoridad')::bigint,
    count(*) filter (where b.estado_busqueda = 'encontrado_fallecido')::bigint,
    count(*) filter (where b.estado_busqueda = 'descartado')::bigint,
    count(*) filter (where c.asignado_a is null
                       and b.estado_busqueda in ('activo','en_revision','coincidencia_pendiente'))::bigint,
    count(*) filter (where b.es_nna)::bigint,
    count(*) filter (where b.estado_busqueda in ('activo','en_revision')
                       and b.proxima_revision <= now())::bigint,
    count(*) filter (where b.creado_en > now() - interval '7 days')::bigint
  from public.busqueda_casos b
  join public.casos c on c.id = b.caso_id;
end $$;
grant execute on function public.resumen_busqueda() to authenticated;

-- ── 10) Backfill: cada Desaparecido existente recibe su ficha (idempotente) ──
-- Así el tablero /busqueda muestra TODOS los desaparecidos (los previos, creados
-- por /casos, y los nuevos por el intake), sin dejar casos sin ficha companion.
insert into public.busqueda_casos (caso_id)
select c.id from public.casos c
where c.categoria = 'Desaparecidos'
  and not exists (select 1 from public.busqueda_casos b where b.caso_id = c.id);

-- ── 11) Auditoría + realtime ──
drop trigger if exists aud_busqueda_casos on public.busqueda_casos;
create trigger aud_busqueda_casos after insert or update or delete on public.busqueda_casos
  for each row execute function public.auditar_cambio();

do $$ begin alter publication supabase_realtime add table public.busqueda_casos; exception when duplicate_object then null; end $$;
