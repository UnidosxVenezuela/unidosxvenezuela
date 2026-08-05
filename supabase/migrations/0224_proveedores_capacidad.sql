-- ============================================================
-- 0224 — CAPACIDAD OFERTADA POR PROVEEDOR: qué puede cubrir, cada cuánto y cuánto le queda
-- ------------------------------------------------------------
-- ANTES: `public.proveedores` (0050) era un directorio de tres campos —nombre, tipo,
--   contacto— y nada más. De un aliado que Alianzas conseguía sabíamos su teléfono, pero
--   NO con qué se podía contar: ni qué cubre, ni cuánto, ni cada cuánto tiempo, ni si el
--   compromiso era «una sola vez», «hasta fin de mes» o «todas las semanas». Logística
--   pedía a ciegas y descubría el límite al chocar contra él. Peor: el proveedor no
--   estaba enlazado con el CRM de Alianzas (`public.oportunidades`), así que la empresa
--   que Alianzas trabajaba durante semanas aparecía otra vez, escrita a mano, como una
--   fila nueva y sin historia en el directorio de Logística (§2.12: CUATRO registros de
--   «quién da» y ninguno enlazado).
--
-- AHORA, las tres cosas que se pidieron, en este orden:
--   (a) ALIANZAS DECLARA QUÉ Y CUÁNTO. `public.proveedor_capacidades`: una fila por cosa
--       que el aliado se compromete a cubrir, con su tipo, su cantidad y su unidad
--       («50 comidas», «200 kg de arroz», «1 camión»).
--   (b) CON QUÉ PERIODICIDAD. `periodicidad` ∈ unica · semanal · quincenal · mensual ·
--       trimestral, más `vigencia_desde`/`vigencia_hasta` para el compromiso «por tiempo
--       limitado». Las tres formas que describió el pedido quedan representables:
--         · «solo de una vez»      → periodicidad='unica' (la cantidad es un POZO que se agota)
--         · «por un tiempo limitado» → recurrente + vigencia_hasta
--         · «50 comidas semanales» → periodicidad='semanal', sin vigencia_hasta
--   (c) LOGÍSTICA VE LO QUE QUEDA. `public.capacidad_restante(uuid)` = cantidad − lo ya
--       consumido EN LA VENTANA VIGENTE. No es una estimación: se descuenta de los aportes
--       REALES (`casos_item_aportes`, 0221) enlazados por la columna nueva `capacidad_id`.
--
-- ── POR QUÉ EL CONSUMO SALE DE LOS APORTES Y NO DE UN CONTADOR ──
--   Un contador propio («ya le pedí 30») se desincroniza el día que alguien corrige o
--   borra un aporte, y 0221 permite exactamente eso (`eliminar_aporte_item`). Colgando el
--   consumo de `casos_item_aportes.capacidad_id`, corregir el aporte corrige la capacidad
--   restante en el mismo instante y sin trigger que mantener. Es el mismo criterio con el
--   que 0221 sacó el porcentaje de cumplimiento de la suma de aportes y no de un campo.
--
-- ── LA VENTANA VIGENTE (el cálculo que da sentido a todo) ──
--   «Cuánta capacidad le queda» solo significa algo dentro de un periodo. En una capacidad
--   SEMANAL cuenta la semana en curso, no el histórico: si el aliado da 50 comidas por
--   semana y la semana pasada se pidieron 50, esta semana vuelve a haber 50.
--   `public.ventana_capacidad(periodicidad, ancla, referencia)` devuelve el `daterange`
--   del periodo en curso, y la regla es UNA sola para todas las periodicidades:
--     · el ANCLA es `vigencia_desde` y, si no se declaró, la fecha en que se creó la
--       capacidad. Las ventanas se cuentan DESDE EL COMPROMISO, no desde el calendario.
--       Es la única definición que funciona para 'quincenal' —no existe una «quincena de
--       calendario» canónica— y la que coincide con lo que se pactó: «50 comidas cada
--       semana desde el 3 de junio» son [3-jun, 10-jun), [10-jun, 17-jun)…
--     · 'unica' NO tiene ventana: la cantidad es un pozo que se agota y cuenta TODO el
--       histórico. Se representa con un rango sin límites, que contiene cualquier fecha.
--     · en 'mensual'/'trimestral' la aritmética de meses de Postgres RECORTA el día
--       (31-ene + 1 mes = 28-feb), así que la cuenta directa puede quedar corta o pasada
--       por uno. Se corrige con dos bucles de ajuste que en la práctica dan como mucho
--       una vuelta. Está probado con el caso 31-ene → 28-feb.
--   Todo se calcula en HORA DE VENEZUELA (`America/Caracas`), no en la del servidor: el
--   corte de una semana no puede depender de que el runtime esté en UTC. Es el mismo
--   criterio de `apps/web/lib/fechas.ts`.
--
-- ── FUERA DE VIGENCIA = CERO, NO «SIN DATOS» ──
--   Una capacidad caducada, aún no iniciada, retirada, o de un proveedor dado de baja
--   devuelve `capacidad_restante = 0`: la pregunta que responde esta función es «con qué
--   puedo contar HOY». El MOTIVO no se pierde —`capacidades_de_proveedor()` devuelve
--   `estado_vigencia` ('vigente'/'pendiente'/'caducada'/'retirada'/'proveedor_inactivo')
--   y los días que faltan para caducar—, de modo que la interfaz distingue «se agotó» de
--   «se acabó el trato», que operativamente no es lo mismo.
--
-- ── EL PUENTE CON EL CRM DE ALIANZAS ──
--   `proveedores.oportunidad_id` + índice único parcial: espejo EXACTO del puente
--   `oportunidades_donacion.captacion_oportunidad_id` de 0192 (1 entidad del CRM → ≤1
--   proveedor). Con él, «el proveedor que Alianzas logró concretar» deja de ser una fila
--   suelta y arrastra su historia. `crear_proveedor_desde_oportunidad()` lo crea copiando
--   los datos del CRM y es idempotente por el índice.
--   ⚠ 0192 dejó `crear_ofrecimiento_desde_captacion` SIN `revoke all … from public` —el
--   agujero que ya documentó el análisis para `solicitud_logistica_de_caso` (0208)—. Aquí
--   TODAS las funciones llevan su revoke, incluidas las que no se llaman desde la app.
--
-- ── RLS ──
--   Lectura `es_verificado()` para las dos tablas nuevas y ninguna policy de escritura:
--   deny-by-default con RLS activa y una única puerta, las RPC SECURITY DEFINER con gate
--   `puede_logistica() or puede_alianzas()`. NUNCA un `exists (select 1 from public.casos …)`
--   ni nada equivalente en el SELECT (§2.4). Y no se toca `prov_gestion` (0050, `for all`
--   con `puede_logistica()`): Alianzas escribe proveedores por RPC, no ampliando la policy
--   —doctrina de 0156/0213—.
--
-- ENUM-SAFETY: cero valores de enum nuevos. `periodicidad` es TEXT + CHECK con nombre
--   propio (`chk_capacidad_periodicidad`), re-emitido con drop/add (precedentes 0189,
--   0145, 0177, 0221). `tipo` REUTILIZA el enum existente `public.tipo_insumo`, igual que
--   `casos_items.tipo` (0218).
--
-- Idempotente. Ejecutar tras 0223 (no depende de ella: sus dependencias reales son
-- 0218 —el desglose— y 0221 —el libro de aportes—).
-- ============================================================

