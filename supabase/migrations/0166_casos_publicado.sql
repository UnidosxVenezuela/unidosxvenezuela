-- ============================================================
-- 0166 — Marca «Publicada» en la solicitud (cierra el lazo con Redacción)
-- ------------------------------------------------------------
-- Cuando Redacción/Redes publica la pieza de una solicitud, queda registrado en
-- la propia solicitud para que Recopilación, Verificación y Logística lo vean.
--
-- Dos caminos (los pidió coordinación):
--   (A) AUTOMÁTICO: al pasar una pieza de contenido a la etapa «publicado», si
--       está enlazada a un caso (piezas_contenido.caso_id), la solicitud queda
--       marcada como publicada (con el enlace de la pieza).
--   (B) MANUAL: Redacción/Redes marca «Publicada» a mano (con enlace), útil cuando
--       se publica por fuera del pipeline (Instagram, X…). RPC con permiso.
--
-- «Publicada» es un HECHO ORTOGONAL al estado (no un estado nuevo): una solicitud
-- puede estar «Enviada a Redacción» o «Resuelta» y además publicada. Por eso se
-- guarda en columnas propias, no en estado_caso.
--
-- Seguridad: las columnas solo las escribe la plataforma (funciones SECURITY
-- DEFINER); un guard BEFORE UPDATE impide falsificarlas por la API directa.
-- Idempotente. Ejecutar tras 0162 (independiente de 0163–0165).
-- ============================================================

-- ── Columnas del hecho «publicada» ──
alter table public.casos add column if not exists publicado_en    timestamptz;
alter table public.casos add column if not exists publicacion_url text;
alter table public.casos add column if not exists publicado_por   uuid references public.perfiles (id) on delete set null;

-- ── Núcleo: marca la solicitud como publicada (idempotente) + registro + aviso ──
-- La primera vez fija fecha/enlace/autor, deja rastro en el registro de actividad
-- y avisa a quien la reportó. Si ya estaba publicada, solo refresca el enlace.
create or replace function public.marcar_caso_publicado_interno(
  p_caso uuid, p_url text, p_por uuid, p_auto boolean)
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
       set publicado_en    = now(),
           publicacion_url = nullif(p_url, ''),
           publicado_por   = p_por,
           actualizado_en  = now()
     where id = p_caso;
    perform set_config('app.publicado_ok', '0', true);

    insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
      values (coalesce(p_por, auth.uid()), 'casos:publicado', 'casos', p_caso::text,
              jsonb_build_object('auto', p_auto, 'url', nullif(p_url, '')));

    if v_creador is not null then
      insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
        values (v_creador, 'caso_publicado', '📣 Tu solicitud fue publicada',
                'La solicitud #' || lpad(coalesce(v_num, 0)::text, 5, '0') ||
                ' ya fue publicada por Redacción.',
                '/casos?caso=' || p_caso::text);
    end if;
  elsif nullif(p_url, '') is not null then
    -- Ya estaba publicada: solo se actualiza el enlace si llega uno nuevo.
    perform set_config('app.publicado_ok', '1', true);
    update public.casos set publicacion_url = p_url, actualizado_en = now()
      where id = p_caso and coalesce(publicacion_url, '') is distinct from p_url;
    perform set_config('app.publicado_ok', '0', true);
  end if;
end $$;

-- ── (B) Camino MANUAL: Redacción/Redes/coordinación/admin marca «Publicada» ──
create or replace function public.marcar_caso_publicado(p_caso uuid, p_url text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  if not (public.es_admin() or public.puede_pipeline() or public.tiene_rol('envio_redaccion')) then
    raise exception 'No tienes permiso para marcar una solicitud como publicada.' using errcode = '42501';
  end if;
  select estado::text into v_estado from public.casos where id = p_caso;
  if not found then raise exception 'Solicitud no encontrada.'; end if;
  -- Solo lo que ya pasó por verificación (confirmado/enviado/resuelto).
  if v_estado not in ('confirmado', 'enviado_redaccion', 'resuelto') then
    raise exception 'Solo se publican solicitudes confirmadas.' using errcode = '23514';
  end if;
  perform public.marcar_caso_publicado_interno(p_caso, p_url, auth.uid(), false);
end $$;
grant execute on function public.marcar_caso_publicado(uuid, text) to authenticated;

-- Deshacer (por si se marcó por error): solo admin.
create or replace function public.quitar_caso_publicado(p_caso uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede deshacer la publicación.' using errcode = '42501';
  end if;
  perform set_config('app.publicado_ok', '1', true);
  update public.casos set publicado_en = null, publicacion_url = null, publicado_por = null,
         actualizado_en = now() where id = p_caso;
  perform set_config('app.publicado_ok', '0', true);
  insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
    values (auth.uid(), 'casos:despublicado', 'casos', p_caso::text, '{}'::jsonb);
end $$;
grant execute on function public.quitar_caso_publicado(uuid) to authenticated;

-- ── (A) Camino AUTOMÁTICO: pieza de contenido → etapa «publicado» ──
create or replace function public.trg_pieza_publicada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.caso_id is not null and new.etapa = 'publicado'
     and (tg_op = 'INSERT' or old.etapa is distinct from new.etapa) then
    perform public.marcar_caso_publicado_interno(
      new.caso_id, new.enlace_pieza, coalesce(new.asignado_a, new.creado_por), true);
  end if;
  return new;
end $$;
drop trigger if exists trg_pieza_publicada on public.piezas_contenido;
create trigger trg_pieza_publicada
  after insert or update of etapa on public.piezas_contenido
  for each row execute function public.trg_pieza_publicada();

-- ── Guard: nadie escribe las columnas «publicado_*» por la API directa ──
-- Solo pasan los cambios hechos por las funciones de arriba, que activan el flag
-- de sesión app.publicado_ok (mismo patrón que proteger_campos_perfil/0075). Sin
-- contexto de usuario (migraciones/servidor) se deja pasar.
create or replace function public.proteger_campos_publicado_caso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if coalesce(current_setting('app.publicado_ok', true), '') = '1' then return new; end if;
  if new.publicado_en    is distinct from old.publicado_en
     or new.publicacion_url is distinct from old.publicacion_url
     or new.publicado_por   is distinct from old.publicado_por then
    raise exception 'El estado de publicación solo lo fija Redacción (usa la acción correspondiente).'
      using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_proteger_publicado_caso on public.casos;
create trigger trg_proteger_publicado_caso
  before update on public.casos
  for each row execute function public.proteger_campos_publicado_caso();
