-- ============================================================
-- 0190 — Registro de publicación POR CANAL
-- ------------------------------------------------------------
-- Problema: «Publicada» (0166/0169) guarda UN solo enlace (`publicacion_url`) para
-- varios canales y una lista plana `canales_publicacion text[]`: no se puede registrar
-- «en IG sí, en X pendiente», ni el enlace propio de cada red, ni medir por red.
--
-- Se agrega la tabla `casos_publicaciones` (una fila por caso+canal, con url/estado/
-- quién/cuándo). El estado GLOBAL del caso se mantiene sincronizado: un caso cuenta
-- como «publicado» apenas se publica en el PRIMER canal (delegando en la función
-- interna 0169 que activa el guard `app.publicado_ok`), y `canales_publicacion` refleja
-- el conjunto de canales publicados. Toda escritura pasa por RPC (la tabla no tiene
-- políticas de INSERT/UPDATE/DELETE), igual que `casos_verificacion_campo` (0172).
-- Idempotente. Tras 0189.
-- ============================================================

create table if not exists public.casos_publicaciones (
  id             uuid primary key default gen_random_uuid(),
  caso_id        uuid not null references public.casos (id) on delete cascade,
  canal          text not null,
  url            text,
  estado_canal   text not null default 'publicado'
                   check (estado_canal in ('pendiente', 'publicado')),
  publicado_por  uuid references public.perfiles (id) on delete set null,
  publicado_en   timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (caso_id, canal)
);
create index if not exists idx_casos_pub_caso  on public.casos_publicaciones (caso_id);
create index if not exists idx_casos_pub_canal on public.casos_publicaciones (canal);

alter table public.casos_publicaciones enable row level security;

-- Lectura: quienes difunden/miden (admin, Redes, Redacción). Verificados.
drop policy if exists "cpub_select" on public.casos_publicaciones;
create policy "cpub_select" on public.casos_publicaciones for select to authenticated
  using (public.es_verificado()
    and (public.es_admin() or public.opera_redes() or public.tiene_rol('redaccion')));

-- Sin INSERT/UPDATE/DELETE directos: la escritura pasa SOLO por las RPC de abajo.

-- ── RPC: registrar (o actualizar) la publicación en un canal + sincronizar global ──
create or replace function public.registrar_publicacion_canal(
  p_caso uuid, p_canal text, p_url text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; v_canales text[];
begin
  if not (public.es_admin() or public.puede_pipeline() or public.tiene_rol('envio_redaccion')) then
    raise exception 'No tienes permiso para registrar publicaciones.' using errcode = '42501';
  end if;
  if coalesce(trim(p_canal), '') = '' then
    raise exception 'Falta el canal.' using errcode = '22023';
  end if;
  select estado::text into v_estado from public.casos where id = p_caso;
  if not found then raise exception 'Solicitud no encontrada.' using errcode = 'P0002'; end if;
  if v_estado not in ('confirmado', 'enviado_redaccion', 'resuelto') then
    raise exception 'Solo se publican solicitudes confirmadas.' using errcode = '23514';
  end if;

  insert into public.casos_publicaciones (caso_id, canal, url, estado_canal, publicado_por, publicado_en, actualizado_en)
    values (p_caso, trim(p_canal), nullif(trim(coalesce(p_url, '')), ''), 'publicado', auth.uid(), now(), now())
  on conflict (caso_id, canal) do update
    set url            = coalesce(nullif(trim(coalesce(excluded.url, '')), ''), public.casos_publicaciones.url),
        estado_canal   = 'publicado',
        publicado_por  = auth.uid(),
        -- si ya estaba publicado no se reescribe la fecha original
        publicado_en   = case when public.casos_publicaciones.estado_canal = 'publicado'
                              then public.casos_publicaciones.publicado_en else now() end,
        actualizado_en = now();

  -- Sincroniza el estado global: conjunto de canales publicados + marca «publicado»
  -- en el primer canal (la función interna 0169 fija publicado_en/publicado_por).
  select array_agg(distinct canal order by canal) into v_canales
    from public.casos_publicaciones where caso_id = p_caso and estado_canal = 'publicado';
  perform public.marcar_caso_publicado_interno(
    p_caso, nullif(trim(coalesce(p_url, '')), ''), auth.uid(), false, coalesce(v_canales, '{}'));

  perform public.registrar_auditoria('publicacion_canal', 'casos', p_caso::text,
    jsonb_build_object('canal', trim(p_canal)));
end $$;

revoke all on function public.registrar_publicacion_canal(uuid, text, text) from public;
grant execute on function public.registrar_publicacion_canal(uuid, text, text) to authenticated;

-- ── RPC: quitar la publicación de un canal + reconciliar el estado global ──
create or replace function public.quitar_publicacion_canal(p_caso uuid, p_canal text)
returns void language plpgsql security definer set search_path = public as $$
declare v_restantes text[];
begin
  if not (public.es_admin() or public.puede_pipeline() or public.tiene_rol('envio_redaccion')) then
    raise exception 'No tienes permiso.' using errcode = '42501';
  end if;
  -- Canales que quedarían publicados tras quitar este.
  select array_agg(distinct canal order by canal) into v_restantes
    from public.casos_publicaciones
    where caso_id = p_caso and estado_canal = 'publicado' and canal <> trim(p_canal);

  -- Quitar el ÚLTIMO canal deja el caso sin publicar → eso es «Deshacer» (solo admin).
  if coalesce(array_length(v_restantes, 1), 0) = 0 and not public.es_admin() then
    raise exception 'Quitar el último canal deja la solicitud sin publicar; eso lo hace un administrador (Deshacer).'
      using errcode = '42501';
  end if;

  delete from public.casos_publicaciones where caso_id = p_caso and canal = trim(p_canal);

  if coalesce(array_length(v_restantes, 1), 0) = 0 then
    perform public.quitar_caso_publicado(p_caso);       -- admin garantizado arriba
  else
    perform public.marcar_caso_publicado_interno(p_caso, null, auth.uid(), false, v_restantes);
  end if;

  perform public.registrar_auditoria('publicacion_canal_quitar', 'casos', p_caso::text,
    jsonb_build_object('canal', trim(p_canal)));
end $$;

revoke all on function public.quitar_publicacion_canal(uuid, text) from public;
grant execute on function public.quitar_publicacion_canal(uuid, text) to authenticated;

comment on table public.casos_publicaciones is
  'Publicación por canal de una solicitud (0189): canal, url propia, estado (pendiente/publicado), quién y cuándo. El estado global (casos.publicado_en/canales_publicacion) se sincroniza vía RPC. Escritura solo por registrar_publicacion_canal / quitar_publicacion_canal.';
