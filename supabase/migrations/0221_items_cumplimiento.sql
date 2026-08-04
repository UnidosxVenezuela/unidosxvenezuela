-- ============================================================
-- 0221 — Cumplimiento por ÍTEM: cuánto se cubrió, QUIÉN lo aportó y qué cubrió un TERCERO
-- ------------------------------------------------------------
-- ANTES: con el desglose por ítem (0218) y su semáforo de pasos (0220) ya se sabía QUÉ
--   hace falta y POR DÓNDE va cada cosa, pero no CUÁNTO de cada cosa se consiguió ni
--   GRACIAS A QUIÉN. El avance era binario por ítem: «en gestión» o «cubierto». Si de
--   cinco colchones se consiguieron cuatro, el ítem seguía «en gestión» y nadie podía
--   decir que faltaba UNO. Y de quien cubría no quedaba rastro estructurado: lo más
--   cercano eran `solicitudes_insumo.proveedor_id`, `movimientos_acopio.donante` (texto
--   libre, 0069) y el motivo que escribe `surtirDesdeCentro` —«… (sol. 1a2b3c4d)»—, que
--   es un STRING, no una clave ajena.
--
-- AHORA: `public.casos_item_aportes`, un libro de aportes append-only por ítem. Cada
--   aporte guarda la CANTIDAD, el ORIGEN (inventario · proveedor · donación · tercero ·
--   miembro) y a QUIÉN corresponde (perfil, proveedor, afiliado o un nombre libre). De
--   ahí sale el porcentaje real de cumplimiento («4 de 5 colchones — 80 %»), la lista de
--   quién aportó cuánto, y el cierre automático del ítem al llegar al 100 %.
--
-- ── P9 · CUBIERTO POR UN TERCERO (la distinción que se pidió explícitamente) ──
--   `origen='tercero'` + `tercero_nombre` OBLIGATORIO: otra ONG, otra institución o una
--   persona ajena cubrió esa necesidad y NOSOTROS YA NO LA GESTIONAMOS. No hace falta
--   columna ni estado nuevo —el ítem llega a 'cumplido' por la misma vía que cualquier
--   otro—, pero el origen queda grabado en cada aporte, de modo que en la interfaz y en
--   la reportería siempre se puede separar «lo cubrimos nosotros» de «lo cubrió un
--   tercero». Es una distinción operativa (a quién agradecer, qué capacidad real tiene la
--   organización) y de rendición de cuentas: NO es lo mismo entregar 100 colchones que
--   registrar que otro los entregó.
--   El CHECK `chk_aporte_tercero` la hace estructural: sin nombre no hay aporte de tercero,
--   y por tanto la reportería nunca tendrá un «tercero anónimo» que no se pueda auditar.
--
-- ── LA COMPUERTA OBLIGATORIA (§2.7 del análisis) ──
--   `auditar_estado_insumo()` (0116 → reescrita en 0210) es BEFORE UPDATE OF estado sobre
--   `solicitudes_insumo` y RECHAZA con 42501 salir de 'entregado'/'cancelado' salvo
--   `es_admin()` o `current_setting('app.devolver_ok')='1'`. Por eso esta migración toma
--   una decisión explícita: **el recálculo por aportes NO toca `solicitudes_insumo.estado`
--   en ningún caso**. Solo mueve `casos_items.estado`, que no tiene ese guard (0220 dejó
--   las transiciones en la RPC, justamente para no bloquear a esta migración). Corregir un
--   aporte a la baja —o borrarlo— sobre una solicitud YA ENTREGADA revierte el ítem a
--   «en gestión» y no lanza nada: está verificado empíricamente. Deshacer una entrega
--   sigue siendo un acto explícito y auditado, `devolver_entrega_insumo` (0210).
--   La compuerta que sí se necesita es la del SENTIDO CONTRARIO —entrar a 'entregado'—,
--   y es nueva: `app.entrega_parcial_ok` (misma familia que `app.devolver_ok` 0210,
--   `app.publicado_ok` 0166 y `app.items_ok` 0218).
--
-- ── REGLA EXPLÍCITA DE CIERRE (§2.7, segundo párrafo) ──
--   Con cobertura parcial, «entregado» dejó de ser binario. Se fija por escrito:
--     · `trg_gate_entrega_completa` (BEFORE UPDATE OF estado) impide poner 'entregado'
--       mientras queden ítems sin cubrir, VENGA DE DONDE VENGA el UPDATE (la app aún
--       cambia el estado con un update directo desde `cambiarEstadoSolicitud`). Se salta
--       con la compuerta de sesión, que solo abre `entregar_solicitud_insumo` cuando
--       Logística FUERZA la entrega a sabiendas, o con `es_admin()` (válvula de escape
--       habitual del repo).
--     · `cerrar_caso_al_entregar()` se REESCRIBE COMPLETA desde 0116 y deja de resolver
--       el caso cuando la entrega fue parcial: pone el asiento 'casos:entrega_parcial' y
--       el caso SIGUE EN EL FLUJO (Redacción continúa difundiendo lo que falta, y
--       `solicitar_cobertura_parcial` 0211 sigue siendo la vía para pedir el remanente).
--       Un caso sin desglose se comporta EXACTAMENTE como antes: 'resuelto' + avisos.
--
-- ── AUDITORÍA ──
--   Doble asiento (molde 0201): cada aporte deja traza con `entidad='casos'` —el filtro
--   del «Historial de cambios» del detalle— y con `entidad='solicitudes_insumo'` —el
--   Registro de actividad de Logística—. El registro DURADERO es la propia fila del
--   aporte: `registrar_auditoria` (0130) retorna en silencio si el actor no está
--   verificado (§5.4.11), así que ninguna traza nueva depende solo de ella.
--   Cuando un aporte completa el ítem, el UPDATE de `casos_items.estado` lo audita
--   `trg_auditar_cambio_item` (0219) —fila fina «Estado: en_gestion → cumplido» + UN
--   asiento 'item_editado'—. Esta migración NO repite ese asiento: lo pide la cabecera de
--   0219 por escrito. Los asientos de aporte son un HECHO DISTINTO (quién dio qué), no
--   una repetición del cambio de estado.
--
-- ENUM-SAFETY: cero valores de enum nuevos. `origen` es TEXT + CHECK con nombre propio
--   (`chk_aporte_origen`), re-emitido con drop/add para que añadir un origen futuro sea
--   exactamente eso y no un `alter type` con cast eager (precedentes 0189, 0145, 0177).
--
-- Idempotente. Ejecutar tras 0220.
-- ============================================================

