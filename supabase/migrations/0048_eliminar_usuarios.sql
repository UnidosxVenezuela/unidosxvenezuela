-- ============================================================
-- 0048 — Poder eliminar usuarios sin perder su trabajo
-- ============================================================
-- Al borrar una cuenta (auth.users → cascada a perfiles), varias llaves foráneas
-- NOT NULL / NO ACTION hacia perfiles IMPEDÍAN el borrado (tareas, casos,
-- contenido, comentarios, anuncios que la persona creó). Aquí las pasamos a
-- ON DELETE SET NULL: al eliminar a alguien, sus registros SE CONSERVAN con el
-- autor/creador en null ("usuario eliminado"), sin romper la información.
--
-- También completamos el enum de auditoría con las acciones que la app ya usa
-- (estaban ausentes y por eso esos registros no se guardaban).
-- Idempotente.
-- ============================================================

-- Acciones de auditoría que la app usa (faltaban en el enum).
alter type public.accion_auditoria add value if not exists 'crear_usuario';
alter type public.accion_auditoria add value if not exists 'reset_contrasena';
alter type public.accion_auditoria add value if not exists 'cambio_roles_extra';
alter type public.accion_auditoria add value if not exists 'eliminar_usuario';

-- Helper: reapunta la FK de (tabla.columna) → perfiles con la acción deseada.
-- Localiza el nombre real de la FK (no asume el nombre) y la recrea. Para
-- 'set null' quita antes el NOT NULL de la columna.
create or replace function public._reapuntar_fk_perfil(p_tabla text, p_col text, p_accion text)
returns void language plpgsql as $$
declare cname text;
begin
  if p_accion = 'set null' then
    execute format('alter table public.%I alter column %I drop not null', p_tabla, p_col);
  end if;
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  join pg_class fref on fref.oid = con.confrelid
  where con.contype = 'f' and ns.nspname = 'public'
    and rel.relname = p_tabla and fref.relname = 'perfiles'
    and (select attname from pg_attribute where attrelid = con.conrelid and attnum = con.conkey[1]) = p_col
  limit 1;
  if cname is not null then
    execute format('alter table public.%I drop constraint %I', p_tabla, cname);
  end if;
  execute format(
    'alter table public.%I add constraint %I foreign key (%I) references public.perfiles(id) on delete %s',
    p_tabla, p_tabla || '_' || p_col || '_fkey', p_col, p_accion);
end $$;

-- Autoría/creación: conservar el registro y dejar el autor en null.
select public._reapuntar_fk_perfil('tareas',                 'creado_por',      'set null');
select public._reapuntar_fk_perfil('comentarios_tarea',      'autor_id',        'set null');
select public._reapuntar_fk_perfil('publicaciones',          'autor_id',        'set null');
select public._reapuntar_fk_perfil('comentarios_publicacion','autor_id',        'set null');
select public._reapuntar_fk_perfil('mensajes_fijados',       'autor_id',        'set null');
select public._reapuntar_fk_perfil('registro_auditoria',     'actor_id',        'set null');
select public._reapuntar_fk_perfil('pizarra_grupo',          'actualizado_por', 'set null');
select public._reapuntar_fk_perfil('casos',                  'creado_por',      'set null');
select public._reapuntar_fk_perfil('casos',                  'asignado_a',      'set null');
select public._reapuntar_fk_perfil('piezas_contenido',       'creado_por',      'set null');
select public._reapuntar_fk_perfil('piezas_contenido',       'asignado_a',      'set null');
select public._reapuntar_fk_perfil('miembros_baneados',      'baneado_por',     'set null');

-- Aprobaciones de aliado: si se elimina al admin que aprobó, se quita su
-- aprobación (la solicitud sigue, con menos aprobaciones).
select public._reapuntar_fk_perfil('aprobaciones_aliado',    'admin_id',        'cascade');

drop function public._reapuntar_fk_perfil(text, text, text);
