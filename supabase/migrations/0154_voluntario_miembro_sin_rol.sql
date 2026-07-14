-- ============================================================
-- 0154 — «Voluntario» = miembro sin rol: no hereda el rol del grupo al unirse
-- ------------------------------------------------------------
-- Hoy la membresía SINCRONIZA el rol del grupo (agregar a «Gestión de casos» vuelve
-- recopilador, etc. — trigger sincronizar_rol_grupo, 0055/0059). El equipo quiere un tramo
-- de «voluntario» (miembro de campo): un voluntario puede ser MIEMBRO del grupo —lo ve y
-- participa como miembro— SIN recibir el rol operativo, así NO entra a las secciones donde
-- se cargan solicitudes/donaciones. Para operar, se le asigna el rol a mano (Admin →
-- Usuarios) y el trigger inverso (sincronizar_grupo_por_rol) lo re-sincroniza.
--
-- Solo el rol PRINCIPAL 'voluntario' es la excepción; para los demás roles, agregar a un
-- grupo sigue otorgando el rol (comportamiento actual). Aplica a TODOS los grupos.
--
-- Se recrea sincronizar_rol_grupo (base 0059) agregando la guarda en INSERT. En DELETE no
-- hay rol que revocar para un voluntario, así que no se toca esa rama. Idempotente
-- (create or replace; el trigger trg_sincronizar_rol_grupo ya existe). Ejecutar tras 0153.
-- ============================================================

create or replace function public.sincronizar_rol_grupo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_clave text; v_rol public.rol_usuario; v_fila record;
begin
  if coalesce(current_setting('app.sync_en_curso', true), '') = '1' then
    return coalesce(new, old);
  end if;
  v_fila := coalesce(new, old);
  select clave into v_clave from public.grupos where id = v_fila.grupo_id;
  v_rol := public.rol_de_grupo(v_clave);
  if v_rol is null then return v_fila; end if;

  -- VOLUNTARIO («miembro de campo»): al UNIRSE a un grupo NO hereda el rol operativo del
  -- grupo; queda solo como miembro. Para que opere (crear solicitudes, donaciones, etc.) se
  -- le asigna el rol a mano. Solo aplica en INSERT (en DELETE no hay rol que revocar).
  if tg_op = 'INSERT' and exists (
       select 1 from public.perfiles p where p.id = v_fila.perfil_id and p.rol::text = 'voluntario') then
    return v_fila;
  end if;

  perform set_config('app.sync_en_curso', '1', true);
  perform set_config('app.roles_contenido_ok', '1', true);
  if tg_op = 'INSERT' then
    update public.perfiles
      set roles_extra = (select array(select distinct x from unnest(coalesce(roles_extra,'{}'::public.rol_usuario[]) || array[v_rol]) x))
      where id = v_fila.perfil_id and rol <> v_rol;
  else
    update public.perfiles
      set roles_extra = (select coalesce(array(select x from unnest(coalesce(roles_extra,'{}'::public.rol_usuario[])) x where x <> v_rol), '{}'::public.rol_usuario[]))
      where id = v_fila.perfil_id;
  end if;
  perform set_config('app.roles_contenido_ok', '', true);
  perform set_config('app.sync_en_curso', '', true);
  return v_fila;
end $$;
