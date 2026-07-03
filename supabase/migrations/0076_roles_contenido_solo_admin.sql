-- ============================================================
-- 0076 — Los roles de contenido solo los asigna administración
-- ============================================================
-- Antes (0046) un líder de grupo podía asignar roles de la cadena de contenido
-- a voluntarios o a sí mismo. Por decisión operativa, esto queda EN MANOS DE
-- ADMINISTRACIÓN únicamente (ni líderes ni coordinadores). Redefine la función
-- exigiendo es_coordinacion() (= admin desde 0055). Idempotente.
-- ============================================================
create or replace function public.asignar_roles_contenido(p_perfil uuid, p_roles public.rol_usuario[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_contenido public.rol_usuario[];
  v_preservar public.rol_usuario[];
begin
  if auth.uid() is null then raise exception 'No autenticado.' using errcode = '42501'; end if;

  -- Solo administración asigna roles de contenido (ni líderes ni coordinadores).
  if not public.es_coordinacion() then
    raise exception 'Solo administración puede asignar roles de contenido.' using errcode = '42501';
  end if;

  -- Entrada: solo roles de la cadena de contenido, sin duplicados.
  select coalesce(array_agg(distinct x order by x), '{}'::public.rol_usuario[]) into v_contenido
  from unnest(coalesce(p_roles, '{}'::public.rol_usuario[])) as x
  where public.es_rol_cadena_contenido(x);

  -- Preserva los roles adicionales que NO son de contenido.
  select coalesce(array_agg(x order by x), '{}'::public.rol_usuario[]) into v_preservar
  from unnest((select coalesce(roles_extra, '{}'::public.rol_usuario[]) from public.perfiles where id = p_perfil)) as x
  where not public.es_rol_cadena_contenido(x);

  perform set_config('app.roles_contenido_ok', '1', true);   -- habilita el trigger
  update public.perfiles set roles_extra = v_preservar || v_contenido where id = p_perfil;
  perform set_config('app.roles_contenido_ok', '', true);    -- revoca de inmediato
end; $$;
