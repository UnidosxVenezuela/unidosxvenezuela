-- ============================================================
-- 0169 — Herramientas operativas de «Envío a Redacción»
-- ------------------------------------------------------------
-- La vista de Redacción se pone a la par de Solicitudes y Logística. Además del
-- rediseño (frontend), se suman dos capacidades operativas en la propia solicitud:
--
--   (1) REDACTOR asignado (redactor_id): quién de Redacción está trabajando la
--       difusión de la solicitud. Es «tomar/soltar» (auto-asignación), espejo de
--       `tomarCaso` de Verificación, pero en su propia columna para NO pisar
--       `asignado_a` (que es de Verificación). Vía RPC SECURITY DEFINER porque
--       Redacción no tiene UPDATE directo sobre casos (su escritura va por RPC).
--
--   (2) CANALES de difusión (canales_publicacion): en qué redes se publicó
--       (Instagram, X, WhatsApp, Telegram…). Es parte del HECHO «publicada», así
--       que se fija junto con `publicado_*` (mismo guard de columnas, 0166) y se
--       limpia al deshacer la publicación.
--
-- Idempotente. Ejecutar tras 0168. No requiere backfill (columnas nuevas nulas/vacías).
-- ============================================================

-- ── Columnas nuevas ──
alter table public.casos add column if not exists redactor_id         uuid references public.perfiles (id) on delete set null;
alter table public.casos add column if not exists canales_publicacion text[] not null default '{}';

