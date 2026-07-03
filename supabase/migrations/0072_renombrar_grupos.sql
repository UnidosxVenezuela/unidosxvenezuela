-- ============================================================
-- 0072 — Renombrar grupos: «Envío a Redacción» y «Community Manager»
-- ------------------------------------------------------------
-- Solo cambia el NOMBRE visible de los grupos (los identificadores de sistema
-- `clave` y los valores del enum de roles NO cambian, para no romper permisos).
--   · redaccion       → «Envío a Redacción»
--   · redes_sociales  → «Community Manager»
-- Antes de renombrar, consolida el grupo legado 'envio_redaccion' (0055, cuyo
-- ROL ya se fusionó en 'redaccion' en 0059) dentro de 'redaccion', para no dejar
-- dos grupos llamados «Envío a Redacción». Idempotente.
-- ============================================================

-- Consolidar el grupo legado 'envio_redaccion' en 'redaccion' (si quedó).
do $$
declare v_envio uuid; v_red uuid;
begin
  select id into v_envio from public.grupos where clave = 'envio_redaccion';
  select id into v_red   from public.grupos where clave = 'redaccion';
  if v_envio is not null and v_red is not null then
    -- Mueve los miembros del grupo legado al grupo de redacción y elimínalo.
    insert into public.miembros_grupo (grupo_id, perfil_id)
      select v_red, perfil_id from public.miembros_grupo where grupo_id = v_envio
      on conflict do nothing;
    delete from public.grupos where id = v_envio;
  elsif v_envio is not null and v_red is null then
    -- Si solo existe el legado, reutilízalo como el grupo de redacción.
    update public.grupos set clave = 'redaccion' where id = v_envio;
  end if;
end $$;

update public.grupos set nombre = 'Envío a Redacción' where clave = 'redaccion';
update public.grupos set nombre = 'Community Manager'  where clave = 'redes_sociales';
