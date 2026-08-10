-- ============================================================
-- 0230 · Las solicitudes indican su PAÍS: Venezuela o Colombia
--
-- Contexto: el terremoto de Colombia (agosto 2026). La plataforma nació para
-- la respuesta en Venezuela y lo daba por supuesto en varios sitios: el
-- desplegable de «Estado» solo traía los 24 estados venezolanos y la sugerencia
-- de centros de acopio ordenaba por distancia pura, sin mirar fronteras.
--
-- DECISIONES TOMADAS POR LA ORGANIZACIÓN:
--
--   1. Se atienden DOS países, Venezuela y Colombia, y solo esos. Por eso el
--      campo es TEXT + CHECK cerrado y no un país libre: si mañana entra un
--      tercero es una migración de una línea, y mientras tanto nadie puede
--      registrar una solicitud de un país que no atendemos.
--
--   2. Los centros de acopio cercanos se limitan al país del caso. Si hay uno
--      del otro país más cerca, se devuelve marcado como `cruza_frontera` para
--      que se vea, pero NUNCA por delante de los del propio país.
--
--      Esto importa de verdad: Cúcuta está a unos 10 km de Táchira. Con el
--      orden por distancia pura de 0114, el centro «más cercano» a un caso de
--      Norte de Santander sería venezolano, y Logística podía enrutar una
--      entrega a través de una frontera internacional sin enterarse — con lo
--      que eso implica de aduanas y de permisos. Ahora cruzar la frontera es
--      una decisión consciente, no un accidente del ORDER BY.
--
-- TEXT + CHECK y no un enum nuevo: precedentes 0189, 0145 y 0177. Un valor de
-- enum recién creado no se puede usar en la misma migración (ni en DML, ni en
-- una policy, ni en una función `language sql`), y eso ya ha costado caro aquí.
--
-- Los casos y los centros que ya existen se quedan en 'VE': la plataforma
-- atendía solo Venezuela, así que es su país de verdad, no una suposición.
--
-- Idempotente. Ejecutar tras 0229.
-- ============================================================

-- ═══ (1) Catálogo de países atendidos ═══
-- plpgsql y no `language sql`, como el resto de funciones de catálogo del repo
-- (`estados_item`, `pasos_item`, `roles_area_derivacion`): se planifican al
-- llamarlas y no de golpe al crearlas.
create or replace function public.paises_atendidos()
returns text[] language plpgsql immutable as $$
begin
  return array['VE', 'CO'];
end $$;

revoke all on function public.paises_atendidos() from public;
grant execute on function public.paises_atendidos() to authenticated;

comment on function public.paises_atendidos() is
  'Los países que atiende la plataforma (0230): VE y CO. Espejo de PAISES_ATENDIDOS en apps/web/lib/constantes.ts. Añadir uno pide tocar también los CHECK de casos.pais y puntos_acopio.pais — a propósito: que el catálogo y la restricción se muevan juntos.';

-- ═══ (2) casos.pais ═══
alter table public.casos add column if not exists pais text not null default 'VE';

do $$ begin
  alter table public.casos add constraint casos_pais_chk check (pais in ('VE', 'CO'));
exception when duplicate_object then null; end $$;

-- Las listas y la reportería filtran por país; el índice evita un seq scan cuando
-- la tabla crezca con dos respuestas a la vez.
create index if not exists idx_casos_pais on public.casos (pais);

comment on column public.casos.pais is
  'País de la solicitud (0230): ''VE'' o ''CO''. Los casos anteriores a esta migración quedan en ''VE'', que es su país real — la plataforma solo atendía Venezuela. Decide qué catálogo de divisiones administrativas se ofrece en `ubicacion_estado` (estados de Venezuela o departamentos de Colombia) y acota la sugerencia de centros de acopio.';

-- ═══ (3) puntos_acopio.pais ═══
-- Sin esto, la sugerencia de centros no puede distinguir nada: es la mitad
-- imprescindible de la decisión (2) de la cabecera.
alter table public.puntos_acopio add column if not exists pais text not null default 'VE';

do $$ begin
  alter table public.puntos_acopio add constraint puntos_acopio_pais_chk check (pais in ('VE', 'CO'));
exception when duplicate_object then null; end $$;

create index if not exists idx_puntos_acopio_pais on public.puntos_acopio (pais);

comment on column public.puntos_acopio.pais is
  'País del centro o punto del mapa (0230). Lo hereda del caso cuando nace de una solicitud marcada como punto (crear_centro_desde_caso). Es lo que permite que centros_cercanos_para_solicitud no proponga un centro del otro lado de la frontera como si fuera el más cercano.';

