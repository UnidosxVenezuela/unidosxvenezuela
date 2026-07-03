-- ============================================================
-- 0082 — Lugares de las digitalizaciones (puntos del mapa) + moderación
-- ------------------------------------------------------------
-- Cada listado digitalizado se ancla a un LUGAR (hospital / albergue / centro de
-- acopio / otro), que aparece como punto en el mapa. Al guardar un listado:
--   · Si el lugar NO existe → se CREA automáticamente en estado
--     'pendiente_llenado' (un admin completa sus datos).
--   · Si el lugar EXISTE → se ASOCIA y, si ya estaba 'verificado', pasa a
--     'pendiente_verificar' (un admin valida que la data corresponde al lugar).
-- La resolución la hace resolver_lugar() (SECURITY DEFINER). Idempotente. Tras 0081.
-- ============================================================

create table if not exists public.lugares (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null default 'otro' check (tipo in ('hospital','albergue','acopio','otro')),
  nombre          text not null,
  nombre_norm     text,                       -- normalizado (sin acentos/espacios) para el match
  lat             double precision,
  lng             double precision,
  direccion       text,
  punto_acopio_id uuid references public.puntos_acopio (id) on delete set null,
  estado          text not null default 'pendiente_llenado' check (estado in ('pendiente_llenado','pendiente_verificar','verificado')),
  notas           text,
  creado_por      uuid references public.perfiles (id),
  verificado_por  uuid references public.perfiles (id),
  verificado_en   timestamptz,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists idx_lugares_match on public.lugares (tipo, nombre_norm);
create index if not exists idx_lugares_estado on public.lugares (estado);
create index if not exists idx_lugares_punto on public.lugares (punto_acopio_id) where punto_acopio_id is not null;

-- El listado apunta a su lugar.
alter table public.listados_digitalizados add column if not exists lugar_id uuid references public.lugares (id) on delete set null;
create index if not exists idx_listados_lugar on public.listados_digitalizados (lugar_id);

alter table public.lugares enable row level security;

-- Ver lugares: digitalización (y admin). Moderación (editar/borrar): solo admin.
drop policy if exists lugares_select on public.lugares;
create policy lugares_select on public.lugares for select to authenticated
  using (public.puede_digitalizar());
drop policy if exists lugares_insert on public.lugares;
create policy lugares_insert on public.lugares for insert to authenticated
  with check (public.puede_digitalizar());
drop policy if exists lugares_update on public.lugares;
create policy lugares_update on public.lugares for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
drop policy if exists lugares_delete on public.lugares;
create policy lugares_delete on public.lugares for delete to authenticated
  using (public.es_admin());

-- Normaliza un nombre para comparar (minúsculas, sin acentos ni símbolos).
create or replace function public.normalizar_nombre(p text)
returns text language sql immutable as $$
  select regexp_replace(translate(lower(coalesce(p, '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]', '', 'g');
$$;

-- Encuentra o crea el lugar de un listado; devuelve su id.
create or replace function public.resolver_lugar(
  p_tipo text, p_nombre text, p_lat double precision, p_lng double precision, p_punto_acopio_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_norm text;
begin
  if not public.puede_digitalizar() then
    raise exception 'No autorizado para registrar lugares.' using errcode = '42501';
  end if;
  if p_tipo not in ('hospital','albergue','acopio','otro') then p_tipo := 'otro'; end if;
  v_norm := public.normalizar_nombre(p_nombre);

  -- Buscar existente: por centro de acopio elegido, o por tipo + nombre normalizado.
  if p_punto_acopio_id is not null then
    select id into v_id from public.lugares where punto_acopio_id = p_punto_acopio_id limit 1;
  end if;
  if v_id is null and v_norm <> '' then
    select id into v_id from public.lugares where tipo = p_tipo and nombre_norm = v_norm limit 1;
  end if;

  if v_id is not null then
    -- Existe: asociar; si ya estaba verificado, vuelve a 'pendiente_verificar'.
    update public.lugares set
      estado = case when estado = 'verificado' then 'pendiente_verificar' else estado end,
      lat = coalesce(lat, p_lat), lng = coalesce(lng, p_lng),
      actualizado_en = now()
    where id = v_id;
    return v_id;
  end if;

  -- No existe: crear pendiente de llenado.
  insert into public.lugares (tipo, nombre, nombre_norm, lat, lng, punto_acopio_id, estado, creado_por)
    values (p_tipo, nullif(trim(p_nombre), ''), v_norm, p_lat, p_lng, p_punto_acopio_id, 'pendiente_llenado', auth.uid())
    returning id into v_id;
  return v_id;
end $$;
grant execute on function public.resolver_lugar(text, text, double precision, double precision, uuid) to authenticated;
