-- ============================================================
-- 0150 — Grupo privado de Administradores
-- ------------------------------------------------------------
-- Crea un grupo PRIVADO (abierto=false) para la coordinación general. Por el modelo
-- de visibilidad (0029), un grupo privado solo lo ven la administración (es_coordinacion),
-- sus miembros y su líder; NO aparece para el resto. El alta de miembros es por
-- invitación (líder/administración), así que desde la página del grupo el líder puede
-- ir agregando a otros administradores.
--
-- Deja como LÍDER + miembro al usuario indicado por correo, para que administre el grupo
-- y sume a los demás admins. Si el correo aún no existe como perfil, el grupo se crea sin
-- líder (cualquier admin puede entrar y asignarlo). Idempotente.
--
-- Nota: la clave 'administracion' NO está en rol_de_grupo() (0055), así que unirse a este
-- grupo NO cambia el rol de nadie (los miembros ya son admins). Ejecutar tras 0149.
-- ============================================================

-- 1) El grupo (clave estable + privado).
insert into public.grupos (nombre, area, clave, abierto, descripcion)
values (
  'Administradores',
  'gestion_informacion',
  'administracion',
  false,
  'Grupo privado de coordinación de la administración. Solo lo ven sus miembros y la administración.'
)
on conflict (clave) do update
  set nombre = excluded.nombre,
      abierto = false,
      descripcion = excluded.descripcion;

-- 2) Líder + primer miembro: el usuario indicado (por correo).
do $$
declare v_grupo uuid; v_user uuid;
begin
  select id into v_grupo from public.grupos where clave = 'administracion';

  select p.id into v_user
    from public.perfiles p
    join auth.users u on u.id = p.id
    where lower(u.email) = lower('leonardoaleman536@gmail.com')
    limit 1;

  if v_user is null then
    raise notice '0150: no se encontró el perfil de leonardoaleman536@gmail.com; el grupo «Administradores» quedó creado SIN líder. Asígnalo desde la app (Grupos → Administradores).';
    return;
  end if;

  -- Líder del grupo (solo si aún no tiene uno, para no pisar cambios manuales).
  update public.grupos set lider_id = v_user where id = v_grupo and lider_id is null;

  -- Miembro con rol de líder dentro del grupo (idempotente).
  insert into public.miembros_grupo (grupo_id, perfil_id, rol_en_grupo)
  values (v_grupo, v_user, 'lider')
  on conflict (grupo_id, perfil_id) do update set rol_en_grupo = 'lider';

  raise notice '0150: grupo «Administradores» listo; % es líder y miembro.', v_user;
end $$;