-- ═══ (4) crear_centro_desde_caso — 0145 VERBATIM + herencia del país ═══
-- Cuerpo idéntico salvo `pais` en el INSERT. Sin esta línea, una solicitud
-- colombiana marcada como albergue crearía un centro con el DEFAULT 'VE' y
-- reaparecería en la sugerencia del país equivocado: el bug que la migración
-- viene a cerrar, entrando por la puerta de atrás.
create or replace function public.crear_centro_desde_caso()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_punto uuid;
begin
  -- Solo solicitudes marcadas como punto, y solo al QUEDAR 'confirmado' (transición real).
  if new.punto_tipo is null then return new; end if;
  if new.estado::text is distinct from 'confirmado' then return new; end if;
  if tg_op = 'UPDATE' and old.estado::text = 'confirmado' then return new; end if;
  -- Ya tiene centro: no duplicar (el índice único por caso_id es el respaldo duro).
  if new.punto_acopio_id is not null then return new; end if;
  if exists (select 1 from public.puntos_acopio p where p.caso_id = new.id) then return new; end if;
  -- Un punto en el mapa exige ubicación (puntos_acopio.lat/lng son NOT NULL).
  if new.lat is null or new.lng is null then
    raise exception 'Agrega la ubicación (mapa) antes de confirmar un punto (hospital/albergue/acopio).'
      using errcode = '23514';
  end if;

  -- Nace SIN dueño: lo gestionan el admin / admin de Logística y los responsables que asignen.
  insert into public.puntos_acopio (nombre, tipo, responsable, lat, lng, temporal, caso_id, creado_por, activo, pais)
    values (new.titulo, new.punto_tipo, new.contacto, new.lat, new.lng,
            coalesce(new.punto_temporal, false), new.id, null, true,
            coalesce(new.pais, 'VE'));
  select id into v_punto from public.puntos_acopio where caso_id = new.id;
  -- Enlazar la solicitud con su centro. Toca 'punto_acopio_id' (no 'estado'),
  -- así que NO vuelve a disparar este trigger (definido "of estado").
  update public.casos set punto_acopio_id = v_punto where id = new.id;

  -- Avisar a Logística para que complete el centro (camas, inventario, responsable).
  -- 'logistica'/'admin_logistica' son enum PRE-existentes → cast eager seguro.
  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select p.id, 'punto_creado', 'Nuevo punto en el mapa',
         coalesce(new.titulo, 'Un punto') || ' (' || new.punto_tipo ||
         ') se creó desde una solicitud verificada. Completa sus datos.',
         '/acopio'
  from public.perfiles p
  where p.verificado
    and (p.rol in ('logistica'::public.rol_usuario, 'admin_logistica'::public.rol_usuario)
         or 'logistica'::public.rol_usuario       = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[]))
         or 'admin_logistica'::public.rol_usuario  = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[])));
  return new;
end $$;

comment on function public.crear_centro_desde_caso() is
  'Crea el punto del mapa cuando una solicitud marcada como punto queda confirmada (0145). Desde 0230 el punto HEREDA el país del caso: sin eso, un albergue colombiano nacería como venezolano por el DEFAULT y volvería a colarse en la sugerencia de centros del país equivocado.';

-- ═══ (5) centros_cercanos_para_solicitud — con país y aviso de frontera ═══
-- Cambia la firma (salen dos columnas nuevas), así que hay que soltar la vieja de
-- forma explícita: si conviven las dos, PostgREST puede resolver la equivocada
-- —mismo cuidado que 0222 con `derivar_caso`—.
--
-- El orden es: primero los del MISMO país (por stock y cercanía, como siempre) y
-- después, al final, los del otro país. Así el aviso de frontera nunca desplaza a
-- una opción propia, pero la ayuda que está literalmente al lado sigue a la vista
-- en la zona fronteriza, que es donde tiene sentido.
drop function if exists public.centros_cercanos_para_solicitud(uuid, int);

create function public.centros_cercanos_para_solicitud(p_solicitud uuid, p_limite int default 5)
returns table (
  punto_id uuid, nombre text, direccion text, telefono text,
  distancia_km double precision, con_stock boolean,
  pais text, cruza_frontera boolean
)
language sql stable security definer set search_path = public as $$
  with s as (
    select si.tipo, c.lat, c.lng, coalesce(c.pais, 'VE') as pais
    from public.solicitudes_insumo si
    join public.casos c on c.id = si.caso_id
    where si.id = p_solicitud
      and c.lat is not null and c.lng is not null
      and (public.es_admin() or public.puede_logistica())
  )
  select p.id, p.nombre, p.direccion, p.telefono,
    6371 * acos(least(1, greatest(-1,
      sin(radians(s.lat)) * sin(radians(p.lat)) +
      cos(radians(s.lat)) * cos(radians(p.lat)) * cos(radians(p.lng - s.lng))
    ))) as distancia_km,
    exists (
      select 1 from public.inventario_acopio ia
      where ia.punto_id = p.id and ia.categoria = s.tipo::text and ia.cantidad > 0
    ) as con_stock,
    coalesce(p.pais, 'VE') as pais,
    (coalesce(p.pais, 'VE') is distinct from s.pais) as cruza_frontera
  from public.puntos_acopio p, s
  where p.activo
  -- Los del propio país primero SIEMPRE; después stock; después cercanía.
  order by (coalesce(p.pais, 'VE') is distinct from s.pais) asc,
           exists (
             select 1 from public.inventario_acopio ia
             where ia.punto_id = p.id and ia.categoria = s.tipo::text and ia.cantidad > 0
           ) desc,
           distancia_km asc
  limit greatest(1, least(coalesce(p_limite, 5), 20));
