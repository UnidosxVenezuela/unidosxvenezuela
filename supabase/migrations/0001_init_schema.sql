-- ============================================================
-- Plataforma Unidos — Esquema inicial
-- Postgres 16 / Supabase
-- ============================================================
-- Convenciones: nombres en español, snake_case, claves uuid,
-- timestamps con zona horaria. Toda fecha en UTC.
-- ============================================================

-- Extensiones
create extension if not exists "pgcrypto";   -- gen_random_uuid()
-- create extension if not exists "postgis";  -- (opcional) geolocalización avanzada

-- ------------------------------------------------------------
-- Tipos enumerados
-- ------------------------------------------------------------
create type public.rol_usuario as enum
  ('admin', 'coordinador', 'lider_grupo', 'voluntario', 'observador');

-- Áreas inspiradas en el sistema de clusters humanitarios (IASC/OCHA).
create type public.area_clave as enum
  ('salud', 'agua_saneamiento', 'refugio', 'alimentacion', 'logistica',
   'busqueda_rescate', 'telecomunicaciones', 'proteccion', 'gestion_informacion');

create type public.estado_tarea as enum
  ('pendiente', 'asignada', 'en_progreso', 'bloqueada', 'completada', 'cancelada');

create type public.prioridad as enum ('baja', 'media', 'alta', 'critica');

create type public.nivel_sensibilidad as enum
  ('publica', 'interna', 'restringida', 'confidencial');

-- ------------------------------------------------------------
-- perfiles  (extiende auth.users)
-- ------------------------------------------------------------
create table public.perfiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  nombre_completo text not null default '',
  telefono        text,
  rol             public.rol_usuario not null default 'voluntario',
  verificado      boolean not null default false,  -- identidad confirmada por coordinación
  organizacion    text,
  creado_en       timestamptz not null default now()
);
comment on table public.perfiles is 'Datos de usuario ligados a auth.users.';

-- ------------------------------------------------------------
-- areas  (catálogo de clusters / áreas operativas)
-- ------------------------------------------------------------
create table public.areas (
  clave       public.area_clave primary key,
  nombre      text not null,
  descripcion text
);

-- ------------------------------------------------------------
-- grupos  (equipos operativos dentro de un área)
-- ------------------------------------------------------------
create table public.grupos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  area        public.area_clave not null references public.areas (clave),
  descripcion text,
  lider_id    uuid references public.perfiles (id) on delete set null,
  creado_en   timestamptz not null default now()
);
create index idx_grupos_area on public.grupos (area);

-- ------------------------------------------------------------
-- miembros_grupo  (pertenencia N:N usuario<->grupo)
-- ------------------------------------------------------------
create table public.miembros_grupo (
  grupo_id     uuid not null references public.grupos (id) on delete cascade,
  perfil_id    uuid not null references public.perfiles (id) on delete cascade,
  rol_en_grupo text not null default 'miembro',  -- 'lider' | 'miembro'
  unido_en     timestamptz not null default now(),
  primary key (grupo_id, perfil_id)
);
create index idx_miembros_perfil on public.miembros_grupo (perfil_id);

-- ------------------------------------------------------------
-- tareas
-- ------------------------------------------------------------
create table public.tareas (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null,
  descripcion   text,
  estado        public.estado_tarea not null default 'pendiente',
  prioridad     public.prioridad not null default 'media',
  grupo_id      uuid references public.grupos (id) on delete set null,
  asignado_a    uuid references public.perfiles (id) on delete set null,
  creado_por    uuid not null references public.perfiles (id),
  lat           double precision,   -- ubicación opcional (usar PostGIS en fase 2)
  lng           double precision,
  vence_en      timestamptz,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index idx_tareas_grupo    on public.tareas (grupo_id);
create index idx_tareas_asignado on public.tareas (asignado_a);
create index idx_tareas_estado   on public.tareas (estado);

create table public.comentarios_tarea (
  id        uuid primary key default gen_random_uuid(),
  tarea_id  uuid not null references public.tareas (id) on delete cascade,
  autor_id  uuid not null references public.perfiles (id),
  contenido text not null,
  creado_en timestamptz not null default now()
);
create index idx_comtarea_tarea on public.comentarios_tarea (tarea_id);

-- ------------------------------------------------------------
-- publicaciones  (tablón de opiniones / anuncios)
-- ------------------------------------------------------------
create table public.publicaciones (
  id            uuid primary key default gen_random_uuid(),
  autor_id      uuid not null references public.perfiles (id),
  grupo_id      uuid references public.grupos (id) on delete cascade,  -- null = tablón general
  contenido     text not null,
  sensibilidad  public.nivel_sensibilidad not null default 'interna',
  creado_en     timestamptz not null default now()
);
create index idx_pub_grupo on public.publicaciones (grupo_id);

create table public.comentarios_publicacion (
  id             uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references public.publicaciones (id) on delete cascade,
  autor_id       uuid not null references public.perfiles (id),
  contenido      text not null,
  creado_en      timestamptz not null default now()
);

-- ------------------------------------------------------------
-- notificaciones
-- ------------------------------------------------------------
create table public.notificaciones (
  id             uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null references public.perfiles (id) on delete cascade,
  tipo           text not null,            -- 'tarea_asignada' | 'mencion' | 'anuncio' ...
  titulo         text not null,
  cuerpo         text,
  enlace         text,
  leida          boolean not null default false,
  creado_en      timestamptz not null default now()
);
create index idx_notif_dest on public.notificaciones (destinatario_id, leida);

-- ------------------------------------------------------------
-- registro_auditoria  (rastro de acceso a información sensible)
-- ------------------------------------------------------------
create table public.registro_auditoria (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.perfiles (id),
  accion     text not null,        -- 'lectura' | 'creacion' | 'edicion' | 'borrado'
  entidad    text not null,        -- 'tarea' | 'publicacion' | 'perfil' ...
  entidad_id text,
  metadata   jsonb,
  creado_en  timestamptz not null default now()
);
create index idx_audit_actor on public.registro_auditoria (actor_id);

-- ============================================================
-- Funciones auxiliares (SECURITY DEFINER para evitar recursión en RLS)
-- ============================================================
create or replace function public.mi_rol()
returns public.rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid();
$$;

create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles
                 where id = auth.uid() and rol = 'admin');
$$;

create or replace function public.es_coordinacion()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles
                 where id = auth.uid() and rol in ('admin', 'coordinador'));
$$;

create or replace function public.es_miembro_de(g uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.miembros_grupo
                 where grupo_id = g and perfil_id = auth.uid());
$$;

-- ============================================================
-- Triggers
-- ============================================================
-- actualizado_en automático
create or replace function public.set_actualizado_en()
returns trigger language plpgsql as $$
begin
  new.actualizado_en = now();
  return new;
end; $$;

create trigger trg_tareas_actualizado
  before update on public.tareas
  for each row execute function public.set_actualizado_en();

-- Crear perfil automáticamente al registrarse un usuario
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre_completo, telefono)
  values (new.id,
          coalesce(new.raw_user_meta_data ->> 'nombre_completo', ''),
          new.phone);
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Notificar al asignar/reasignar una tarea
create or replace function public.notificar_asignacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.asignado_a is not null
     and (tg_op = 'INSERT' or new.asignado_a is distinct from old.asignado_a) then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    values (new.asignado_a, 'tarea_asignada',
            'Nueva tarea asignada', new.titulo, '/tareas/' || new.id);
  end if;
  return new;
end; $$;

create trigger trg_tareas_notificar
  after insert or update of asignado_a on public.tareas
  for each row execute function public.notificar_asignacion();