-- ═══ (1) El libro de aportes ═══
create table if not exists public.casos_item_aportes (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.casos_items(id) on delete cascade,
  solicitud_id   uuid references public.solicitudes_insumo(id) on delete set null,
  cantidad       numeric not null check (cantidad > 0),
  origen         text not null default 'miembro',
  proveedor_id   uuid references public.proveedores(id) on delete set null,
  perfil_id      uuid references public.perfiles(id)    on delete set null,
  afiliado_id    uuid references public.afiliados(id)   on delete set null,
  tercero_nombre text,
  punto_id       uuid references public.puntos_acopio(id)     on delete set null,
  movimiento_id  uuid references public.movimientos_acopio(id) on delete set null,
  nota           text,
  registrado_por uuid references public.perfiles(id) on delete set null,
  creado_en      timestamptz not null default now()
);
create index if not exists idx_item_aportes      on public.casos_item_aportes (item_id, creado_en);
create index if not exists idx_item_aportes_sol  on public.casos_item_aportes (solicitud_id) where solicitud_id is not null;
create index if not exists idx_item_aportes_terc on public.casos_item_aportes (item_id) where origen = 'tercero';

-- Los CHECK van por ALTER con nombre propio y drop/add: así esta migración converge en
-- una base donde la tabla ya existiera, y añadir un origen mañana es una línea (nunca un
-- `alter type`, ver ENUM-SAFETY en la cabecera).
alter table public.casos_item_aportes drop constraint if exists chk_aporte_origen;
alter table public.casos_item_aportes add  constraint chk_aporte_origen
  check (origen in ('inventario', 'proveedor', 'donacion', 'tercero', 'miembro'));

-- P9: un aporte de TERCERO sin nombre no sirve para nada —ni para agradecer, ni para
-- auditar, ni para saber si de verdad hay que dejar de gestionarlo—. Se exige.
alter table public.casos_item_aportes drop constraint if exists chk_aporte_tercero;
alter table public.casos_item_aportes add  constraint chk_aporte_tercero
  check (origen <> 'tercero' or coalesce(btrim(tercero_nombre), '') <> '');

comment on table public.casos_item_aportes is
  'Libro de aportes por ÍTEM del desglose (0221): cuánto se cubrió de cada cosa, con qué origen y gracias a quién. De aquí salen el porcentaje de cumplimiento, la lista de aportantes y el cierre automático del ítem al 100 %. Lectura para cuentas verificadas (NUNCA un exists() sobre `casos`: Redacción no lo lee desde 0180); escritura solo por RPC SECURITY DEFINER.';
comment on column public.casos_item_aportes.origen is
  'De dónde salió: inventario (centro de acopio propio) · proveedor · donacion · tercero (P9: otra ONG o persona AJENA — ya no lo gestionamos nosotros) · miembro (alguien del equipo lo consiguió). TEXT + CHECK a propósito.';
comment on column public.casos_item_aportes.tercero_nombre is
  'Nombre libre de quien aportó cuando no hay fila propia en el sistema. OBLIGATORIO si origen=''tercero'' (chk_aporte_tercero); opcional y útil en ''donacion''.';
comment on column public.casos_item_aportes.movimiento_id is
  'Asiento de `movimientos_acopio` que descontó el stock (0184). Es la FK que faltaba: hasta 0221 el único enlace entre una salida de inventario y la solicitud era el string «(sol. 1a2b3c4d)» del motivo.';
comment on column public.casos_item_aportes.perfil_id is
  'Miembro de la organización que consiguió o entregó el aporte — «la intervención de qué miembros». Por defecto, quien lo registra cuando origen=''miembro''.';

-- ═══ (2) RLS — lectura para cuentas verificadas; escritura solo por RPC ═══
alter table public.casos_item_aportes enable row level security;

-- Igual que 0218: la fila «vieja» tampoco lleva PII, así que replica identity full es
-- seguro y permite que Realtime evalúe la RLS en UPDATE/DELETE (molde 0181).
alter table public.casos_item_aportes replica identity full;

-- SELECT: `es_verificado()`, NUNCA un exists() sobre `casos` — a Redacción le devolvería
-- CERO filas en silencio (0180), el modo de fallo dominante del repo. Tampoco se encadena
-- un exists sobre `casos_items`: su policy ya es es_verificado() y sería el mismo
-- resultado con un subplan por fila. Redacción necesita ver esto: saber que un ítem lo
-- cubrió otra ONG es justo lo que le dice que ya no hay que difundirlo.
drop policy if exists citem_aportes_select on public.casos_item_aportes;
create policy citem_aportes_select on public.casos_item_aportes for select to authenticated
  using (public.es_admin() or public.es_verificado());

-- INSERT / UPDATE / DELETE: SIN policy, a propósito (deny-by-default con RLS activa).
drop policy if exists citem_aportes_insert on public.casos_item_aportes;
drop policy if exists citem_aportes_update on public.casos_item_aportes;
drop policy if exists citem_aportes_delete on public.casos_item_aportes;

grant select on public.casos_item_aportes to authenticated;

