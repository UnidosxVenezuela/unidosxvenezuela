-- ============================================================
-- 0133 — Grupo del sistema para el rol Captación de Oportunidades
-- ------------------------------------------------------------
-- El rol `captacion` (0129) se creó SIN grupo del sistema vinculado, así que —a
-- diferencia del resto de roles funcionales— no podía gestionarse por MEMBRESÍA
-- (líder/coordinador, alta delegada, sincronización de rol). Aquí:
--   1) se crea el grupo del sistema con clave 'captacion';
--   2) se enlaza al rol en el mapeo grupo↔rol (`rol_de_grupo`/`clave_de_rol`), de
--      modo que agregar a alguien al grupo sincroniza el rol (trigger
--      `sincronizar_rol_grupo`, 0055) y el rol resuelve su grupo (alta delegada,
--      página del grupo — ambas leen `rol_de_grupo` por RPC);
--   3) se meten al grupo los que YA tienen el rol (equipo actual), idempotente.
--
-- `captacion` ya existe en el enum (0129, migración PREVIA) → sin problema de
-- enum-safety; además `rol_de_grupo`/`clave_de_rol` son plpgsql (late-bound).
-- Área `gestion_informacion` (como enlace_contacto / verificacion_digitalizacion:
-- está sembrada en `areas` y tiene etiqueta en la app). Idempotente. Tras 0132.
-- ============================================================

-- 1) Grupo del sistema (abierto=false: la membresía la maneja admin/líder, no autoservicio).
insert into public.grupos (nombre, area, clave, abierto, descripcion) values
  ('Captación de Oportunidades', 'gestion_informacion', 'captacion', false,
   'Registro y clasificación de contactos estratégicos: fundaciones, organizaciones, empresas, proyectos y alianzas.')
on conflict (clave) do update set nombre = excluded.nombre, descripcion = excluded.descripcion;

-- 2) Mapeo grupo ↔ rol: se añade `captacion` (rebase de 0125; plpgsql late-bound → enum-safe).
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
    when 'redaccion'                  then 'redaccion'
    when 'redes_sociales'             then 'redes_sociales'
    when 'diseno_grafico'             then 'diseno_grafico'
    when 'edicion_video'              then 'edicion_video'
    when 'influencers'                then 'influencers'
    when 'apoyo_psicosocial'          then 'apoyo_psicosocial'
    when 'logistica'                  then 'gestion_acopio'
    else null end;
end $$;

-- 3) Backfill: quienes YA tienen el rol `captacion` (principal o adicional) entran al
-- grupo, para que el equipo actual quede reflejado. El trigger `sincronizar_rol_grupo`
-- deduplica (no altera el rol si ya lo tiene). `where not exists` = idempotente sin
-- depender del nombre de la restricción única.
insert into public.miembros_grupo (grupo_id, perfil_id)
select g.id, p.id
from public.grupos g
join public.perfiles p
  on (p.rol::text = 'captacion'
      or exists (select 1 from unnest(coalesce(p.roles_extra, '{}'::public.rol_usuario[])) r
                 where r::text = 'captacion'))
where g.clave = 'captacion'
  and not exists (select 1 from public.miembros_grupo m
                  where m.grupo_id = g.id and m.perfil_id = p.id);
