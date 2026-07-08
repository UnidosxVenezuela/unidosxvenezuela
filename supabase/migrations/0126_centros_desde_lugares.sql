-- ============================================================
-- 0126 — Lugares verificados → Centros gestionables (Acopio)
-- ------------------------------------------------------------
-- Cuando un LUGAR de Digitalización (hospital / albergue / centro de acopio /
-- otro) se marca 'verificado' en la moderación, aparece en la gestión de
-- «Centros de acopio» para administrarlo con TODO lo ya construido: datos,
-- capacidad de camas, inventario, necesidades y traspasos. Para eso:
--   · puntos_acopio gana un 'tipo' (los centros actuales quedan como 'acopio')
--     y un 'lugar_id' que lo enlaza con su lugar de origen.
--   · Un trigger crea (o enlaza) el centro al verificar el lugar; exige ubicación,
--     porque un lugar verificado es un punto real del mapa.
--   · Backfill: los lugares YA verificados se vuelcan a Centros.
-- El centro nace SIN dueño (creado_por = null): lo gestionan el admin y los
-- responsables que este asigne, no el moderador de Digitalización. El SELECT de
-- centros ya es público a autenticados; la edición sigue por puede_gestionar_acopio().
-- Sin enums nuevos (tipo es TEXT + CHECK). Idempotente. Tras 0125.
-- ============================================================

-- 1) Tipo del centro + enlace a su lugar de origen.
alter table public.puntos_acopio
  add column if not exists tipo text not null default 'acopio'
    check (tipo in ('hospital','albergue','acopio','otro'));
alter table public.puntos_acopio
  add column if not exists lugar_id uuid references public.lugares (id) on delete set null;
-- Un centro se enlaza a lo sumo con un lugar de origen.
create unique index if not exists idx_puntos_acopio_lugar
  on public.puntos_acopio (lugar_id) where lugar_id is not null;

-- 2) Al verificar un lugar, crear (o enlazar) su centro gestionable.
create or replace function public.crear_centro_desde_lugar()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_punto uuid;
begin
  -- Solo cuando el lugar QUEDA 'verificado' (transición, no re-guardados).
  if new.estado is distinct from 'verificado' then return new; end if;
  if tg_op = 'UPDATE' and old.estado = 'verificado' then return new; end if;

  -- Un lugar verificado es un punto real: exige ubicación (mapa + centro).
  if new.lat is null or new.lng is null then
    raise exception 'Agrega la ubicación (latitud y longitud) del lugar antes de verificarlo.'
      using errcode = '23514';
  end if;

  if new.punto_acopio_id is not null then
    -- Enlazar el centro ya elegido con este lugar (si aún no tiene origen).
    update public.puntos_acopio
       set lugar_id = new.id, activo = true, actualizado_en = now()
     where id = new.punto_acopio_id and lugar_id is null;
  else
    -- Crear un centro nuevo a partir del lugar (sin dueño: lo asigna el admin).
    insert into public.puntos_acopio (nombre, tipo, direccion, lat, lng, lugar_id, creado_por, activo)
      values (new.nombre, new.tipo, new.direccion, new.lat, new.lng, new.id, null, true)
      returning id into v_punto;
    -- Enlazar el lugar con su centro. Solo toca 'punto_acopio_id' (no 'estado'),
    -- así que NO vuelve a disparar este trigger (definido "of estado").
    update public.lugares set punto_acopio_id = v_punto where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_lugar_verificado on public.lugares;
create trigger trg_lugar_verificado
  after insert or update of estado on public.lugares
  for each row execute function public.crear_centro_desde_lugar();

-- 3) Backfill de lugares YA verificados hacia Centros.
--    a) Enlazar los que ya apuntan a un centro existente.
update public.puntos_acopio pa
   set lugar_id = l.id
  from public.lugares l
 where l.estado = 'verificado' and l.punto_acopio_id = pa.id and pa.lugar_id is null;
--    b) Crear un centro para los verificados con ubicación y sin centro aún.
with nuevos as (
  insert into public.puntos_acopio (nombre, tipo, direccion, lat, lng, lugar_id, creado_por, activo)
  select l.nombre, l.tipo, l.direccion, l.lat, l.lng, l.id, null, true
    from public.lugares l
   where l.estado = 'verificado' and l.punto_acopio_id is null
     and l.lat is not null and l.lng is not null
  returning id, lugar_id
)
update public.lugares l set punto_acopio_id = n.id
  from nuevos n where l.id = n.lugar_id;