-- ── (1) Tomar / soltar la solicitud para redactar (auto-asignación) ──
-- Mismo permiso que marcar_caso_publicado (0166): admin, pipeline (incluye Redacción)
-- o el rol de envío a redacción. El Admin de Redes supervisa (lectura), no pasa el filtro.
create or replace function public.tomar_caso_redaccion(p_caso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  if not (public.es_admin() or public.puede_pipeline() or public.tiene_rol('envio_redaccion')) then
    raise exception 'No tienes permiso para tomar solicitudes en Redacción.' using errcode = '42501';
  end if;
  select estado::text into v_estado from public.casos where id = p_caso;
  if not found then raise exception 'Solicitud no encontrada.'; end if;
  -- Solo lo que ya pasó por verificación (lo que ve y difunde Redacción).
  if v_estado not in ('confirmado', 'enviado_redaccion', 'resuelto') then
    raise exception 'Solo se toman solicitudes confirmadas.' using errcode = '23514';
  end if;
  update public.casos set redactor_id = auth.uid(), actualizado_en = now() where id = p_caso;
end $$;
grant execute on function public.tomar_caso_redaccion(uuid) to authenticated;

-- Soltar: lo hace el propio redactor asignado o un admin (para reasignar/liberar).
create or replace function public.soltar_caso_redaccion(p_caso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_red uuid;
begin
  if not (public.es_admin() or public.puede_pipeline() or public.tiene_rol('envio_redaccion')) then
    raise exception 'No tienes permiso para soltar solicitudes en Redacción.' using errcode = '42501';
  end if;
  select redactor_id into v_red from public.casos where id = p_caso;
  if not found then raise exception 'Solicitud no encontrada.'; end if;
  if v_red is not null and v_red <> auth.uid() and not public.es_admin() then
    raise exception 'Solo quien la tomó (o un admin) puede soltarla.' using errcode = '42501';
  end if;
  update public.casos set redactor_id = null, actualizado_en = now() where id = p_caso;
end $$;
grant execute on function public.soltar_caso_redaccion(uuid) to authenticated;

-- ── (2) Canales de difusión: se fijan junto con el hecho «publicada» ──
-- Se recrea el núcleo interno de 0166 sumando p_canales (con default para que el
-- camino automático de piezas de contenido siga llamándolo con 4 args). Se elimina
-- la versión de 4 args para que el default no genere ambigüedad de sobrecarga.
drop function if exists public.marcar_caso_publicado_interno(uuid, text, uuid, boolean);
create or replace function public.marcar_caso_publicado_interno(
  p_caso uuid, p_url text, p_por uuid, p_auto boolean, p_canales text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare v_creador uuid; v_ya timestamptz; v_num int;
begin
  if p_caso is null then return; end if;
  select creado_por, publicado_en, numero into v_creador, v_ya, v_num
    from public.casos where id = p_caso;
  if not found then return; end if;

  if v_ya is null then
    perform set_config('app.publicado_ok', '1', true);   -- habilita el guard de columnas
    update public.casos
       set publicado_en        = now(),
           publicacion_url     = nullif(p_url, ''),
           publicado_por       = p_por,
           canales_publicacion = coalesce(p_canales, '{}'),
           actualizado_en      = now()
     where id = p_caso;
    perform set_config('app.publicado_ok', '0', true);

    insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
      values (coalesce(p_por, auth.uid()), 'casos:publicado', 'casos', p_caso::text,
              jsonb_build_object('auto', p_auto, 'url', nullif(p_url, ''), 'canales', to_jsonb(coalesce(p_canales, '{}'::text[]))));

    if v_creador is not null then
      insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
        values (v_creador, 'caso_publicado', '📣 Tu solicitud fue publicada',
                'La solicitud #' || lpad(coalesce(v_num, 0)::text, 5, '0') ||
                ' ya fue publicada por Redacción.',
                '/casos?caso=' || p_caso::text);
    end if;
  else
    -- Ya estaba publicada: se refresca el enlace y/o los canales si llegan nuevos.
    perform set_config('app.publicado_ok', '1', true);
    update public.casos
       set publicacion_url     = coalesce(nullif(p_url, ''), publicacion_url),
           canales_publicacion = case when coalesce(array_length(p_canales, 1), 0) > 0 then p_canales else canales_publicacion end,
           actualizado_en      = now()
     where id = p_caso;
    perform set_config('app.publicado_ok', '0', true);
  end if;
end $$;

-- Camino MANUAL: Redacción/Redes/coordinación/admin marca «Publicada» con canales.
drop function if exists public.marcar_caso_publicado(uuid, text);
create or replace function public.marcar_caso_publicado(p_caso uuid, p_url text default null, p_canales text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  if not (public.es_admin() or public.puede_pipeline() or public.tiene_rol('envio_redaccion')) then
    raise exception 'No tienes permiso para marcar una solicitud como publicada.' using errcode = '42501';
  end if;
  select estado::text into v_estado from public.casos where id = p_caso;
  if not found then raise exception 'Solicitud no encontrada.'; end if;
  if v_estado not in ('confirmado', 'enviado_redaccion', 'resuelto') then
    raise exception 'Solo se publican solicitudes confirmadas.' using errcode = '23514';
  end if;
  perform public.marcar_caso_publicado_interno(p_caso, p_url, auth.uid(), false, coalesce(p_canales, '{}'));
end $$;
grant execute on function public.marcar_caso_publicado(uuid, text, text[]) to authenticated;

-- Deshacer: solo admin. Limpia también los canales.
create or replace function public.quitar_caso_publicado(p_caso uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede deshacer la publicación.' using errcode = '42501';
  end if;
  perform set_config('app.publicado_ok', '1', true);
  update public.casos set publicado_en = null, publicacion_url = null, publicado_por = null,
         canales_publicacion = '{}', actualizado_en = now() where id = p_caso;
  perform set_config('app.publicado_ok', '0', true);
  insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
    values (auth.uid(), 'casos:despublicado', 'casos', p_caso::text, '{}'::jsonb);
end $$;
grant execute on function public.quitar_caso_publicado(uuid) to authenticated;

-- ── Guard: los canales también son parte del hecho «publicada» (0166) ──
-- Se recrea el guard completo sumando canales_publicacion a lo blindado.
create or replace function public.proteger_campos_publicado_caso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if coalesce(current_setting('app.publicado_ok', true), '') = '1' then return new; end if;
  if new.publicado_en        is distinct from old.publicado_en
     or new.publicacion_url     is distinct from old.publicacion_url
     or new.publicado_por       is distinct from old.publicado_por
     or new.canales_publicacion is distinct from old.canales_publicacion then
    raise exception 'El estado de publicación solo lo fija Redacción (usa la acción correspondiente).'
      using errcode = '42501';
  end if;
  return new;
end $$;
-- El trigger trg_proteger_publicado_caso (0166) ya apunta a esta función; recrear la
-- función basta (el enlace es por nombre). Se deja el create trigger por idempotencia.
drop trigger if exists trg_proteger_publicado_caso on public.casos;
create trigger trg_proteger_publicado_caso
  before update on public.casos
  for each row execute function public.proteger_campos_publicado_caso();
