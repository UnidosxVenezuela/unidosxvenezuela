-- ============================================================
-- 0198 — Departamento «Alianzas Estratégicas»: roles + grupos, reubicar Captación,
--        ampliar el destino de derivación 'alianzas', y tabla `afiliados`.
-- ------------------------------------------------------------
-- Se crea el departamento que agrupa PROSPECCIÓN (empresas grandes/medianas),
-- CAPTACIÓN (ya existe, se reubica) y AFILIACIÓN (profesionales/voluntarios). Esta es la
-- FUNDACIÓN (Fase 1): dos roles + grupos del sistema, el área operativa del departamento,
-- el mapeo grupo↔rol, los helpers de acceso, la ampliación del destino de derivación
-- 'alianzas' (0177) a los nuevos roles, y la tabla `afiliados` (base de Afiliación).
--
-- Enum-safety: los valores nuevos ('prospeccion','afiliacion') SOLO se referencian por
-- comparación TEXT (helpers, vía mis_roles()) o dentro de cuerpos plpgsql late-bound
-- (rol_de_grupo/clave_de_rol/roles_area_derivacion, como 0078/0133). Nunca en un cast
-- «eager» de una función `language sql` ni en una policy/DML de esta misma migración.
-- Idempotente. Ejecutar tras 0197.
-- ============================================================

-- 1) Roles nuevos.
alter type public.rol_usuario add value if not exists 'prospeccion';
alter type public.rol_usuario add value if not exists 'afiliacion';

-- 2) Área operativa del departamento + grupos del sistema (abierto=false: membresía por admin/líder).
insert into public.areas (clave, nombre, descripcion) values
  ('alianzas_estrategicas', 'Alianzas Estratégicas',
   'Consecución de recursos y aliados: prospección de empresas, captación y afiliación de profesionales/voluntarios.')
on conflict (clave) do nothing;

insert into public.grupos (nombre, area, clave, abierto, descripcion) values
  ('Prospección', 'alianzas_estrategicas', 'prospeccion', false,
   'Prospección de grandes y medianas empresas, organizaciones, fundaciones e iglesias.'),
  ('Afiliación', 'alianzas_estrategicas', 'afiliacion', false,
   'Afiliación y clasificación de profesionales y voluntarios por cargo.')
on conflict (clave) do update set nombre = excluded.nombre, area = excluded.area, descripcion = excluded.descripcion;

-- Reubicar el grupo de Captación bajo el departamento (antes 'gestion_informacion').
update public.grupos set area = 'alianzas_estrategicas' where clave = 'captacion';

-- 3) Mapeo grupo↔rol (plpgsql late-bound → los casts de enum nuevos son enum-safe; mismo
--    patrón que 0078/0133). Se reescriben COMPLETAS añadiendo prospeccion/afiliacion.
create or replace function public.rol_de_grupo(p_clave text)
returns public.rol_usuario language plpgsql immutable as $$
begin
  return (case p_clave
    when 'gestion_casos'               then 'recopilacion'
    when 'verificacion'                then 'verificador'
    when 'busqueda'                    then 'busqueda'
    when 'busqueda_nna'                then 'buscador_nna'
    when 'enlace_contacto'             then 'enlace_contacto'
    when 'digitalizacion'              then 'digitalizador'
    when 'verificacion_digitalizacion' then 'verificador_digitalizacion'
    when 'captacion'                   then 'captacion'
    when 'prospeccion'                 then 'prospeccion'
    when 'afiliacion'                  then 'afiliacion'
    when 'redaccion'                   then 'redaccion'
    when 'redes_sociales'              then 'redes_sociales'
    when 'diseno_grafico'              then 'diseno_grafico'
    when 'edicion_video'               then 'edicion_video'
    when 'influencers'                 then 'influencers'
    when 'apoyo_psicosocial'           then 'apoyo_psicosocial'
    when 'gestion_acopio'              then 'logistica'
    else null end)::public.rol_usuario;
end $$;

create or replace function public.clave_de_rol(p_rol public.rol_usuario)
returns text language plpgsql immutable as $$
begin
  return case p_rol::text
    when 'recopilacion'               then 'gestion_casos'
    when 'verificador'                then 'verificacion'
    when 'busqueda'                   then 'busqueda'
    when 'buscador_nna'               then 'busqueda_nna'
    when 'enlace_contacto'            then 'enlace_contacto'
    when 'digitalizador'              then 'digitalizacion'
    when 'verificador_digitalizacion' then 'verificacion_digitalizacion'
    when 'captacion'                  then 'captacion'
    when 'prospeccion'                then 'prospeccion'
    when 'afiliacion'                 then 'afiliacion'
    when 'redaccion'                  then 'redaccion'
    when 'redes_sociales'             then 'redes_sociales'
    when 'diseno_grafico'             then 'diseno_grafico'
    when 'edicion_video'              then 'edicion_video'
    when 'influencers'                then 'influencers'
    when 'apoyo_psicosocial'          then 'apoyo_psicosocial'
    when 'logistica'                  then 'gestion_acopio'
    else null end;