$$;

revoke all on function public.centros_cercanos_para_solicitud(uuid, int) from public;
grant execute on function public.centros_cercanos_para_solicitud(uuid, int) to authenticated;

comment on function public.centros_cercanos_para_solicitud(uuid, int) is
  'Centros de acopio cercanos a una solicitud (0114), desde 0230 con `pais` y `cruza_frontera`. Los del país del caso van SIEMPRE primero; los del otro país se devuelven marcados y al final. Sin esto, un caso de Norte de Santander tenía como «más cercano» un centro de Táchira —están a unos 10 km— y la entrega cruzaba una frontera internacional por puro orden de distancia.';

-- ═══ (6) crear_solicitud_logistica — el país, sin transcribir el cuerpo ═══
-- La RPC de 0223 tiene ~200 líneas de validaciones. Reproducirlas aquí solo para
-- añadir un parámetro es la clase de copia que acaba con una errata silenciosa, así
-- que en vez de eso se RENOMBRA la original —el cuerpo queda intacto, byte a byte— y
-- se crea encima una envoltura que fija el país. Ambas cosas ocurren dentro de la
-- misma llamada, así que no existe el estado intermedio de un caso colombiano
-- guardado como venezolano.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'crear_solicitud_logistica'
       and p.pronargs = 19
  ) and not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'crear_solicitud_logistica_base'
  ) then
    alter function public.crear_solicitud_logistica(
      text, text, jsonb, text, text, text, text, text, text, text, text, text,
      double precision, double precision, text, int, text, uuid, text
    ) rename to crear_solicitud_logistica_base;
  end if;
end $$;

-- La base deja de estar expuesta: se entra por la envoltura, que es la que
-- garantiza que el país queda escrito.
do $$
begin
  execute 'revoke all on function public.crear_solicitud_logistica_base('
       || 'text, text, jsonb, text, text, text, text, text, text, text, text, text, '
       || 'double precision, double precision, text, int, text, uuid, text) from public, authenticated';
exception when undefined_function then null; end $$;

create or replace function public.crear_solicitud_logistica(
  p_titulo         text,
  p_descripcion    text,
  p_items          jsonb            default null,
  p_referente      text             default null,
  p_referente_rol  text             default null,
  p_whatsapp       text             default null,
  p_instagram      text             default null,
  p_ubi_estado     text             default null,
  p_ubi_municipio  text             default null,
  p_ubi_parroquia  text             default null,
  p_ubi_sector     text             default null,
  p_ubi_direccion  text             default null,
  p_lat            double precision default null,
  p_lng            double precision default null,
  p_urgencia       text             default 'media',
  p_personas       int              default null,
  p_fuente         text             default null,
  p_punto          uuid             default null,
  p_notas          text             default null,
  p_pais           text             default 'VE'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_pais  text := upper(nullif(btrim(coalesce(p_pais, '')), ''));
  v_nuevo uuid;
begin
  -- País no atendido → se rechaza en vez de caer al DEFAULT en silencio: guardar
  -- una solicitud colombiana como venezolana la mandaría al equipo equivocado.
  if v_pais is null then v_pais := 'VE'; end if;
  if not (v_pais = any(public.paises_atendidos())) then
    raise exception 'País no atendido: %. La plataforma atiende Venezuela (VE) y Colombia (CO).', v_pais
      using errcode = '22023';
  end if;

  v_nuevo := public.crear_solicitud_logistica_base(
    p_titulo, p_descripcion, p_items, p_referente, p_referente_rol, p_whatsapp,
    p_instagram, p_ubi_estado, p_ubi_municipio, p_ubi_parroquia, p_ubi_sector,
    p_ubi_direccion, p_lat, p_lng, p_urgencia, p_personas, p_fuente, p_punto, p_notas);

  if v_nuevo is not null and v_pais <> 'VE' then
    update public.casos set pais = v_pais where id = v_nuevo;
  end if;
  return v_nuevo;
end $$;

revoke all on function public.crear_solicitud_logistica(
  text, text, jsonb, text, text, text, text, text, text, text, text, text,
  double precision, double precision, text, int, text, uuid, text, text) from public;
grant execute on function public.crear_solicitud_logistica(
  text, text, jsonb, text, text, text, text, text, text, text, text, text,
  double precision, double precision, text, int, text, uuid, text, text) to authenticated;

comment on function public.crear_solicitud_logistica(
  text, text, jsonb, text, text, text, text, text, text, text, text, text,
  double precision, double precision, text, int, text, uuid, text, text) is
  'Alta completa de una solicitud desde el panel de Logística (0223), desde 0230 con país. Es una ENVOLTURA de crear_solicitud_logistica_base —la de 0223, renombrada con el cuerpo intacto— que valida el país contra paises_atendidos() y lo escribe en la misma llamada. Se renombró en vez de copiar las ~200 líneas de validaciones para no arriesgar una errata; la base ya no tiene grant, se entra por aquí.';
