-- ============================================================
-- 0051 — Solicitudes de acceso (a grupos privados o a secciones/roles)
-- ============================================================
-- Un usuario verificado (p. ej. voluntario) puede SOLICITAR unirse a un grupo
-- privado o acceder a una sección/rol (Logística, Verificación, producción…).
-- Resuelven: el LÍDER del grupo o la coordinación/admin (para grupos); la
-- coordinación/admin (para roles). La aprobación agrega la membresía o el rol
-- mediante una función SECURITY DEFINER. Avisa al solicitante. Idempotente.
-- ============================================================

create table if not exists public.solicitudes_acceso (
  id           uuid primary key default gen_random_uuid(),
  perfil_id    uuid not null references public.perfiles (id) on delete cascade,
  tipo         text not null check (tipo in ('grupo','rol')),
  grupo_id     uuid references public.grupos (id) on delete cascade,
  rol          public.rol_usuario,
  mensaje      text,
  estado       text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  resuelta_por uuid references public.perfiles (id) on delete set null,
  creado_en    timestamptz not null default now(),
  resuelta_en  timestamptz,
  check ((tipo = 'grupo' and grupo_id is not null) or (tipo = 'rol' and rol is not null))
);
-- Una sola solicitud PENDIENTE por objetivo.
create unique index if not exists uq_solacc_grupo on public.solicitudes_acceso (perfil_id, grupo_id) where estado = 'pendiente' and tipo = 'grupo';
create unique index if not exists uq_solacc_rol   on public.solicitudes_acceso (perfil_id, rol)      where estado = 'pendiente' and tipo = 'rol';

alter table public.solicitudes_acceso enable row level security;

-- Roles que se pueden solicitar (nunca mandos, superadmin ni aliado).
create or replace function public.rol_solicitable(r public.rol_usuario)
returns boolean language sql immutable as $$
  select r in ('logistica','verificador','recopilacion','redaccion','diseno_grafico','edicion_video','redes_sociales','voluntario');
$$;

-- ¿Puede el usuario actual resolver esta solicitud?
create or replace function public.puede_resolver_acceso(p_tipo text, p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_coordinacion()
      or (p_tipo = 'grupo' and exists (select 1 from public.grupos g where g.id = p_grupo and g.lider_id = auth.uid()));
$$;

-- RLS: el solicitante ve/crea/cancela las suyas; los aprobadores ven las que les tocan.
drop policy if exists "solacc_lectura" on public.solicitudes_acceso;
create policy "solacc_lectura" on public.solicitudes_acceso for select to authenticated
  using (perfil_id = auth.uid() or public.puede_resolver_acceso(tipo, grupo_id));

drop policy if exists "solacc_insert" on public.solicitudes_acceso;
create policy "solacc_insert" on public.solicitudes_acceso for insert to authenticated
  with check (
    perfil_id = auth.uid() and public.es_verificado() and estado = 'pendiente'
    and ((tipo = 'grupo' and grupo_id is not null)
      or (tipo = 'rol' and rol is not null and public.rol_solicitable(rol)))
  );

drop policy if exists "solacc_delete" on public.solicitudes_acceso;
create policy "solacc_delete" on public.solicitudes_acceso for delete to authenticated
  using (perfil_id = auth.uid() and estado = 'pendiente');
-- La resolución (aprobar/rechazar) va SOLO por la función de abajo.

-- Grupos privados que el usuario puede SOLICITAR (solo id/nombre/área; no expone contenido).
create or replace function public.grupos_solicitables()
returns table (id uuid, nombre text, area public.area_clave)
language sql stable security definer set search_path = public as $$
  select g.id, g.nombre, g.area
  from public.grupos g
  where g.abierto = false
    and not public.es_miembro_de(g.id)
    and g.lider_id is distinct from auth.uid()
    and not exists (select 1 from public.miembros_baneados b where b.grupo_id = g.id and b.perfil_id = auth.uid())
  order by g.nombre;
$$;
grant execute on function public.grupos_solicitables() to authenticated;

-- Resolver una solicitud. Al aprobar: agrega la membresía o el rol.
create or replace function public.resolver_solicitud_acceso(p_solicitud uuid, p_aprobar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare s public.solicitudes_acceso;
begin
  select * into s from public.solicitudes_acceso where id = p_solicitud;
  if not found then raise exception 'Solicitud no encontrada.'; end if;
  if s.estado <> 'pendiente' then raise exception 'Esa solicitud ya fue resuelta.'; end if;
  if not public.puede_resolver_acceso(s.tipo, s.grupo_id) then
    raise exception 'No tienes permiso para resolver esta solicitud.' using errcode = '42501';
  end if;

  if p_aprobar then
    if s.tipo = 'grupo' then
      insert into public.miembros_grupo (grupo_id, perfil_id) values (s.grupo_id, s.perfil_id) on conflict do nothing;
    else
      if not public.rol_solicitable(s.rol) then raise exception 'Ese rol no se puede otorgar así.'; end if;
      perform set_config('app.roles_contenido_ok', '1', true);
      update public.perfiles
        set roles_extra = (select array(select distinct x from unnest(coalesce(roles_extra,'{}'::public.rol_usuario[]) || array[s.rol]) x))
        where id = s.perfil_id and rol <> s.rol and not (s.rol = any(coalesce(roles_extra,'{}'::public.rol_usuario[])));
      perform set_config('app.roles_contenido_ok', '', true);
    end if;
  end if;

  update public.solicitudes_acceso
    set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
        resuelta_por = auth.uid(), resuelta_en = now()
    where id = p_solicitud;

  -- Avisar al solicitante.
  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  values (
    s.perfil_id, 'acceso',
    case when p_aprobar then 'Solicitud aprobada' else 'Solicitud rechazada' end,
    (case when s.tipo = 'grupo' then 'Tu solicitud de acceso a un grupo' else 'Tu solicitud de acceso a una sección' end)
      || (case when p_aprobar then ' fue aprobada.' else ' fue rechazada.' end),
    case when s.tipo = 'grupo' then '/grupos/' || s.grupo_id else '/acceso' end
  );
end $$;
grant execute on function public.resolver_solicitud_acceso(uuid, boolean) to authenticated;

do $$ begin alter publication supabase_realtime add table public.solicitudes_acceso; exception when duplicate_object then null; end $$;