end $$;

-- 4) Helpers de acceso (comparación TEXT vía mis_roles() → enum-safe; molde es_captacion 0129).
create or replace function public.es_prospeccion()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(public.mis_roles()) r where r::text = 'prospeccion');
$$;
grant execute on function public.es_prospeccion() to authenticated;

create or replace function public.es_afiliacion()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(public.mis_roles()) r where r::text = 'afiliacion');
$$;
grant execute on function public.es_afiliacion() to authenticated;

create or replace function public.puede_prospeccion()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or public.es_prospeccion();
$$;
grant execute on function public.puede_prospeccion() to authenticated;

create or replace function public.puede_afiliacion()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or public.es_afiliacion();
$$;
grant execute on function public.puede_afiliacion() to authenticated;

-- Todo el departamento (para la base de Afiliación y la futura reportería agregada).
create or replace function public.puede_alianzas()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or public.es_captacion() or public.es_prospeccion() or public.es_afiliacion();
$$;
grant execute on function public.puede_alianzas() to authenticated;

-- 5) Ampliar el destino de derivación 'alianzas' (0177) a los roles del departamento.
--    puede_operar_area_derivacion: usa los helpers (llamadas a función, sin cast eager).
create or replace function public.puede_operar_area_derivacion(p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_area
    when 'logistica'    then public.es_admin() or public.tiene_rol('logistica') or public.tiene_rol('admin_logistica')
    when 'redes'        then public.es_admin() or public.tiene_rol('redaccion') or public.tiene_rol('redes_sociales')
                             or public.tiene_rol('diseno_grafico') or public.tiene_rol('edicion_video')
                             or public.tiene_rol('influencers') or public.tiene_rol('admin_redes')
    when 'donaciones'   then public.es_admin() or public.tiene_rol('logistica') or public.tiene_rol('admin_logistica')
                             or public.tiene_rol('captacion')
    when 'alianzas'     then public.es_admin() or public.tiene_rol('captacion')
                             or public.es_prospeccion() or public.es_afiliacion()
    when 'coordinacion' then public.es_admin()
    else public.es_admin()  -- 'otra' → Coordinación
  end;
$$;
grant execute on function public.puede_operar_area_derivacion(text) to authenticated;

-- roles_area_derivacion: se convierte a plpgsql para que el cast del array de enum (con
-- los valores nuevos) sea late-bound → enum-safe. Se reescribe COMPLETA.
create or replace function public.roles_area_derivacion(p_area text)
returns public.rol_usuario[] language plpgsql immutable as $$
begin
  return case p_area
    when 'logistica'    then array['logistica','admin_logistica']::public.rol_usuario[]
    when 'redes'        then array['redaccion','redes_sociales','diseno_grafico','edicion_video','influencers','admin_redes']::public.rol_usuario[]
    when 'donaciones'   then array['logistica','admin_logistica','captacion']::public.rol_usuario[]
    when 'alianzas'     then array['captacion','prospeccion','afiliacion']::public.rol_usuario[]
    when 'coordinacion' then array['admin']::public.rol_usuario[]
    else array['admin']::public.rol_usuario[]  -- 'otra'
  end;
end $$;

-- 6) Base de datos de Afiliación (profesionales/voluntarios, clasificados por cargo).
create table if not exists public.afiliados (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null default 'voluntario' check (tipo in ('profesional','voluntario')),
  cargo          text,
  nombre         text not null,
  contacto       text,
  habilidades    text,
  perfil_id      uuid references public.perfiles (id) on delete set null,  -- si además es usuario
  estado         text not null default 'activo' check (estado in ('activo','inactivo')),
  notas          text,
  creado_por     uuid references public.perfiles (id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_afiliados_tipo  on public.afiliados (tipo);
create index if not exists idx_afiliados_cargo on public.afiliados (cargo);

alter table public.afiliados enable row level security;

-- Solo el departamento de Alianzas (y el admin) ve y gestiona la base de afiliados.
drop policy if exists "afiliados_todo" on public.afiliados;
create policy "afiliados_todo" on public.afiliados for all to authenticated
  using (public.puede_alianzas()) with check (public.puede_alianzas());