-- ═══ (3) El porcentaje ═══
-- Σ aportes / cantidad del ítem, topado a 100. Devuelve NULL —no 0— cuando el ítem no
-- tiene cantidad numérica (los ítems heredados del texto libre, §2.6): un «0 %» ahí sería
-- mentira, porque el denominador no existe. La interfaz degrada mostrando el estado.
-- plpgsql (y no `sql`) para poder cerrar el gate: es SECURITY DEFINER y salta la RLS.
create or replace function public.item_cumplimiento(p_item uuid)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v_cant numeric; v_sum numeric;
begin
  if p_item is null then return null; end if;
  if not (public.es_admin() or public.es_verificado()) then return null; end if;

  select i.cantidad into v_cant from public.casos_items i where i.id = p_item;
  if v_cant is null or v_cant <= 0 then return null; end if;

  select coalesce(sum(a.cantidad), 0) into v_sum
    from public.casos_item_aportes a where a.item_id = p_item;

  return least(100, round(v_sum / v_cant * 100, 1));
end $$;

revoke all on function public.item_cumplimiento(uuid) from public;
grant execute on function public.item_cumplimiento(uuid) to authenticated;

comment on function public.item_cumplimiento(uuid) is
  'Porcentaje de cumplimiento de un ítem (0221) = Σ casos_item_aportes.cantidad / casos_items.cantidad, topado a 100 y redondeado a un decimal. NULL si el ítem no tiene cantidad numérica (no hay denominador). Gate es_verificado().';

-- Cobertura AGREGADA de todo el desglose de un caso. Es la pieza que usan la regla de
-- cierre y la reportería. NO se concede a `authenticated` a propósito: no lleva gate
-- propio (el trigger que la llama debe poder evaluarla siempre), así que se queda
-- reservada para las funciones SECURITY DEFINER de esta migración y para 0227. La
-- interfaz obtiene lo mismo por `items_de_caso` (0220), que sí está curada y gateada.
--   · Los ítems 'cancelado' quedan FUERA del denominador: ya no se piden.
--   · 'no_disponible' SÍ cuenta como no cubierto — es exactamente el caso que obliga a
--     entregar como parcial (o a pedir difusión del remanente).
--   · `cubierto` topa cada ítem a su propia cantidad, para que sobre-cubrir uno no
--     disimule otro que falta.
create or replace function public.cobertura_items_caso(p_caso uuid)
returns table (
  n_items          int,
  n_cumplidos      int,
  n_terceros       int,
  total            numeric,
  cubierto         numeric,
  cubierto_tercero numeric,
  pct              numeric,
  pct_items        numeric
)
language sql stable security definer set search_path = public as $$
  with it as (
    select i.id, i.cantidad, i.estado
      from public.casos_items i
     where i.caso_id = p_caso
       and i.estado <> 'cancelado'
  ), ap as (
    select a.item_id,
           sum(a.cantidad)                                          as suma,
           sum(a.cantidad) filter (where a.origen = 'tercero')      as suma_tercero
      from public.casos_item_aportes a
      join it on it.id = a.item_id
     group by a.item_id
  ), j as (
    select it.id, it.cantidad, it.estado,
           coalesce(ap.suma, 0)         as suma,
           coalesce(ap.suma_tercero, 0) as suma_tercero
      from it left join ap on ap.item_id = it.id
  )
  select
    count(*)::int,
    count(*) filter (where j.estado = 'cumplido')::int,
    count(*) filter (where j.suma_tercero > 0)::int,
    coalesce(sum(j.cantidad)                       filter (where j.cantidad > 0), 0)::numeric,
    coalesce(sum(least(j.suma, j.cantidad))        filter (where j.cantidad > 0), 0)::numeric,
    coalesce(sum(least(j.suma_tercero, j.cantidad)) filter (where j.cantidad > 0), 0)::numeric,
    case when coalesce(sum(j.cantidad) filter (where j.cantidad > 0), 0) > 0
         then round(100 * coalesce(sum(least(j.suma, j.cantidad)) filter (where j.cantidad > 0), 0)
                        / sum(j.cantidad) filter (where j.cantidad > 0), 1)
         else null end,
    case when count(*) > 0
         then round(100.0 * count(*) filter (where j.estado = 'cumplido') / count(*), 1)
         else null end
  from j;
$$;

revoke all on function public.cobertura_items_caso(uuid) from public;
-- Sin grant a `authenticated`: función interna (ver comentario de arriba).

comment on function public.cobertura_items_caso(uuid) is
  'Cobertura agregada del desglose de un caso (0221): ítems, cumplidos, cuántos llevan aporte de TERCERO, cantidad pedida vs cubierta (topada por ítem) y los dos porcentajes (por cantidad y por ítems). Excluye los ítems cancelados. INTERNA: sin gate y sin grant a authenticated — la usan la regla de cierre, el trigger de entrega y la reportería.';

