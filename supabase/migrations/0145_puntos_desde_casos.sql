-- ============================================================
-- 0145 — Solicitudes marcadas como PUNTO → Centro en el mapa al verificarse
-- ------------------------------------------------------------
-- Recopilación no solo reporta necesidades: también puede MARCAR que una solicitud
-- es un PUNTO fijo o temporal de la respuesta —un hospital, un albergue o un centro
-- de acopio— con su ubicación. Como cualquier solicitud pasa por Verificación; y al
-- CONFIRMARSE, se crea automáticamente su punto en el mapa (un puntos_acopio que
-- gestiona Logística). Así la misma labor de verificar valida la existencia y
-- veracidad del punto antes de publicarlo. El punto sigue mostrándose además como
-- solicitud (dos pines, hasta que Logística lo atienda).
--
-- Se calca el patrón de 0126 (crear_centro_desde_lugar): trigger SECURITY DEFINER que
-- inserta el centro SIN dueño (creado_por = null), EXIGE ubicación, es IDEMPOTENTE
-- (índice único por caso) y NO se re-dispara (toca una columna que no es 'estado').
-- Enum-safe (punto_tipo es TEXT + CHECK; 'logistica'/'admin_logistica' son valores
-- PRE-existentes de rol_usuario → cast eager seguro). Idempotente. Ejecutar tras 0144.
-- ============================================================

-- 1) La solicitud puede declararse PUNTO del mapa (tipo + fijo/temporal + enlace al centro).
alter table public.casos
  add column if not exists punto_tipo text
    check (punto_tipo is null or punto_tipo in ('hospital','albergue','acopio','otro')),
  add column if not exists punto_temporal boolean not null default false,
  add column if not exists punto_acopio_id uuid references public.puntos_acopio (id) on delete set null;

-- Un punto exige ubicación (el mapa lo necesita; puntos_acopio.lat/lng son NOT NULL).
alter table public.casos drop constraint if exists chk_casos_punto_ubicacion;
alter table public.casos add constraint chk_casos_punto_ubicacion
  check (punto_tipo is null or (lat is not null and lng is not null));

-- 2) El centro recuerda de qué solicitud nació + si es temporal (etiqueta informativa).
alter table public.puntos_acopio
  add column if not exists caso_id uuid references public.casos (id) on delete set null;
alter table public.puntos_acopio
  add column if not exists temporal boolean not null default false;
-- Un centro se enlaza a lo sumo con una solicitud de origen (idempotencia del trigger).
create unique index if not exists idx_puntos_acopio_caso
  on public.puntos_acopio (caso_id) where caso_id is not null;

-- 3) Al CONFIRMAR una solicitud marcada como punto, crear su centro gestionable en el mapa.
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
  insert into public.puntos_acopio (nombre, tipo, responsable, lat, lng, temporal, caso_id, creado_por, activo)
    values (new.titulo, new.punto_tipo, new.contacto, new.lat, new.lng,
            coalesce(new.punto_temporal, false), new.id, null, true)
    returning id into v_punto;
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

drop trigger if exists trg_crear_centro_desde_caso on public.casos;
create trigger trg_crear_centro_desde_caso
  after insert or update of estado on public.casos
  for each row execute function public.crear_centro_desde_caso();
