-- ============================================================
-- 0044 — Espacios de trabajo por rol (pre-hechos)
--
-- Un grupo dedicado por cada rol de recopilación/producción, con su pizarra,
-- tareas, chat y anuncios (reusa toda la infraestructura de grupos). Los
-- usuarios quedan AUTO-UNIDOS al espacio de su(s) rol(es) y se ajusta solo al
-- cambiar de rol. Idempotente.
-- ============================================================

-- Etiqueta del rol al que pertenece el espacio (null = grupo normal).
alter table public.grupos add column if not exists rol_objetivo public.rol_usuario;
create index if not exists idx_grupos_rol_objetivo on public.grupos (rol_objetivo) where rol_objetivo is not null;

-- Área que aloja los espacios de producción.
insert into public.areas (clave, nombre, descripcion) values
  ('comunicaciones', 'Comunicaciones y producción', 'Equipos de recopilación y producción de contenido')
on conflict (clave) do nothing;

-- Crea cada espacio si no existe (privado: solo lo ven sus miembros y coordinación).
insert into public.grupos (nombre, area, descripcion, rol_objetivo, abierto)
select v.nombre, 'comunicaciones', v.descripcion, v.rol::public.rol_usuario, false
from (values
  ('Recopilación de información', 'Espacio del equipo de recopilación: pizarra, tareas y enlaces a la mano.', 'recopilacion'),
  ('Redacción',          'Espacio del equipo de redacción.',        'redaccion'),
  ('Diseño Gráfico',     'Espacio del equipo de diseño gráfico.',   'diseno_grafico'),
  ('Edición de Videos',  'Espacio del equipo de edición de video.', 'edicion_video'),
  ('Redes Sociales',     'Espacio del equipo de redes sociales.',   'redes_sociales')
) as v(nombre, descripcion, rol)
where not exists (select 1 from public.grupos g where g.rol_objetivo = v.rol::public.rol_usuario);

-- Sincroniza la pertenencia de un perfil a los espacios según su conjunto de roles.
create or replace function public.sincronizar_espacios_perfil(p_perfil uuid)
returns void language plpgsql security definer set search_path = public as $$
declare roles public.rol_usuario[];
begin
  select array[rol] || coalesce(roles_extra, '{}'::public.rol_usuario[]) into roles
  from public.perfiles where id = p_perfil;
  if roles is null then return; end if;

  -- Unir a los espacios de los roles que tiene (tolerante a triggers de veto).
  begin
    insert into public.miembros_grupo (grupo_id, perfil_id, rol_en_grupo)
      select g.id, p_perfil, 'miembro' from public.grupos g
      where g.rol_objetivo is not null and g.rol_objetivo = any(roles)
    on conflict (grupo_id, perfil_id) do nothing;
  exception when others then null;
  end;

  -- Quitar de los espacios cuyo rol ya no tiene.
  delete from public.miembros_grupo m using public.grupos g
    where m.grupo_id = g.id and m.perfil_id = p_perfil
      and g.rol_objetivo is not null and not (g.rol_objetivo = any(roles));
end; $$;

create or replace function public.trg_sincronizar_espacios()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sincronizar_espacios_perfil(new.id);
  return new;
end; $$;

drop trigger if exists trg_espacios_perfil on public.perfiles;
create trigger trg_espacios_perfil
  after insert or update of rol, roles_extra on public.perfiles
  for each row execute function public.trg_sincronizar_espacios();

-- Backfill: sincroniza a todos los perfiles existentes.
do $$ declare r record; begin
  for r in select id from public.perfiles loop
    perform public.sincronizar_espacios_perfil(r.id);
  end loop;
end $$;
