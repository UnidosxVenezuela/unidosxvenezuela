-- ============================================================
-- 0071 — Solicitudes de traspaso entre centros
-- ------------------------------------------------------------
-- Un líder puede SOLICITAR productos de otro centro (sin tocar su inventario).
-- El líder del centro solicitado (origen) APRUEBA (se ejecuta el traspaso) o
-- RECHAZA. Quien solicita puede CANCELAR mientras esté pendiente.
-- Idempotente. Reusa traspasar_stock (0069) para mover el stock con registro.
-- ============================================================

create table if not exists public.solicitudes_traspaso (
  id             uuid primary key default gen_random_uuid(),
  origen_id      uuid not null references public.puntos_acopio (id) on delete cascade,  -- a quién se le pide
  destino_id     uuid not null references public.puntos_acopio (id) on delete cascade,  -- quién pide (recibe)
  producto       text not null,
  cantidad       numeric not null check (cantidad > 0),
  nota           text,
  estado         text not null default 'pendiente'
                   check (estado in ('pendiente','aprobada','rechazada','cancelada')),
  solicitante_id uuid references public.perfiles (id),
  resuelto_por   uuid references public.perfiles (id),
  creado_en      timestamptz not null default now(),
  resuelto_en    timestamptz
);
create index if not exists idx_soltras_origen  on public.solicitudes_traspaso (origen_id, estado);
create index if not exists idx_soltras_destino on public.solicitudes_traspaso (destino_id, estado);

alter table public.solicitudes_traspaso enable row level security;
-- Ver: los líderes del origen o del destino.
drop policy if exists soltras_select on public.solicitudes_traspaso;
create policy soltras_select on public.solicitudes_traspaso for select to authenticated
  using (public.puede_gestionar_acopio(origen_id) or public.puede_gestionar_acopio(destino_id));
-- Crear: el solicitante lidera el DESTINO (recibe), origen ≠ destino, a nombre propio.
drop policy if exists soltras_insert on public.solicitudes_traspaso;
create policy soltras_insert on public.solicitudes_traspaso for insert to authenticated
  with check (public.puede_gestionar_acopio(destino_id) and origen_id <> destino_id and solicitante_id = auth.uid());
-- Actualizar estado: líderes de origen (aprobar/rechazar) o destino (cancelar). Vía RPC.
drop policy if exists soltras_update on public.solicitudes_traspaso;
create policy soltras_update on public.solicitudes_traspaso for update to authenticated
  using (public.puede_gestionar_acopio(origen_id) or public.puede_gestionar_acopio(destino_id))
  with check (public.puede_gestionar_acopio(origen_id) or public.puede_gestionar_acopio(destino_id));

-- ── Aprobar: ejecuta el traspaso (origen → destino) y marca aprobada. Solo origen. ──
create or replace function public.aprobar_solicitud_traspaso(p_solicitud uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s record;
begin
  select * into s from public.solicitudes_traspaso where id = p_solicitud for update;
  if s.id is null then raise exception 'Solicitud no encontrada.'; end if;
  if s.estado <> 'pendiente' then raise exception 'La solicitud ya fue resuelta.'; end if;
  if not public.puede_gestionar_acopio(s.origen_id) then
    raise exception 'Solo el líder del centro solicitado puede aprobar.' using errcode = '42501';
  end if;
  perform public.traspasar_stock(s.origen_id, s.destino_id, s.producto, s.cantidad,
    'Solicitud aprobada' || case when s.nota is not null and btrim(s.nota) <> '' then ': ' || s.nota else '' end);
  update public.solicitudes_traspaso
     set estado = 'aprobada', resuelto_por = auth.uid(), resuelto_en = now()
   where id = p_solicitud;
end; $$;
grant execute on function public.aprobar_solicitud_traspaso(uuid) to authenticated;

-- ── Rechazar (origen) o cancelar (destino/solicitante). ──
create or replace function public.resolver_solicitud_traspaso(p_solicitud uuid, p_estado text)
returns void language plpgsql security definer set search_path = public as $$
declare s record; v_estado text := case when p_estado = 'cancelada' then 'cancelada' else 'rechazada' end;
begin
  select * into s from public.solicitudes_traspaso where id = p_solicitud for update;
  if s.id is null then raise exception 'Solicitud no encontrada.'; end if;
  if s.estado <> 'pendiente' then raise exception 'La solicitud ya fue resuelta.'; end if;
  if v_estado = 'cancelada' then
    if not public.puede_gestionar_acopio(s.destino_id) then
      raise exception 'Solo quien solicita puede cancelar.' using errcode = '42501'; end if;
  else
    if not public.puede_gestionar_acopio(s.origen_id) then
      raise exception 'Solo el líder del centro solicitado puede rechazar.' using errcode = '42501'; end if;
  end if;
  update public.solicitudes_traspaso
     set estado = v_estado, resuelto_por = auth.uid(), resuelto_en = now()
   where id = p_solicitud;
end; $$;
grant execute on function public.resolver_solicitud_traspaso(uuid, text) to authenticated;

-- ── Notificaciones: al origen cuando llega la solicitud; al solicitante al resolverse. ──
create or replace function public.notificar_solicitud_traspaso()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_origen text; v_destino text;
begin
  if tg_op = 'INSERT' then
    select nombre into v_destino from public.puntos_acopio where id = new.destino_id;
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
      select pa.creado_por, 'acopio_solicitud', 'Solicitud de traspaso',
             coalesce(v_destino, 'Un centro') || ' solicita ' || new.cantidad || ' de ' || new.producto,
             '/acopio/' || new.origen_id
        from public.puntos_acopio pa where pa.id = new.origen_id and pa.creado_por is not null
      union
      select ar.perfil_id, 'acopio_solicitud', 'Solicitud de traspaso',
             coalesce(v_destino, 'Un centro') || ' solicita ' || new.cantidad || ' de ' || new.producto,
             '/acopio/' || new.origen_id
        from public.acopio_responsables ar where ar.punto_id = new.origen_id;
    return new;
  elsif tg_op = 'UPDATE' and new.estado is distinct from old.estado and new.estado in ('aprobada', 'rechazada') then
    select nombre into v_origen from public.puntos_acopio where id = new.origen_id;
    if new.solicitante_id is not null then
      insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
      values (new.solicitante_id, 'acopio_solicitud',
        case when new.estado = 'aprobada' then 'Solicitud aprobada' else 'Solicitud rechazada' end,
        coalesce(v_origen, 'El centro') || ' · ' || new.producto || ' x' || new.cantidad,
        '/acopio/' || new.destino_id);
    end if;
    return new;
  end if;
  return new;
end; $$;

drop trigger if exists trg_solicitud_traspaso on public.solicitudes_traspaso;
create trigger trg_solicitud_traspaso
  after insert or update on public.solicitudes_traspaso
  for each row execute function public.notificar_solicitud_traspaso();

do $$ begin alter publication supabase_realtime add table public.solicitudes_traspaso; exception when duplicate_object then null; end $$;