-- ═══ (1) El proveedor, enlazado con el CRM de Alianzas y con baja lógica ═══
alter table public.proveedores
  add column if not exists oportunidad_id uuid references public.oportunidades(id) on delete set null;
alter table public.proveedores
  add column if not exists activo boolean not null default true;

-- Espejo exacto de idx_oportdon_captacion (0192): 1 entidad del CRM → ≤1 proveedor.
create unique index if not exists idx_prov_oportunidad
  on public.proveedores (oportunidad_id) where oportunidad_id is not null;

comment on column public.proveedores.oportunidad_id is
  'Entidad del CRM de Alianzas Estratégicas (public.oportunidades) que se CONCRETÓ en este proveedor (0224). Espejo del puente de 0192: índice único parcial, una entidad → un proveedor como mucho.';
comment on column public.proveedores.activo is
  'Baja LÓGICA del proveedor (0224). Un proveedor inactivo conserva su historia y sus aportes, pero su capacidad restante es 0: con él ya no se cuenta. Molde 0138 (grupos.activa), reversible.';

-- ═══ (2) La capacidad declarada ═══
create table if not exists public.proveedor_capacidades (
  id             uuid primary key default gen_random_uuid(),
  proveedor_id   uuid not null references public.proveedores(id) on delete cascade,
  tipo           public.tipo_insumo not null default 'otro',
  descripcion    text not null,
  cantidad       numeric not null check (cantidad > 0),
  unidad         text,
  periodicidad   text not null default 'unica',
  puntual        boolean not null default true,
  vigencia_desde date,
  vigencia_hasta date,
  activa         boolean not null default true,
  notas          text,
  creado_por     uuid references public.perfiles(id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_prov_capacidades      on public.proveedor_capacidades (proveedor_id, tipo);
create index if not exists idx_prov_capacidades_tipo on public.proveedor_capacidades (tipo) where activa;

-- Los CHECK van por ALTER con nombre propio y drop/add: la migración converge en una base
-- donde la tabla ya existiera, y añadir una periodicidad mañana es una línea (nunca un
-- `alter type`, ver ENUM-SAFETY en la cabecera).
alter table public.proveedor_capacidades drop constraint if exists chk_capacidad_periodicidad;
alter table public.proveedor_capacidades add  constraint chk_capacidad_periodicidad
  check (periodicidad in ('unica', 'semanal', 'quincenal', 'mensual', 'trimestral'));

-- `puntual` es el espejo booleano e indexable de «no se renueva». Se deja como columna
-- —y no como cálculo en cada consulta— porque es lo que la interfaz y la reportería
-- filtran («¿con qué compromisos recurrentes contamos?»), y se ata con un CHECK para que
-- no pueda divergir NUNCA de la periodicidad. Lo calcula la RPC; nadie lo escribe a mano.
alter table public.proveedor_capacidades drop constraint if exists chk_capacidad_puntual;
alter table public.proveedor_capacidades add  constraint chk_capacidad_puntual
  check (puntual = (periodicidad = 'unica'));

-- «Por un tiempo limitado» tiene que ser un intervalo con sentido.
alter table public.proveedor_capacidades drop constraint if exists chk_capacidad_vigencia;
alter table public.proveedor_capacidades add  constraint chk_capacidad_vigencia
  check (vigencia_desde is null or vigencia_hasta is null or vigencia_hasta >= vigencia_desde);

comment on table public.proveedor_capacidades is
  'Capacidad OFERTADA por un proveedor o aliado (0224): qué puede cubrir, cuánto, con qué periodicidad y entre qué fechas. Es lo que Alianzas declara al concretar el acuerdo y lo que le permite a Logística saber con qué capacidad de respuesta se cuenta. Lectura para cuentas verificadas; escritura solo por RPC SECURITY DEFINER con gate puede_logistica() or puede_alianzas().';
comment on column public.proveedor_capacidades.periodicidad is
  'Cada cuánto se RENUEVA la cantidad: unica (no se renueva: es un pozo que se agota) · semanal · quincenal · mensual · trimestral. TEXT + CHECK a propósito (chk_capacidad_periodicidad), nunca un enum nuevo.';
comment on column public.proveedor_capacidades.puntual is
  'TRUE si el compromiso es de UNA SOLA VEZ. Espejo de periodicidad=''unica'', atado por chk_capacidad_puntual para que no pueda divergir. Lo calcula guardar_capacidad_proveedor().';
comment on column public.proveedor_capacidades.vigencia_hasta is
  'Fecha en la que CADUCA el compromiso («por un tiempo limitado»). A partir del día siguiente la capacidad restante es 0 y estado_vigencia pasa a ''caducada''. NULL = sin fecha de fin.';
comment on column public.proveedor_capacidades.activa is
  'Retirada lógica de la capacidad. eliminar_capacidad_proveedor() la usa —en vez de borrar— cuando ya hay aportes consumidos contra ella, para no perder la historia de lo entregado.';

-- ═══ (3) RLS — lectura para cuentas verificadas; escritura solo por RPC ═══
alter table public.proveedor_capacidades enable row level security;

-- Sin PII (es la oferta de una organización, no datos de una persona): replica identity
-- full es seguro y permite que Realtime evalúe la RLS en UPDATE/DELETE (molde 0181).
alter table public.proveedor_capacidades replica identity full;

drop policy if exists capprov_select on public.proveedor_capacidades;
create policy capprov_select on public.proveedor_capacidades for select to authenticated
  using (public.es_admin() or public.es_verificado());

-- INSERT / UPDATE / DELETE: SIN policy, a propósito (deny-by-default con RLS activa).
drop policy if exists capprov_insert on public.proveedor_capacidades;
drop policy if exists capprov_update on public.proveedor_capacidades;
drop policy if exists capprov_delete on public.proveedor_capacidades;

grant select on public.proveedor_capacidades to authenticated;

-- ═══ (4) El consumo REAL: cada aporte puede descontar de una capacidad declarada ═══
alter table public.casos_item_aportes
  add column if not exists capacidad_id uuid references public.proveedor_capacidades(id) on delete set null;

create index if not exists idx_item_aportes_capacidad
  on public.casos_item_aportes (capacidad_id, creado_en) where capacidad_id is not null;

-- Un aporte solo descuenta capacidad si vino DEL proveedor (o de una donación suya). Lo
-- que salió del inventario propio, de un miembro o de un tercero ajeno no consume nada de
-- lo que el aliado prometió.
alter table public.casos_item_aportes drop constraint if exists chk_aporte_capacidad;
alter table public.casos_item_aportes add  constraint chk_aporte_capacidad
  check (capacidad_id is null or origen in ('proveedor', 'donacion'));

comment on column public.casos_item_aportes.capacidad_id is
  'Capacidad declarada (0224) contra la que se descuenta este aporte. Es lo que hace que «cuánto le queda al proveedor» salga de lo REALMENTE aportado y no de una estimación: corregir o borrar el aporte corrige la capacidad restante en el acto.';

-- ═══ (5) ventana_capacidad — el periodo en curso ═══
-- Pura: (periodicidad, ancla, referencia) → daterange del periodo que contiene la
-- referencia. Ver «LA VENTANA VIGENTE» en la cabecera. plpgsql y no `sql` para poder
-- llevar los bucles de ajuste de la aritmética de meses.
create or replace function public.ventana_capacidad(
  p_periodicidad text,
  p_ancla        date,
  p_ref          date
) returns daterange
language plpgsql immutable as $$
declare
  v_per   text := lower(coalesce(nullif(btrim(coalesce(p_periodicidad, '')), ''), 'unica'));
  v_paso  int;
  v_n     int;
  v_ini   date;
  v_fin   date;
begin
  if p_ancla is null or p_ref is null then
    return daterange(null, null, '()');
  end if;

  -- «Una sola vez»: no hay periodo que renovar, la cantidad es un pozo. Rango sin
  -- límites → cuenta TODO el histórico de aportes de esa capacidad.
  if v_per = 'unica' then
    return daterange(null, null, '()');
  end if;

  -- Semanas y quincenas: días exactos, sin sorpresas de calendario.
  if v_per in ('semanal', 'quincenal') then
    v_paso := case v_per when 'semanal' then 7 else 14 end;
    v_n    := floor((p_ref - p_ancla)::numeric / v_paso)::int;
    if v_n < 0 then v_n := 0; end if;
    v_ini  := p_ancla + (v_n * v_paso);
    return daterange(v_ini, v_ini + v_paso, '[)');
  end if;

  -- Meses y trimestres: `date + interval 'N months'` RECORTA el día al final del mes
  -- (31-ene + 1 mes = 28-feb), así que la cuenta directa puede quedar corta o pasada por
  -- uno. Los dos bucles la ajustan; en la práctica dan como mucho una vuelta.
  v_paso := case v_per when 'trimestral' then 3 else 1 end;
  v_n := ((( extract(year  from p_ref) - extract(year  from p_ancla)) * 12
          + (extract(month from p_ref) - extract(month from p_ancla)))::int) / v_paso;
  if v_n < 0 then v_n := 0; end if;

  while (p_ancla + (((v_n + 1) * v_paso) || ' months')::interval)::date <= p_ref loop
    v_n := v_n + 1;
  end loop;
  while v_n > 0 and (p_ancla + ((v_n * v_paso) || ' months')::interval)::date > p_ref loop
    v_n := v_n - 1;
  end loop;

  v_ini := (p_ancla + ((v_n       * v_paso) || ' months')::interval)::date;
  v_fin := (p_ancla + (((v_n + 1) * v_paso) || ' months')::interval)::date;
  return daterange(v_ini, v_fin, '[)');
end $$;

revoke all on function public.ventana_capacidad(text, date, date) from public;
grant execute on function public.ventana_capacidad(text, date, date) to authenticated;

comment on function public.ventana_capacidad(text, date, date) is
  'Periodo EN CURSO de una capacidad (0224): dado el ANCLA del compromiso (vigencia_desde, o la fecha de alta si no se declaró) y una fecha de referencia, devuelve el daterange [inicio, fin) del ciclo que la contiene. ''unica'' devuelve un rango sin límites (la cantidad no se renueva: cuenta todo el histórico). Las ventanas se cuentan desde el COMPROMISO, no desde el calendario — es la única definición que sirve para ''quincenal''.';

-- ═══ (6) capacidad_restante — la respuesta a «¿con qué puedo contar hoy?» ═══
create or replace function public.capacidad_restante(p_capacidad uuid)
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  v_c     record;
  v_hoy   date;
  v_ancla date;
  v_v     daterange;
  v_usado numeric;
begin
  if p_capacidad is null then return null; end if;
  if not (public.es_admin() or public.es_verificado()) then return null; end if;

  select c.id, c.cantidad, c.periodicidad, c.activa, c.vigencia_desde, c.vigencia_hasta,
         c.creado_en, coalesce(p.activo, true) as prov_activo
    into v_c
    from public.proveedor_capacidades c
    join public.proveedores p on p.id = c.proveedor_id
   where c.id = p_capacidad;
  if v_c.id is null then return null; end if;

  -- Hora de Venezuela, no la del servidor: el corte de una semana no puede depender de
  -- que el runtime esté en UTC (mismo criterio que apps/web/lib/fechas.ts).
  v_hoy := (now() at time zone 'America/Caracas')::date;

  -- Retirada, proveedor dado de baja, aún no vigente o caducada → con eso no se cuenta
  -- HOY. El MOTIVO lo devuelve capacidades_de_proveedor() en `estado_vigencia`.
  if not v_c.activa or not v_c.prov_activo then return 0; end if;
  if v_c.vigencia_desde is not null and v_hoy <  v_c.vigencia_desde then return 0; end if;
  if v_c.vigencia_hasta is not null and v_hoy >  v_c.vigencia_hasta then return 0; end if;

  v_ancla := coalesce(v_c.vigencia_desde, (v_c.creado_en at time zone 'America/Caracas')::date);
  v_v     := public.ventana_capacidad(v_c.periodicidad, v_ancla, v_hoy);

  select coalesce(sum(a.cantidad), 0) into v_usado
    from public.casos_item_aportes a
   where a.capacidad_id = p_capacidad
     and (a.creado_en at time zone 'America/Caracas')::date <@ v_v;

  return greatest(v_c.cantidad - v_usado, 0);
end $$;

revoke all on function public.capacidad_restante(uuid) from public;
grant execute on function public.capacidad_restante(uuid) to authenticated;

comment on function public.capacidad_restante(uuid) is
  'Capacidad que le queda HOY a un compromiso (0224) = cantidad − Σ aportes de la VENTANA VIGENTE (la ventana la fija la periodicidad: en una capacidad semanal cuenta la semana en curso, no el histórico). Devuelve 0 —no la cantidad entera— si la capacidad está retirada, aún no empezó, caducó, o el proveedor está inactivo: la pregunta es «con qué puedo contar hoy». NULL si no existe o el actor no está verificado. Gate es_verificado().';

-- ═══ (7) capacidades_de_proveedor — lo que ve la interfaz, ya calculado ═══
-- Una sola llamada devuelve todo lo que hace falta para pintar la pantalla de Logística
-- («con qué capacidad de respuesta contamos») y la de Alianzas (declarar y editar), sin
-- N llamadas a capacidad_restante ni que la app tenga que saber calcular ventanas.
--   · `p_proveedor` nulo = TODOS los proveedores.
--   · `usado`/`restante`/`pct` son de la VENTANA VIGENTE; `usado_total` es el histórico
--     completo (lo que el aliado lleva aportado de verdad desde que se firmó).
--   · `caduca_en` son los días que faltan para `vigencia_hasta` (negativo si ya pasó):
--     es lo que permite avisar «caduca en 5 días» antes de que sea tarde.
create or replace function public.capacidades_de_proveedor(
  p_proveedor      uuid    default null,
  p_solo_vigentes  boolean default false
) returns table (
  id               uuid,
  proveedor_id     uuid,
  proveedor        text,
  proveedor_activo boolean,
  tipo             text,
  descripcion      text,
  cantidad         numeric,
  unidad           text,
  periodicidad     text,
  puntual          boolean,
  vigencia_desde   date,
  vigencia_hasta   date,
  activa           boolean,
  notas            text,
  estado_vigencia  text,
  vigente          boolean,
  caduca_en        int,
  ventana_desde    date,
  ventana_hasta    date,
  usado            numeric,
  restante         numeric,
  pct              numeric,
  usado_total      numeric,
  ultimo_uso       timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare v_hoy date := (now() at time zone 'America/Caracas')::date;
begin
  if not (public.es_admin() or public.es_verificado()) then
    return;
  end if;

  return query
  with base as (
    select c.id, c.proveedor_id, p.nombre as proveedor, coalesce(p.activo, true) as prov_activo,
           c.tipo::text as tipo, c.descripcion, c.cantidad, c.unidad, c.periodicidad,
           c.puntual, c.vigencia_desde, c.vigencia_hasta, c.activa, c.notas,
           public.ventana_capacidad(
             c.periodicidad,
             coalesce(c.vigencia_desde, (c.creado_en at time zone 'America/Caracas')::date),
             v_hoy) as ventana,
           case
             when not c.activa                                                   then 'retirada'
             when not coalesce(p.activo, true)                                   then 'proveedor_inactivo'
             when c.vigencia_desde is not null and v_hoy < c.vigencia_desde      then 'pendiente'
             when c.vigencia_hasta is not null and v_hoy > c.vigencia_hasta      then 'caducada'
             else 'vigente'
           end as estado_vigencia
      from public.proveedor_capacidades c
      join public.proveedores p on p.id = c.proveedor_id
     where (p_proveedor is null or c.proveedor_id = p_proveedor)
  )
  select b.id, b.proveedor_id, b.proveedor, b.prov_activo,
         b.tipo, b.descripcion, b.cantidad, b.unidad, b.periodicidad, b.puntual,
         b.vigencia_desde, b.vigencia_hasta, b.activa, b.notas,
         b.estado_vigencia,
         (b.estado_vigencia = 'vigente') as vigente,
         case when b.vigencia_hasta is null then null else (b.vigencia_hasta - v_hoy) end as caduca_en,
         lower(b.ventana) as ventana_desde,
         upper(b.ventana) as ventana_hasta,
         coalesce(u.usado, 0)::numeric as usado,
         case when b.estado_vigencia = 'vigente'
              then greatest(b.cantidad - coalesce(u.usado, 0), 0)
              else 0 end::numeric as restante,
         case when b.cantidad > 0
              then least(100, round(coalesce(u.usado, 0) / b.cantidad * 100, 1))
              else null end as pct,
         coalesce(t.total, 0)::numeric as usado_total,
         t.ultimo
    from base b
    left join lateral (
      select coalesce(sum(a.cantidad), 0) as usado
        from public.casos_item_aportes a
       where a.capacidad_id = b.id
         and (a.creado_en at time zone 'America/Caracas')::date <@ b.ventana
    ) u on true
    left join lateral (
      select coalesce(sum(a.cantidad), 0) as total, max(a.creado_en) as ultimo
        from public.casos_item_aportes a
       where a.capacidad_id = b.id
    ) t on true
   where (not coalesce(p_solo_vigentes, false) or b.estado_vigencia = 'vigente')
   order by b.prov_activo desc, b.proveedor, b.activa desc, b.tipo, b.descripcion;
end $$;

revoke all on function public.capacidades_de_proveedor(uuid, boolean) from public;
grant execute on function public.capacidades_de_proveedor(uuid, boolean) to authenticated;

comment on function public.capacidades_de_proveedor(uuid, boolean) is
  'Capacidades declaradas de un proveedor (o de TODOS si p_proveedor es null), ya calculadas (0224): qué cubre, cuánto, con qué periodicidad, entre qué fechas, en qué ventana estamos, cuánto se consumió de esa ventana y CUÁNTO LE QUEDA. Añade estado_vigencia (vigente/pendiente/caducada/retirada/proveedor_inactivo), los días que faltan para caducar y el histórico total aportado. Gate es_verificado() con retorno vacío. Es la vía única de la interfaz: evita N llamadas a capacidad_restante y que la app tenga que saber calcular ventanas.';

-- ═══ (8) Escritura: guardar y retirar una capacidad ═══
-- Gate `puede_logistica() or puede_alianzas()`. ALIANZAS es quien declara (es quien
-- concreta el acuerdo y sabe qué prometió el aliado); LOGÍSTICA puede corregir lo que
-- constata en la operación. Ambos con los HELPERS del repo, nunca enumerando roles.
create or replace function public.guardar_capacidad_proveedor(
  p_id             uuid    default null,
  p_proveedor      uuid    default null,
  p_tipo           text    default 'otro',
  p_descripcion    text    default null,
  p_cantidad       numeric default null,
  p_unidad         text    default null,
  p_periodicidad   text    default 'unica',
  p_vigencia_desde date    default null,
  p_vigencia_hasta date    default null,
  p_notas          text    default null,
  p_activa         boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_desc   text := left(nullif(btrim(coalesce(p_descripcion, '')), ''), 200);
  v_unidad text := left(nullif(btrim(coalesce(p_unidad, '')), ''), 40);
  v_notas  text := left(nullif(btrim(coalesce(p_notas, '')), ''), 500);
  v_tipo   text := lower(coalesce(nullif(btrim(coalesce(p_tipo, '')), ''), 'otro'));
  v_per    text := lower(coalesce(nullif(btrim(coalesce(p_periodicidad, '')), ''), 'unica'));
  v_prov   uuid := p_proveedor;
  v_nombre text;
  v_id     uuid;
begin
  if not (public.puede_logistica() or public.puede_alianzas()) then
    raise exception 'Solo Alianzas Estratégicas o Logística pueden declarar la capacidad de un proveedor.' using errcode = '42501';
  end if;

  if p_id is not null then
    select c.proveedor_id into v_prov from public.proveedor_capacidades c where c.id = p_id;
    if v_prov is null then
      raise exception 'Capacidad no encontrada.' using errcode = 'P0002';
    end if;
  end if;
  if v_prov is null then
    raise exception 'Falta el proveedor.' using errcode = '22023';
  end if;

  select p.nombre into v_nombre from public.proveedores p where p.id = v_prov;
  if v_nombre is null then
    raise exception 'Proveedor no encontrado.' using errcode = 'P0002';
  end if;

  if v_desc is null then
    raise exception 'Describe QUÉ puede cubrir (por ejemplo: «comidas calientes»).' using errcode = '22023';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'Indica CUÁNTO puede cubrir (una cantidad mayor que cero).' using errcode = '22023';
  end if;
  if not (v_per = any (array['unica', 'semanal', 'quincenal', 'mensual', 'trimestral'])) then
    raise exception 'Periodicidad no válida: %', v_per using errcode = '22023';
  end if;
  -- `tipo` reutiliza el enum existente public.tipo_insumo (0218 hizo lo mismo): se valida
  -- por TEXTO antes de castear, para no depender del orden de los valores del enum.
  if not exists (select 1 from unnest(enum_range(null::public.tipo_insumo)) e where e::text = v_tipo) then
    raise exception 'Tipo de insumo no válido: %', v_tipo using errcode = '22023';
  end if;
  if p_vigencia_desde is not null and p_vigencia_hasta is not null
     and p_vigencia_hasta < p_vigencia_desde then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.proveedor_capacidades
      (proveedor_id, tipo, descripcion, cantidad, unidad, periodicidad, puntual,
       vigencia_desde, vigencia_hasta, activa, notas, creado_por)
    values
      (v_prov, v_tipo::public.tipo_insumo, v_desc, p_cantidad, v_unidad, v_per,
       (v_per = 'unica'), p_vigencia_desde, p_vigencia_hasta,
       coalesce(p_activa, true), v_notas, auth.uid())
    returning id into v_id;
  else
    update public.proveedor_capacidades
       set tipo           = v_tipo::public.tipo_insumo,
           descripcion    = v_desc,
           cantidad       = p_cantidad,
           unidad         = v_unidad,
           periodicidad   = v_per,
           puntual        = (v_per = 'unica'),
           vigencia_desde = p_vigencia_desde,
           vigencia_hasta = p_vigencia_hasta,
           activa         = coalesce(p_activa, true),
           notas          = v_notas,
           actualizado_en = now()
     where id = p_id
    returning id into v_id;
  end if;

  -- Auditoría sobre `proveedores`: es la entidad que la gente busca en el Registro de
  -- actividad. `registrar_auditoria` (0130) retorna en silencio si el actor no está
  -- verificado (§5.4.11), así que el registro DURADERO es la propia fila.
  perform public.registrar_auditoria(
    case when p_id is null then 'capacidad_declarada' else 'capacidad_editada' end,
    'proveedores', v_prov::text,
    jsonb_build_object('capacidad', v_id, 'proveedor', v_nombre, 'descripcion', v_desc,
                       'cantidad', p_cantidad, 'unidad', v_unidad, 'tipo', v_tipo,
                       'periodicidad', v_per, 'desde', p_vigencia_desde, 'hasta', p_vigencia_hasta));

  return v_id;
end $$;

revoke all on function public.guardar_capacidad_proveedor(uuid, uuid, text, text, numeric, text, text, date, date, text, boolean) from public;
grant execute on function public.guardar_capacidad_proveedor(uuid, uuid, text, text, numeric, text, text, date, date, text, boolean) to authenticated;

comment on function public.guardar_capacidad_proveedor(uuid, uuid, text, text, numeric, text, text, date, date, text, boolean) is
  'Declara o corrige lo que un proveedor puede cubrir (0224): tipo, descripción, cantidad, unidad, periodicidad y vigencia. p_id nulo = alta. `puntual` no se recibe: se deriva de la periodicidad (y el CHECK chk_capacidad_puntual impide que diverja). Gate puede_logistica() or puede_alianzas().';

-- Retirar una capacidad. Si YA se consumió algo contra ella, NO se borra: se marca
-- `activa=false`. Borrarla pondría a NULL el `capacidad_id` de esos aportes (on delete
-- set null) y se perdería para siempre de qué compromiso salió lo entregado — justo la
-- trazabilidad que esta migración viene a crear.
create or replace function public.eliminar_capacidad_proveedor(p_capacidad uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare v_c record; v_usos int;
begin
  if not (public.puede_logistica() or public.puede_alianzas()) then
    raise exception 'Solo Alianzas Estratégicas o Logística pueden retirar la capacidad de un proveedor.' using errcode = '42501';
  end if;

  select c.id, c.proveedor_id, c.descripcion, c.cantidad, c.unidad into v_c
    from public.proveedor_capacidades c where c.id = p_capacidad;
  if v_c.id is null then return 'inexistente'; end if;      -- idempotente: ya no está

  select count(*)::int into v_usos
    from public.casos_item_aportes a where a.capacidad_id = p_capacidad;

  if v_usos > 0 then
    update public.proveedor_capacidades set activa = false, actualizado_en = now() where id = p_capacidad;
  else
    delete from public.proveedor_capacidades where id = p_capacidad;
  end if;

  perform public.registrar_auditoria(
    case when v_usos > 0 then 'capacidad_retirada' else 'capacidad_eliminada' end,
    'proveedores', v_c.proveedor_id::text,
    jsonb_build_object('capacidad', p_capacidad, 'descripcion', v_c.descripcion,
                       'cantidad', v_c.cantidad, 'unidad', v_c.unidad, 'aportes', v_usos));

  return case when v_usos > 0 then 'retirada' else 'eliminada' end;
end $$;

revoke all on function public.eliminar_capacidad_proveedor(uuid) from public;
grant execute on function public.eliminar_capacidad_proveedor(uuid) to authenticated;

comment on function public.eliminar_capacidad_proveedor(uuid) is
  'Retira una capacidad declarada (0224). Si ya se consumió algo contra ella la marca activa=false en vez de borrarla, para no perder de qué compromiso salió lo entregado (on delete set null borraría ese rastro). Devuelve ''eliminada'' | ''retirada'' | ''inexistente''. Gate puede_logistica() or puede_alianzas().';

-- ═══ (9) El proveedor: alta y edición por RPC (Alianzas no escribe `proveedores`) ═══
-- `prov_gestion` (0050) es `for all` con `puede_logistica()`, y NO se toca: ampliar una
-- policy para que quepa otra área es justo lo que la doctrina de 0156/0213 prohíbe. La
-- puerta de Alianzas es esta RPC.
create or replace function public.guardar_proveedor(
  p_id          uuid    default null,
  p_nombre      text    default null,
  p_tipo        text    default null,
  p_contacto    text    default null,
  p_notas       text    default null,
  p_oportunidad uuid    default null,
  p_activo      boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_nombre text := left(nullif(btrim(coalesce(p_nombre, '')), ''), 160);
  v_tipo   text := left(nullif(btrim(coalesce(p_tipo, '')), ''), 60);
  v_cont   text := left(nullif(btrim(coalesce(p_contacto, '')), ''), 160);
  v_notas  text := left(nullif(btrim(coalesce(p_notas, '')), ''), 500);
  v_otro   uuid;
  v_id     uuid;
begin
  if not (public.puede_logistica() or public.puede_alianzas()) then
    raise exception 'Solo Alianzas Estratégicas o Logística pueden gestionar proveedores.' using errcode = '42501';
  end if;
  if p_id is null and v_nombre is null then
    raise exception 'El nombre del proveedor es obligatorio.' using errcode = '22023';
  end if;

  -- El puente con el CRM es 1→1 (idx_prov_oportunidad). Se avisa con un mensaje claro en
  -- vez de dejar que salte el índice con un 23505 ilegible.
  if p_oportunidad is not null then
    select p.id into v_otro from public.proveedores p
     where p.oportunidad_id = p_oportunidad and (p_id is null or p.id <> p_id);
    if v_otro is not null then
      raise exception 'Esa entidad del CRM ya está enlazada con otro proveedor.' using errcode = '22023';
    end if;
  end if;

  if p_id is null then
    insert into public.proveedores (nombre, tipo, contacto, notas, oportunidad_id, activo, creado_por)
    values (v_nombre, v_tipo, v_cont, v_notas, p_oportunidad, coalesce(p_activo, true), auth.uid())
    returning id into v_id;
  else
    update public.proveedores
       set nombre         = coalesce(v_nombre, nombre),
           tipo           = v_tipo,
           contacto       = v_cont,
           notas          = v_notas,
           oportunidad_id = p_oportunidad,
           activo         = coalesce(p_activo, true)
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Proveedor no encontrado.' using errcode = 'P0002';
    end if;
  end if;

  perform public.registrar_auditoria(
    case when p_id is null then 'proveedor_creado' else 'proveedor_editado' end,
    'proveedores', v_id::text,
    jsonb_build_object('nombre', coalesce(v_nombre, ''), 'tipo', v_tipo,
                       'oportunidad', p_oportunidad, 'activo', coalesce(p_activo, true)));

  return v_id;
end $$;

revoke all on function public.guardar_proveedor(uuid, text, text, text, text, uuid, boolean) from public;
grant execute on function public.guardar_proveedor(uuid, text, text, text, text, uuid, boolean) to authenticated;

comment on function public.guardar_proveedor(uuid, text, text, text, text, uuid, boolean) is
  'Alta y edición de un proveedor/aliado (0224) por RPC, para que Alianzas pueda hacerlo sin ampliar prov_gestion (0050, `for all` con puede_logistica() — doctrina 0156/0213). Valida el puente 1→1 con el CRM con un mensaje legible en vez de dejar saltar el índice único. Gate puede_logistica() or puede_alianzas().';

-- El puente propiamente dicho: la entidad del CRM que Alianzas CONCRETÓ pasa a ser un
-- proveedor con el que Logística puede contar. Molde exacto de
-- crear_ofrecimiento_desde_captacion (0192), idempotente por idx_prov_oportunidad.
create or replace function public.crear_proveedor_desde_oportunidad(p_oportunidad uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_o record; v_id uuid;
begin
  if not (public.puede_logistica() or public.puede_alianzas()) then
    raise exception 'Solo Alianzas Estratégicas o Logística pueden concretar un aliado como proveedor.' using errcode = '42501';
  end if;

  select o.id, o.titulo, o.contacto, o.categoria, o.ubicacion, o.descripcion into v_o
    from public.oportunidades o where o.id = p_oportunidad;
  if v_o.id is null then
    raise exception 'No existe esa entidad del CRM de Alianzas.' using errcode = 'P0002';
  end if;

  -- Idempotente: si ya se concretó, se devuelve el proveedor existente (no se duplica).
  select p.id into v_id from public.proveedores p where p.oportunidad_id = p_oportunidad limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.proveedores (nombre, tipo, contacto, notas, oportunidad_id, activo, creado_por)
  values (v_o.titulo,
          coalesce(v_o.categoria, 'alianza'),
          v_o.contacto,
          left(btrim('Aliado concretado desde el CRM de Alianzas Estratégicas. ' ||
                     coalesce(v_o.ubicacion || '. ', '') || coalesce(v_o.descripcion, '')), 500),
          p_oportunidad, true, auth.uid())
  returning id into v_id;

  perform public.registrar_auditoria(
    'proveedor_desde_crm', 'proveedores', v_id::text,
    jsonb_build_object('oportunidad', p_oportunidad, 'nombre', v_o.titulo, 'categoria', v_o.categoria));

  return v_id;
end $$;

revoke all on function public.crear_proveedor_desde_oportunidad(uuid) from public;
grant execute on function public.crear_proveedor_desde_oportunidad(uuid) to authenticated;

comment on function public.crear_proveedor_desde_oportunidad(uuid) is
  'Concreta una entidad del CRM de Alianzas (public.oportunidades) como PROVEEDOR con el que Logística puede contar (0224). Copia nombre, contacto y procedencia y conserva el vínculo en proveedores.oportunidad_id. Idempotente por idx_prov_oportunidad (molde 0192). Gate puede_logistica() or puede_alianzas().';

-- ═══ (10) Consumir capacidad: el aporte que descuenta de lo prometido ═══
-- Molde literal de `aportar_item_desde_centro` (0221 §7): una RPC especializada que hace
-- la operación normal y ADEMÁS deja el enlace que faltaba, en la misma transacción. No se
-- cambia la firma de `registrar_aporte_item` (0221) —está publicada y la llaman varias
-- pantallas—: se compone sobre ella, que es lo que hizo 0221 con registrar_salida.
--
-- Deliberadamente NO bloquea si se pide más de lo que quedaba, ni si la capacidad caducó:
-- esto es un LIBRO de lo que pasó de verdad. Si el aliado entregó de más, o entregó
-- después de que venciera el trato, hay que poder registrarlo. Lo que sí queda es la
-- constancia: el asiento guarda cuánto quedaba antes y cuánto queda después.
create or replace function public.aportar_desde_capacidad(
  p_item      uuid,
  p_capacidad uuid,
  p_cantidad  numeric default null,
  p_nota      text    default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cap    record;
  v_it     record;
  v_antes  numeric;
  v_id     uuid;
begin
  if not (public.puede_logistica() or public.es_admin()) then
    raise exception 'Solo Logística puede registrar el consumo de una capacidad.' using errcode = '42501';
  end if;
  if p_capacidad is null then
    raise exception 'Falta la capacidad del proveedor.' using errcode = '22023';
  end if;

  select c.id, c.proveedor_id, c.descripcion, c.unidad into v_cap
    from public.proveedor_capacidades c where c.id = p_capacidad;
  if v_cap.id is null then
    raise exception 'Capacidad no encontrada.' using errcode = 'P0002';
  end if;

  v_antes := public.capacidad_restante(p_capacidad);

  -- El permiso sobre el ítem, su existencia, «lo que falte» cuando p_cantidad es nulo y
  -- el doble asiento de aporte los aplica la RPC de 0221.
  v_id := public.registrar_aporte_item(
            p_item      := p_item,
            p_cantidad  := p_cantidad,
            p_origen    := 'proveedor',
            p_proveedor := v_cap.proveedor_id,
            p_nota      := p_nota);

  update public.casos_item_aportes set capacidad_id = p_capacidad where id = v_id;

  select i.caso_id, i.descripcion into v_it from public.casos_items i where i.id = p_item;

  perform public.registrar_auditoria(
    'capacidad_consumida', 'proveedores', v_cap.proveedor_id::text,
    jsonb_build_object('capacidad', p_capacidad, 'compromiso', v_cap.descripcion,
                       'item', p_item, 'caso_id', v_it.caso_id, 'aporte', v_id,
                       'restante_antes', v_antes,
                       'restante_despues', public.capacidad_restante(p_capacidad)));

  return v_id;
end $$;

revoke all on function public.aportar_desde_capacidad(uuid, uuid, numeric, text) from public;
grant execute on function public.aportar_desde_capacidad(uuid, uuid, numeric, text) to authenticated;

comment on function public.aportar_desde_capacidad(uuid, uuid, numeric, text) is
  'Registra un aporte a un ítem del desglose CONSUMIENDO la capacidad declarada de un proveedor (0224). Se compone sobre registrar_aporte_item (0221) —sin cambiarle la firma— y deja el capacidad_id, que es lo que hace que «cuánto le queda» salga de lo realmente aportado. p_cantidad nulo = lo que falte del ítem. No bloquea si se excede lo prometido ni si el trato caducó (es un libro de lo que pasó); deja el asiento con el restante antes y después. Gate puede_logistica() or es_admin().';

-- ═══ (11) Realtime ═══
-- El tablero de Logística muestra la capacidad restante como dato vivo: si Alianzas
-- declara o corrige un compromiso, tiene que verse sin recargar.
do $$ begin
  alter publication supabase_realtime add table public.proveedor_capacidades;
exception when duplicate_object then null; end $$;
