-- ============================================================
-- 0089 — Alta de usuarios delegada (líder directo · coordinador con confirmación)
-- ------------------------------------------------------------
-- Los líderes y coordinadores pueden dar de alta usuarios del ROL de su grupo (el
-- que supervisan), como los admin. La diferencia:
--   · Líder (o admin): crea la cuenta DIRECTO (lo hace la Server Action con la
--     API de administración; aquí solo viven los permisos de la solicitud).
--   · Coordinador: crea una SOLICITUD pendiente; el LÍDER de su grupo la confirma
--     (aprueba → se crea la cuenta) o la rechaza. Así no quedan cuentas huérfanas.
-- El rol a otorgar SIEMPRE es el del grupo (rol_de_grupo(clave)); un coordinador no
-- puede pedir un rol arbitrario. Solo aplica a grupos de sistema (con rol funcional).
-- Idempotente. Ejecutar tras 0088.
-- ============================================================

-- ── 1) Helpers de relación con un grupo ──
create or replace function public.es_lider_de_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.grupos g where g.id = p_grupo and g.lider_id = auth.uid());
$$;
grant execute on function public.es_lider_de_grupo(uuid) to authenticated;

create or replace function public.es_coordinador_de_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.miembros_grupo m
    where m.grupo_id = p_grupo and m.perfil_id = auth.uid() and m.rol_en_grupo = 'coordinador'
  );
$$;
grant execute on function public.es_coordinador_de_grupo(uuid) to authenticated;

-- ── 2) Tabla de solicitudes de alta ──
create table if not exists public.solicitudes_alta_usuario (
  id             uuid primary key default gen_random_uuid(),
  grupo_id       uuid not null references public.grupos (id) on delete cascade,
  rol            public.rol_usuario not null,          -- lo fija el trigger = rol del grupo
  nombre_completo text not null,
  whatsapp       text,
  email          text,
  organizacion   text,
  motivo         text,                                 -- nota del coordinador
  solicitado_por uuid references public.perfiles (id) on delete set null,
  estado         text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  resuelto_por   uuid references public.perfiles (id) on delete set null,
  resuelto_en    timestamptz,
  motivo_rechazo text,
  perfil_creado  uuid references public.perfiles (id) on delete set null,
  creado_en      timestamptz not null default now()
);
create index if not exists idx_solicitudes_alta_grupo on public.solicitudes_alta_usuario (grupo_id, estado, creado_en desc);
create index if not exists idx_solicitudes_alta_solicitante on public.solicitudes_alta_usuario (solicitado_por);

-- Fija el rol al del grupo (solo grupos de sistema con rol funcional).
create or replace function public.solicitud_alta_fijar_rol()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rol public.rol_usuario;
begin
  v_rol := public.rol_de_grupo((select clave from public.grupos where id = new.grupo_id));
  if v_rol is null then
    raise exception 'Ese grupo no otorga un rol asignable por delegación.' using errcode = '42501';
  end if;
  new.rol := v_rol;
  return new;
end $$;
drop trigger if exists trg_solicitud_alta_rol on public.solicitudes_alta_usuario;
create trigger trg_solicitud_alta_rol before insert on public.solicitudes_alta_usuario
  for each row execute function public.solicitud_alta_fijar_rol();

alter table public.solicitudes_alta_usuario enable row level security;

-- INSERT: admin, o el coordinador del grupo (registrando su propia solicitud, pendiente).
drop policy if exists "solicitud_alta_insert" on public.solicitudes_alta_usuario;
create policy "solicitud_alta_insert" on public.solicitudes_alta_usuario for insert to authenticated
  with check (
    solicitado_por = auth.uid() and estado = 'pendiente'
    and (public.es_admin() or public.es_coordinador_de_grupo(grupo_id))
  );

-- SELECT: el solicitante, el líder del grupo, o admin.
drop policy if exists "solicitud_alta_select" on public.solicitudes_alta_usuario;
create policy "solicitud_alta_select" on public.solicitudes_alta_usuario for select to authenticated
  using (public.es_admin() or solicitado_por = auth.uid() or public.es_lider_de_grupo(grupo_id));

-- UPDATE (resolver): el líder del grupo o admin. (La creación de la cuenta la hace
-- la Server Action con service_role; esto blinda el estado ante escrituras directas.)
drop policy if exists "solicitud_alta_update" on public.solicitudes_alta_usuario;
create policy "solicitud_alta_update" on public.solicitudes_alta_usuario for update to authenticated
  using (public.es_admin() or public.es_lider_de_grupo(grupo_id))
  with check (public.es_admin() or public.es_lider_de_grupo(grupo_id));

-- DELETE: el líder del grupo o admin.
drop policy if exists "solicitud_alta_delete" on public.solicitudes_alta_usuario;
create policy "solicitud_alta_delete" on public.solicitudes_alta_usuario for delete to authenticated
  using (public.es_admin() or public.es_lider_de_grupo(grupo_id));

-- ── 3) Aviso al líder cuando entra una solicitud ──
create or replace function public.notificar_solicitud_alta()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lider uuid; v_grupo text;
begin
  select lider_id, nombre into v_lider, v_grupo from public.grupos where id = new.grupo_id;
  if v_lider is not null then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    values (v_lider, 'solicitud_alta', 'Alta de usuario por confirmar',
            'Se propuso agregar a ' || coalesce(new.nombre_completo, 'un usuario') ||
            ' al grupo «' || coalesce(v_grupo, '') || '». Revísalo y confírmalo.',
            '/grupos/' || new.grupo_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_notificar_solicitud_alta on public.solicitudes_alta_usuario;
create trigger trg_notificar_solicitud_alta after insert on public.solicitudes_alta_usuario
  for each row execute function public.notificar_solicitud_alta();

-- ── 4) Auditoría ──
drop trigger if exists aud_solicitudes_alta on public.solicitudes_alta_usuario;
create trigger aud_solicitudes_alta after insert or update or delete on public.solicitudes_alta_usuario
  for each row execute function public.auditar_cambio();
