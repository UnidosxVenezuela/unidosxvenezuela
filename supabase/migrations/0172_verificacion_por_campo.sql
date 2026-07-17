-- ============================================================
-- 0172 — Verificación por campo (semáforo 🟢🟡🔴 por dato de la solicitud)
-- ------------------------------------------------------------
-- El equipo de Verificación marca CADA dato de una solicitud con su estado:
--   sin_revisar · verificado (🟢) · requiere_info (🟡) · falso (🔴)
-- Así queda claro qué está confirmado y qué falta, sin depender de un único
-- veredicto global. (Requerimiento Paso 6.)
--
-- Modelo: una fila por (caso, campo). La lista de campos vive en la app (puede
-- crecer). Lectura: quien puede VER el caso (la RLS de `casos` gobierna, vía EXISTS).
-- Escritura: SOLO por la RPC `marcar_campo_verificacion` (security definer), que
-- reaplica la frontera por categoría (Verificación↔Otras, Búsqueda↔Desaparecidos) y
-- audita el cambio. Idempotente. Tras 0168.
-- ============================================================

create table if not exists public.casos_verificacion_campo (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.casos(id) on delete cascade,
  campo text not null,
  estado text not null default 'sin_revisar'
    check (estado in ('sin_revisar', 'verificado', 'requiere_info', 'falso')),
  nota text,
  verificado_por uuid references public.perfiles(id) on delete set null,
  verificado_en timestamptz not null default now(),
  unique (caso_id, campo)
);

alter table public.casos_verificacion_campo enable row level security;

-- Lectura: cualquiera que pueda VER el caso (la RLS de `casos` acota el EXISTS).
drop policy if exists "vcampo_select" on public.casos_verificacion_campo;
create policy "vcampo_select" on public.casos_verificacion_campo for select to authenticated
  using (exists (select 1 from public.casos c where c.id = caso_id));

-- Sin políticas de INSERT/UPDATE/DELETE: la escritura pasa SOLO por la RPC.

create or replace function public.marcar_campo_verificacion(
  p_caso uuid, p_campo text, p_estado text, p_nota text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_cat text;
  v_existe boolean;
begin
  if p_estado not in ('sin_revisar', 'verificado', 'requiere_info', 'falso') then
    raise exception 'Estado de campo no válido: %', p_estado using errcode = '22023';
  end if;
  if coalesce(trim(p_campo), '') = '' then
    raise exception 'Falta el campo a verificar' using errcode = '22023';
  end if;

  select true, categoria into v_existe, v_cat from public.casos where id = p_caso;
  if not coalesce(v_existe, false) then
    raise exception 'Solicitud no encontrada' using errcode = 'P0002';
  end if;

  -- Frontera por categoría: Desaparecidos → Búsqueda/admin; el resto → Verificación/admin.
  if v_cat = 'Desaparecidos' then
    if not (public.es_admin() or public.puede_atender_busqueda(p_caso)) then
      raise exception 'No tienes permiso para verificar esta solicitud' using errcode = '42501';
    end if;
  else
    if not (public.es_admin() or public.puede_verificar()) then
      raise exception 'No tienes permiso para verificar esta solicitud' using errcode = '42501';
    end if;
  end if;

  insert into public.casos_verificacion_campo (caso_id, campo, estado, nota, verificado_por, verificado_en)
  values (p_caso, trim(p_campo), p_estado, nullif(trim(coalesce(p_nota, '')), ''), auth.uid(), now())
  on conflict (caso_id, campo) do update
    set estado = excluded.estado,
        nota = excluded.nota,
        verificado_por = excluded.verificado_por,
        verificado_en = excluded.verificado_en;

  perform public.registrar_auditoria('verificacion_campo', 'casos', p_caso::text,
    jsonb_build_object('campo', trim(p_campo), 'estado', p_estado));
end $$;

revoke all on function public.marcar_campo_verificacion(uuid, text, text, text) from public;
grant execute on function public.marcar_campo_verificacion(uuid, text, text, text) to authenticated;