-- ═══ (4) El recálculo: al aportar, el ítem se cierra solo al llegar al 100 % ═══
-- Y al corregir a la baja, se reabre. Ese segundo sentido es el que obliga a la decisión
-- de la cabecera: aquí NO se toca `solicitudes_insumo.estado`, porque el guard 0210 lo
-- rechazaría con 42501 en cuanto la solicitud estuviera entregada.
--
-- Reglas (solo aplican a ítems con cantidad NUMÉRICA; sin denominador no hay 100 % que
-- alcanzar y el estado lo sigue gobernando `avanzar_item`):
--   · Σ aportes ≥ cantidad  → 'cumplido' (salvo que ya lo esté o esté 'cancelado').
--     'no_disponible' TAMBIÉN sube: es el caso P9 —Logística no pudo, otra ONG sí—.
--   · Σ aportes < cantidad y el ítem estaba 'cumplido' → vuelve a 'en_gestion'.
--     Solo se llega aquí si el ítem TUVO aportes (el trigger no dispara de otro modo),
--     así que nunca pisa un 'cumplido' puesto a mano sobre un ítem sin aportes.
--   · 0 < Σ aportes < cantidad y el ítem seguía 'pendiente' → 'en_gestion'. Si ya hay
--     algo conseguido, el semáforo no puede seguir diciendo que nadie lo ha tocado.
create or replace function public.recalcular_cumplimiento_item(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_cant numeric; v_estado text; v_sum numeric;
begin
  if p_item is null then return; end if;

  select i.cantidad, i.estado into v_cant, v_estado
    from public.casos_items i where i.id = p_item;
  if not found then return; end if;                      -- el ítem se borró (cascade)
  if v_cant is null or v_cant <= 0 then return; end if;   -- sin cantidad numérica: nada que calcular

  select coalesce(sum(a.cantidad), 0) into v_sum
    from public.casos_item_aportes a where a.item_id = p_item;

  if v_sum >= v_cant then
    if v_estado not in ('cumplido', 'cancelado') then
      update public.casos_items set estado = 'cumplido', actualizado_en = now() where id = p_item;
    end if;
  elsif v_estado = 'cumplido' then
    update public.casos_items set estado = 'en_gestion', actualizado_en = now() where id = p_item;
  elsif v_sum > 0 and v_estado = 'pendiente' then
    update public.casos_items set estado = 'en_gestion', actualizado_en = now() where id = p_item;
  end if;
end $$;

revoke all on function public.recalcular_cumplimiento_item(uuid) from public;
-- Sin grant: la llama únicamente el trigger de abajo.

create or replace function public.recalcular_item_al_aportar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalcular_cumplimiento_item(old.item_id);
  else
    perform public.recalcular_cumplimiento_item(new.item_id);
    -- Un aporte no debería cambiar de ítem, pero si pasara hay que recalcular los DOS.
    if tg_op = 'UPDATE' and old.item_id is distinct from new.item_id then
      perform public.recalcular_cumplimiento_item(old.item_id);
    end if;
  end if;
  return null;
end $$;

drop trigger if exists trg_recalcular_item_al_aportar on public.casos_item_aportes;
create trigger trg_recalcular_item_al_aportar
  after insert or update or delete on public.casos_item_aportes
  for each row execute function public.recalcular_item_al_aportar();

comment on function public.recalcular_item_al_aportar() is
  'Al registrar, corregir o borrar un aporte (0221) recalcula el cumplimiento del ítem: lo cierra en ''cumplido'' al llegar al 100 % y lo devuelve a ''en_gestion'' si una corrección a la baja lo deja por debajo. NO toca solicitudes_insumo.estado: el guard auditar_estado_insumo (0210) lanzaría 42501 al corregir un aporte de una solicitud ya entregada.';

-- Redacción se entera EN VIVO por la tabla-señal (0181), nunca por `casos` (que le
-- entregaría el contacto por el WebSocket). Mismo criterio que 0220: solo se sella la
-- señal de casos que YA la tienen; si no es difundible, no se crea ninguna.
create or replace function public.tocar_senal_difusion_aportes()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_item uuid; v_caso uuid;
begin
  v_item := case when tg_op = 'DELETE' then old.item_id else new.item_id end;
  select i.caso_id into v_caso from public.casos_items i where i.id = v_item;
  if v_caso is null then return null; end if;
  update public.casos_difusion_senal set actualizado_en = now() where caso_id = v_caso;
  return null;
end $$;

drop trigger if exists trg_senal_difusion_aportes on public.casos_item_aportes;
create trigger trg_senal_difusion_aportes
  after insert or update or delete on public.casos_item_aportes
  for each row execute function public.tocar_senal_difusion_aportes();

-- ═══ (5) registrar_aporte_item — la puerta de escritura ═══
-- Gate: Logística (que incluye a su mando desde 0214) o la administración. Es su libro:
-- Recopilación y Verificación describen QUÉ hace falta (0218), Logística registra QUÉ se
-- consiguió. `p_cantidad` nulo = «lo que faltaba» (el atajo natural del botón «cubrir el
-- resto»). Doble asiento de auditoría: entidad='casos' (Historial de cambios del detalle)
-- y entidad='solicitudes_insumo' (Registro de actividad de Logística).
create or replace function public.registrar_aporte_item(
  p_item       uuid,
  p_cantidad   numeric default null,
  p_origen     text    default 'miembro',
  p_perfil     uuid    default null,
  p_proveedor  uuid    default null,
  p_afiliado   uuid    default null,
  p_tercero    text    default null,
  p_punto      uuid    default null,
  p_movimiento uuid    default null,
  p_solicitud  uuid    default null,
  p_nota       text    default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_origen  text := lower(coalesce(nullif(btrim(coalesce(p_origen, '')), ''), 'miembro'));
  v_tercero text := left(nullif(btrim(coalesce(p_tercero, '')), ''), 160);
  v_nota    text := left(nullif(btrim(coalesce(p_nota, '')), ''), 500);
  v_it      record;
  v_sum     numeric;
  v_cant    numeric := p_cantidad;
  v_perfil  uuid := p_perfil;
  v_sol     uuid := p_solicitud;
  v_id      uuid;
begin
  if not (public.puede_logistica() or public.es_admin()) then
    raise exception 'Solo Logística puede registrar el cumplimiento de un ítem.' using errcode = '42501';
  end if;
  if p_item is null then
    raise exception 'Falta el ítem.' using errcode = '22023';
  end if;
  if not (v_origen = any (array['inventario', 'proveedor', 'donacion', 'tercero', 'miembro'])) then
    raise exception 'Origen del aporte no válido: %', v_origen using errcode = '22023';
  end if;
  if v_origen = 'tercero' and v_tercero is null then
    raise exception 'Indica QUIÉN lo cubrió (otra organización o persona).' using errcode = '22023';
  end if;

  select i.id, i.caso_id, i.descripcion, i.cantidad, i.unidad, i.estado into v_it
    from public.casos_items i where i.id = p_item;
  if v_it.id is null then
    raise exception 'Ítem no encontrado.' using errcode = 'P0002';
  end if;

  -- Cantidad: si no se indica, se toma LO QUE FALTA. En un ítem sin cantidad numérica
  -- (los heredados del texto libre) el aporte vale 1 como marca simbólica: el porcentaje
  -- seguirá siendo NULL y quien manda es el estado.
  if v_cant is null then
    select coalesce(sum(a.cantidad), 0) into v_sum
      from public.casos_item_aportes a where a.item_id = p_item;
    v_cant := case
                when v_it.cantidad is null or v_it.cantidad <= 0 then 1
                else greatest(v_it.cantidad - v_sum, 0)
              end;
    if v_cant <= 0 then
      raise exception 'Este ítem ya está cubierto por completo.' using errcode = '22023';
    end if;
  end if;
  if v_cant <= 0 then
    raise exception 'La cantidad aportada debe ser mayor que cero.' using errcode = '22023';
  end if;

  -- «La intervención de qué miembros»: si el aporte es de un miembro y no se dice cuál,
  -- es de quien lo registra.
  if v_origen = 'miembro' and v_perfil is null then
    v_perfil := auth.uid();
  end if;

  -- La solicitud de Logística ligada se deduce sola (uq_solins_caso, 0113: una por caso).
  if v_sol is null and v_it.caso_id is not null then
    select s.id into v_sol from public.solicitudes_insumo s where s.caso_id = v_it.caso_id;
  end if;

  insert into public.casos_item_aportes
    (item_id, solicitud_id, cantidad, origen, proveedor_id, perfil_id, afiliado_id,
     tercero_nombre, punto_id, movimiento_id, nota, registrado_por)
  values
    (p_item, v_sol, v_cant, v_origen,
     case when v_origen = 'tercero' then null else p_proveedor end,
     v_perfil, p_afiliado, v_tercero, p_punto, p_movimiento, v_nota, auth.uid())
  returning id into v_id;

  -- Doble asiento (molde 0201). El cambio de estado que provoque este aporte lo audita
  -- trg_auditar_cambio_item (0219) por su cuenta: aquí se registra el HECHO del aporte
  -- —quién dio qué—, que es otra cosa, no una repetición del mismo cambio.
  perform public.registrar_auditoria(
    'aporte_registrado', 'casos', v_it.caso_id::text,
    jsonb_build_object('item', p_item, 'descripcion', v_it.descripcion, 'cantidad', v_cant,
                       'unidad', v_it.unidad, 'origen', v_origen, 'tercero', v_tercero));
  if v_sol is not null then
    perform public.registrar_auditoria(
      'aporte_registrado', 'solicitudes_insumo', v_sol::text,
      jsonb_build_object('item', p_item, 'descripcion', v_it.descripcion, 'cantidad', v_cant,
                         'origen', v_origen, 'tercero', v_tercero));
  end if;

  return v_id;
end $$;

revoke all on function public.registrar_aporte_item(uuid, numeric, text, uuid, uuid, uuid, text, uuid, uuid, uuid, text) from public;
grant execute on function public.registrar_aporte_item(uuid, numeric, text, uuid, uuid, uuid, text, uuid, uuid, uuid, text) to authenticated;

comment on function public.registrar_aporte_item(uuid, numeric, text, uuid, uuid, uuid, text, uuid, uuid, uuid, text) is
  'Registra cuánto se cubrió de un ítem y gracias a quién (0221). Gate puede_logistica() or es_admin(). p_cantidad nulo = lo que falte. origen=''tercero'' exige nombre (P9). Deja doble asiento de auditoría (casos + solicitudes_insumo); el cierre del ítem al 100 % lo hace el trigger de recálculo.';

-- Corregir a la baja = quitar el aporte equivocado y volver a registrarlo. Es la
-- operación que el guard 0210 habría hecho explotar si el recálculo tocara la solicitud.
create or replace function public.eliminar_aporte_item(p_aporte uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ap record; v_caso uuid; v_desc text;
begin
  if not (public.puede_logistica() or public.es_admin()) then
    raise exception 'Solo Logística puede corregir el cumplimiento de un ítem.' using errcode = '42501';
  end if;

  select a.id, a.item_id, a.cantidad, a.origen, a.tercero_nombre, a.solicitud_id into v_ap
    from public.casos_item_aportes a where a.id = p_aporte;
  if v_ap.id is null then return; end if;        -- idempotente: ya no está

  select i.caso_id, i.descripcion into v_caso, v_desc
    from public.casos_items i where i.id = v_ap.item_id;

  delete from public.casos_item_aportes where id = p_aporte;

  perform public.registrar_auditoria(
    'aporte_eliminado', 'casos', v_caso::text,
    jsonb_build_object('item', v_ap.item_id, 'descripcion', v_desc,
                       'cantidad', v_ap.cantidad, 'origen', v_ap.origen));
  if v_ap.solicitud_id is not null then
    perform public.registrar_auditoria(
      'aporte_eliminado', 'solicitudes_insumo', v_ap.solicitud_id::text,
      jsonb_build_object('item', v_ap.item_id, 'cantidad', v_ap.cantidad, 'origen', v_ap.origen));
  end if;
end $$;

revoke all on function public.eliminar_aporte_item(uuid) from public;
grant execute on function public.eliminar_aporte_item(uuid) to authenticated;

comment on function public.eliminar_aporte_item(uuid) is
  'Quita un aporte mal registrado (0221). El trigger de recálculo devuelve el ítem a «en gestión» si con eso baja del 100 %. Verificado: hacerlo sobre una solicitud YA ENTREGADA no lanza 42501, porque el recálculo no toca solicitudes_insumo.estado (guard 0210).';

-- ═══ (6) P9 — «lo cubrió un tercero; ya no lo gestionamos» ═══
-- Atajo de un clic sobre `registrar_aporte_item`: registra el aporte de tercero por TODO
-- lo que faltaba y, cuando el ítem no tiene cantidad numérica (y por tanto el recálculo
-- no puede cerrarlo solo), lo pone en 'cumplido' explícitamente. Si se indica una
-- cantidad, es un aporte parcial de un tercero y el ítem sigue su curso normal.
create or replace function public.marcar_item_cubierto_tercero(
  p_item     uuid,
  p_tercero  text,
  p_cantidad numeric default null,
  p_nota     text    default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_it record; v_nombre text := left(nullif(btrim(coalesce(p_tercero, '')), ''), 160);
begin
  if v_nombre is null then
    raise exception 'Indica qué organización o persona lo cubrió.' using errcode = '22023';
  end if;

  -- El permiso, la existencia del ítem y la auditoría los aplica la RPC de aportes.
  v_id := public.registrar_aporte_item(
            p_item := p_item, p_cantidad := p_cantidad, p_origen := 'tercero',
            p_tercero := v_nombre, p_nota := p_nota);

  select i.id, i.caso_id, i.cantidad, i.estado, i.descripcion into v_it
    from public.casos_items i where i.id = p_item;

  -- Sin cantidad numérica el recálculo no puede cerrarlo (no hay denominador): se cierra
  -- aquí, que es justo lo que significa «lo cubrió otro, quítalo de nuestra cola».
  if p_cantidad is null and v_it.estado not in ('cumplido', 'cancelado') then
    update public.casos_items set estado = 'cumplido', actualizado_en = now() where id = p_item;
  end if;

  perform public.registrar_auditoria(
    'item_cubierto_tercero', 'casos', v_it.caso_id::text,
    jsonb_build_object('item', p_item, 'descripcion', v_it.descripcion, 'tercero', v_nombre));

  return v_id;
end $$;

revoke all on function public.marcar_item_cubierto_tercero(uuid, text, numeric, text) from public;
grant execute on function public.marcar_item_cubierto_tercero(uuid, text, numeric, text) to authenticated;

comment on function public.marcar_item_cubierto_tercero(uuid, text, numeric, text) is
  'P9 (0221): marca un ítem como cubierto por otra ONG o persona ajena. Registra el aporte con origen=''tercero'' por lo que faltaba y cierra el ítem (también los que no tienen cantidad numérica). Con p_cantidad se registra un aporte PARCIAL de un tercero y el ítem sigue su curso. El origen queda grabado: en la interfaz y en la reportería nunca se confunde con lo que cubrió la organización.';

-- ═══ (7) Surtir desde el centro dejando el aporte enlazado al movimiento ═══
-- Hasta ahora `surtirDesdeCentro` (app) llamaba a `registrar_salida` (0184) y el único
-- vínculo entre esa salida y la solicitud era el texto del motivo. Esta RPC hace las dos
-- cosas en la MISMA transacción: descuenta el stock y escribe el aporte del ítem con su
-- `movimiento_id`. `p_item` es el ítem del DESGLOSE (casos_items); `p_producto`, la fila
-- del inventario del centro (inventario_acopio).
create or replace function public.aportar_item_desde_centro(
  p_item      uuid,
  p_punto     uuid,
  p_producto  uuid,
  p_cantidad  numeric,
  p_solicitud uuid default null,
  p_nota      text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_salida numeric; v_mov uuid; v_it record; v_motivo text;
begin
  if not (public.puede_logistica() or public.es_admin()) then
    raise exception 'Solo Logística puede surtir un ítem desde un centro.' using errcode = '42501';
  end if;

  select i.id, i.caso_id, i.descripcion into v_it from public.casos_items i where i.id = p_item;
  if v_it.id is null then
    raise exception 'Ítem no encontrado.' using errcode = 'P0002';
  end if;

  v_motivo := left(btrim('Entrega · ' || coalesce(v_it.descripcion, '') ||
                         coalesce(' (sol. ' || substr(p_solicitud::text, 1, 8) || ')', '')), 300);

  -- registrar_salida (0184) bloquea la fila, aplica el clamp a lo disponible, deja el
  -- asiento en la bitácora del centro y exige puede_gestionar_acopio(p_punto) por su
  -- cuenta. Devuelve lo REALMENTE descontado, que es lo que se registra como aporte.
  v_salida := public.registrar_salida(p_punto, p_producto, p_cantidad, v_motivo);

  -- El asiento recién escrito, dentro de esta misma transacción: `creado_en` es el
  -- timestamp de la transacción (default now()), así que basta acotar por él + actor.
  select m.id into v_mov
    from public.movimientos_acopio m
   where m.punto_id = p_punto and m.item_id = p_producto and m.tipo = 'salida'
     and m.actor_id is not distinct from auth.uid() and m.creado_en = now()
   order by m.ctid desc
   limit 1;

  return public.registrar_aporte_item(
           p_item := p_item, p_cantidad := v_salida, p_origen := 'inventario',
           p_punto := p_punto, p_movimiento := v_mov, p_solicitud := p_solicitud,
           p_nota := p_nota);
end $$;

revoke all on function public.aportar_item_desde_centro(uuid, uuid, uuid, numeric, uuid, text) from public;
grant execute on function public.aportar_item_desde_centro(uuid, uuid, uuid, numeric, uuid, text) to authenticated;

comment on function public.aportar_item_desde_centro(uuid, uuid, uuid, numeric, uuid, text) is
  'Surte un ítem del desglose desde el inventario de un centro (0221): descuenta con registrar_salida (0184) y escribe el aporte con su movimiento_id en la misma transacción. Es la FK que sustituye al string «(sol. 1a2b3c4d)» como único enlace entre una salida de stock y la solicitud.';

-- ═══ (8) items_de_caso — ahora con cubierto y pct de verdad ═══
-- `create or replace` a propósito: la firma se publicó en 0220 y ninguna pantalla cambia.
-- `pct` es NULL —no 0— cuando el ítem no tiene cantidad numérica (§2.6): sin denominador
-- no hay porcentaje. La interfaz sigue pintando el AVANCE por `estado`; `cubierto`/`pct`
-- son la cobertura (cuánto de cuánto), que es otra lectura y se muestra aparte.
create or replace function public.items_de_caso(p_caso uuid)
returns table (
  id          uuid,
  orden       int,
  tipo        text,
  descripcion text,
  cantidad    numeric,
  unidad      text,
  estado      text,
  cubierto    numeric,
  pct         numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_caso is null or not public.es_verificado() then
    return;
  end if;

  return query
    select i.id,
           i.orden,
           i.tipo::text,
           i.descripcion,
           i.cantidad,
           i.unidad,
           i.estado,
           coalesce(a.suma, 0)::numeric as cubierto,
           case when i.cantidad is null or i.cantidad <= 0 then null
                else least(100, round(coalesce(a.suma, 0) / i.cantidad * 100, 1)) end as pct
      from public.casos_items i
      left join lateral (
        select sum(x.cantidad) as suma
          from public.casos_item_aportes x
         where x.item_id = i.id
      ) a on true
     where i.caso_id = p_caso
     order by i.orden, i.creado_en;
end $$;

revoke all on function public.items_de_caso(uuid) from public;
grant execute on function public.items_de_caso(uuid) to authenticated;

comment on function public.items_de_caso(uuid) is
  'Desglose por ítem CURADO y cross-área (0220, relleno en 0221): id, orden, tipo, descripción, cantidad, unidad, estado + cubierto (Σ aportes) y pct (cubierto/cantidad, topado a 100; NULL si el ítem no tiene cantidad numérica). Sin contacto ni PII. Gate es_verificado() con retorno vacío. Es la vía por la que Redacción —que no lee `casos` desde 0180— sigue el avance y la cobertura de cada ítem.';

-- Quién aportó qué, CURADO para todas las áreas. `quien` ya viene resuelto para las
-- entidades externas (tercero, proveedor, afiliado, centro de acopio); para un miembro de
-- la organización se devuelve además `perfil_id`, de modo que la interfaz pueda aplicar la
-- regla de privacidad de nombres (`nombreMostrado`: solo el primer nombre salvo
-- administración).
create or replace function public.aportes_de_caso(p_caso uuid)
returns table (
  id         uuid,
  item_id    uuid,
  cantidad   numeric,
  origen     text,
  perfil_id  uuid,
  quien      text,
  nota       text,
  creado_en  timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_caso is null or not public.es_verificado() then
    return;
  end if;

  return query
    select a.id,
           a.item_id,
           a.cantidad,
           a.origen,
           a.perfil_id,
           coalesce(nullif(btrim(coalesce(a.tercero_nombre, '')), ''),
                    pr.nombre, af.nombre, pe.nombre_completo, pa.nombre) as quien,
           a.nota,
           a.creado_en
      from public.casos_item_aportes a
      join public.casos_items i on i.id = a.item_id
      left join public.proveedores   pr on pr.id = a.proveedor_id
      left join public.afiliados     af on af.id = a.afiliado_id
      left join public.perfiles      pe on pe.id = a.perfil_id
      left join public.puntos_acopio pa on pa.id = a.punto_id
     where i.caso_id = p_caso
     order by a.creado_en;
end $$;

revoke all on function public.aportes_de_caso(uuid) from public;
grant execute on function public.aportes_de_caso(uuid) to authenticated;

comment on function public.aportes_de_caso(uuid) is
  'Aportes de todos los ítems de un caso, curados (0221): cuánto, con qué origen y de quién, con el nombre ya resuelto (tercero / proveedor / afiliado / miembro). Devuelve perfil_id para que la interfaz aplique la regla de privacidad de nombres. Gate es_verificado() con retorno vacío.';

-- ═══ (9) REGLA DE CIERRE — «entregado» solo con el desglose cubierto ═══
-- Compuerta de sesión `app.entrega_parcial_ok` (familia de app.devolver_ok 0210,
-- app.publicado_ok 0166 y app.items_ok 0218). El trigger es BEFORE UPDATE OF estado, igual
-- que `auditar_estado_insumo` (0210): son dos triggers distintos sobre el mismo evento y
-- no se estorban —el de 0210 vigila SALIR de un estado terminal, este vigila ENTRAR a
-- 'entregado'—. Una solicitud sin caso, o con un caso sin desglose, se comporta
-- exactamente como antes de esta migración.
create or replace function public.gate_entrega_completa()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_c record;
begin
  if new.estado::text = 'entregado' and old.estado::text is distinct from 'entregado' then
    -- Entrega parcial consciente (entregar_solicitud_insumo con p_forzar) o administración.
    if coalesce(current_setting('app.entrega_parcial_ok', true), '') = '1' or public.es_admin() then
      return new;
    end if;
    if new.caso_id is null then return new; end if;

    select * into v_c from public.cobertura_items_caso(new.caso_id);
    if coalesce(v_c.n_items, 0) > 0 and coalesce(v_c.n_cumplidos, 0) < v_c.n_items then
      raise exception 'La solicitud aún tiene ítems sin cubrir (% de % cubiertos). Registra lo que se consiguió o ciérrala como entrega parcial.',
        coalesce(v_c.n_cumplidos, 0), v_c.n_items using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_gate_entrega_completa on public.solicitudes_insumo;
create trigger trg_gate_entrega_completa
  before update of estado on public.solicitudes_insumo
  for each row execute function public.gate_entrega_completa();

comment on function public.gate_entrega_completa() is
  'Regla de cierre (0221): una solicitud no pasa a «entregado» mientras queden ítems del desglose sin cubrir. Se salta con la compuerta de sesión app.entrega_parcial_ok —que solo abre entregar_solicitud_insumo cuando Logística fuerza la entrega a sabiendas— o con es_admin(). Sin desglose, el comportamiento es el de siempre.';

-- La puerta sancionada: entrega completa, o entrega parcial EXPLÍCITA y auditada.
create or replace function public.entregar_solicitud_insumo(
  p_solicitud uuid,
  p_forzar    boolean default false,
  p_nota      text    default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_sol     record;
  v_c       record;
  v_parcial boolean := false;
  v_nota    text := left(nullif(btrim(coalesce(p_nota, '')), ''), 500);
begin
  if not (public.es_admin() or public.puede_logistica()) then
    raise exception 'No tienes permiso para cerrar esta entrega.' using errcode = '42501';
  end if;

  select s.id, s.estado, s.caso_id, s.entrega_nota into v_sol
    from public.solicitudes_insumo s where s.id = p_solicitud;
  if v_sol.id is null then
    raise exception 'Solicitud de insumo no encontrada.' using errcode = 'P0002';
  end if;
  if v_sol.estado::text = 'entregado' then return 'entregado'; end if;   -- idempotente
  if v_sol.estado::text = 'cancelado' then
    raise exception 'Una solicitud cancelada no se puede entregar.' using errcode = '22023';
  end if;

  select * into v_c from public.cobertura_items_caso(v_sol.caso_id);
  if coalesce(v_c.n_items, 0) > 0 and coalesce(v_c.n_cumplidos, 0) < v_c.n_items then
    if not coalesce(p_forzar, false) then
      raise exception 'Faltan ítems por cubrir: % de % (% %% de lo pedido). Registra los aportes o confirma la entrega parcial.',
        coalesce(v_c.n_cumplidos, 0), v_c.n_items, coalesce(v_c.pct, 0) using errcode = '22023';
    end if;
    v_parcial := true;
  end if;

  perform set_config('app.entrega_parcial_ok', '1', true);
  update public.solicitudes_insumo
     set estado = 'entregado'::public.estado_insumo,
         entrega_nota = case
                          when v_nota is null then entrega_nota
                          when coalesce(btrim(coalesce(entrega_nota, '')), '') = '' then v_nota
                          else left(entrega_nota || E'\n' || v_nota, 2000)
                        end,
         actualizado_en = now()
   where id = p_solicitud;
  perform set_config('app.entrega_parcial_ok', '', true);

  perform public.registrar_auditoria(
    case when v_parcial then 'entrega_parcial' else 'entrega_completa' end,
    'solicitudes_insumo', p_solicitud::text,
    jsonb_build_object('caso_id', v_sol.caso_id, 'items', coalesce(v_c.n_items, 0),
                       'cubiertos', coalesce(v_c.n_cumplidos, 0), 'pct', v_c.pct));
  if v_sol.caso_id is not null then
    perform public.registrar_auditoria(
      case when v_parcial then 'entrega_parcial' else 'entrega_completa' end,
      'casos', v_sol.caso_id::text,
      jsonb_build_object('solicitud_id', p_solicitud, 'items', coalesce(v_c.n_items, 0),
                         'cubiertos', coalesce(v_c.n_cumplidos, 0), 'pct', v_c.pct));
  end if;

  return case when v_parcial then 'parcial' else 'completa' end;
end $$;

revoke all on function public.entregar_solicitud_insumo(uuid, boolean, text) from public;
grant execute on function public.entregar_solicitud_insumo(uuid, boolean, text) to authenticated;

comment on function public.entregar_solicitud_insumo(uuid, boolean, text) is
  'Cierra una solicitud como ENTREGADA (0221). Con el desglose cubierto al 100 % pasa sin más; con ítems pendientes exige p_forzar (entrega parcial consciente), abre la compuerta app.entrega_parcial_ok y deja el asiento ''entrega_parcial''. Idempotente si ya estaba entregada.';

-- ═══ (10) cerrar_caso_al_entregar — REESCRITA COMPLETA desde 0116 + regla de cierre ═══
-- Cuerpo de 0116 verbatim (resolver el caso + los dos avisos) con UNA condición nueva
-- delante: si el desglose no está cubierto, la entrega fue PARCIAL y el caso NO se
-- resuelve —sigue en el flujo, Redacción sigue difundiendo lo que falta y el aviso «tu
-- caso fue atendido» no sale antes de tiempo—. Queda el asiento 'casos:entrega_parcial'
-- con los números. Un caso SIN desglose se comporta exactamente igual que antes.
create or replace function public.cerrar_caso_al_entregar()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int; v_creador uuid; v_asignado uuid; v_c record;
begin
  if new.caso_id is not null and new.estado = 'entregado'
     and old.estado is distinct from 'entregado' then

    -- (0221) «Entregado» dejó de ser binario: con cobertura parcial, el caso sigue vivo.
    select * into v_c from public.cobertura_items_caso(new.caso_id);
    if coalesce(v_c.n_items, 0) > 0 and coalesce(v_c.n_cumplidos, 0) < v_c.n_items then
      insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
      values (auth.uid(), 'casos:entrega_parcial', 'casos', new.caso_id::text,
              jsonb_build_object('solicitud_id', new.id, 'items', v_c.n_items,
                                 'cubiertos', v_c.n_cumplidos, 'pct', v_c.pct));
      return new;
    end if;

    update public.casos set estado = 'resuelto', actualizado_en = now()
      where id = new.caso_id and estado::text in ('confirmado', 'enviado_redaccion')
      returning creado_por, asignado_a into v_creador, v_asignado;
    get diagnostics n = row_count;
    if n > 0 then
      insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
      values (auth.uid(), 'casos:resuelto', 'casos', new.caso_id::text,
              jsonb_build_object('solicitud_id', new.id));
      insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
      select distinct d, 'caso_resuelto', 'Tu caso fue atendido',
             'La ayuda se entregó y el caso quedó resuelto. 💛', '/casos/' || new.caso_id
      from (values (v_creador), (v_asignado)) as t(d)
      where d is not null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_cerrar_caso_al_entregar on public.solicitudes_insumo;
create trigger trg_cerrar_caso_al_entregar
  after update of estado on public.solicitudes_insumo
  for each row execute function public.cerrar_caso_al_entregar();

comment on function public.cerrar_caso_al_entregar() is
  'Al entregar una solicitud, resuelve el caso ligado y avisa a quien lo reportó y a quien lo atendió (0114/0116). Desde 0221, si el desglose por ítem NO está cubierto la entrega es PARCIAL: el caso no se resuelve (sigue en difusión) y queda el asiento ''casos:entrega_parcial''. Sin desglose, comportamiento idéntico al de siempre.';

-- ═══ (11) Realtime ═══
-- El aporte que NO cierra el ítem (4 de 5) no cambia `casos_items`, así que sin esto la
-- pantalla no se enteraría del avance parcial.
do $$ begin
  alter publication supabase_realtime add table public.casos_item_aportes;
exception when duplicate_object then null; end $$;
