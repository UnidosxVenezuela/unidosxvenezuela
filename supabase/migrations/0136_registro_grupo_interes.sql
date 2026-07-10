-- ============================================================
-- 0136 — Registro por grupo específico (además del área)
-- ------------------------------------------------------------
-- Antes, al registrarse la persona elegía un ÁREA amplia (verificacion/redes/…).
-- Ahora elige el GRUPO concreto al que desea postular, para que sepa exactamente
-- dónde colabora y el admin sepa dónde ubicarla. Se guarda esa preferencia en
-- `perfiles.grupo_interes` (clave del grupo). Es SOLO informativa: el acceso lo
-- sigue concediendo el admin al aprobar (rol/verificado por default siguen seguros),
-- y los grupos con 2ª verificación (Búsqueda, NNA, etc.) mantienen su compuerta.
-- `area_registro` se sigue guardando (derivada del área del grupo en el cliente) para
-- que el RUTEO del aviso a los admins de área no cambie. Idempotente. Tras 0135.
-- ============================================================

-- 1) Columna nueva: grupo elegido en el registro (referencia suave a grupos.clave).
alter table public.perfiles add column if not exists grupo_interes text;
comment on column public.perfiles.grupo_interes is
  'Clave del grupo al que la persona desea postular (elegido en el registro). Informativo: el acceso lo concede el admin al aprobar; area_registro se deriva de su área.';

-- 2) handle_new_user: además guarda grupo_interes, VALIDADO contra un grupo existente
--    (si el cliente manda algo que no es una clave de grupo real, queda NULL). Rebase
--    de 0124 — el resto del cuerpo (area_registro con lista blanca, pais, etc.) NO cambia.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre_completo, telefono, organizacion, motivo, area_registro, pais, grupo_interes)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre_completo', ''),
    coalesce(new.raw_user_meta_data ->> 'telefono', new.phone),
    new.raw_user_meta_data ->> 'organizacion',
    new.raw_user_meta_data ->> 'motivo',
    case when (new.raw_user_meta_data ->> 'area_registro') in ('verificacion','redes','logistica','digitalizacion','general')
         then new.raw_user_meta_data ->> 'area_registro' else null end,
    nullif(btrim(new.raw_user_meta_data ->> 'pais'), ''),
    -- solo se guarda si es la clave de un grupo existente (informativo; el acceso lo concede el admin)
    (select g.clave from public.grupos g where g.clave = new.raw_user_meta_data ->> 'grupo_interes')
  );
  return new;
end; $$;

-- 3) notificar_registro: el aviso al admin muestra el GRUPO concreto solicitado (si lo
--    hay); si no, cae al sufijo por área como antes. El RUTEO (WHERE) NO cambia: sigue
--    yendo al admin general/superadmin y al admin del área correspondiente. Rebase de 0124.
create or replace function public.notificar_registro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.verificado = false then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select p.id, 'registro_nuevo',
           'Nueva solicitud de acceso',
           coalesce(nullif(new.nombre_completo, ''), 'Alguien') || ' espera verificación'
             || coalesce(
                  ' · Grupo: ' || (select g.nombre from public.grupos g where g.clave = new.grupo_interes) || '.',
                  case new.area_registro
                    when 'verificacion'   then ' · Área Verificaciones.'
                    when 'redes'          then ' · Área Redes Sociales.'
                    when 'logistica'      then ' · Área Logística y Acopio.'
                    when 'digitalizacion' then ' · Área Digitalización.'
                    else '.' end),
           '/admin/usuarios'
    from public.perfiles p
    where p.rol = 'admin'
       or p.super_admin
       or 'admin' = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[]))
       or (new.area_registro = 'verificacion'   and public.perfil_tiene_rol(p.id, 'admin_verificacion'))
       or (new.area_registro = 'redes'          and public.perfil_tiene_rol(p.id, 'admin_redes'))
       or (new.area_registro = 'logistica'      and public.perfil_tiene_rol(p.id, 'admin_logistica'))
       or (new.area_registro = 'digitalizacion' and public.perfil_tiene_rol(p.id, 'admin_digitalizacion'));
  end if;
  return new;
end; $$;
