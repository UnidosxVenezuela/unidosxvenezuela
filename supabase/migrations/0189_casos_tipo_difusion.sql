-- ============================================================
-- 0189 — Tipo de difusión por caso: «rediseñar y publicar» vs «solo repostear»
-- ------------------------------------------------------------
-- Redacción ahora maneja dos clases de caso:
--   · 'rediseno' → se rediseña y publica una pieza propia.
--   · 'repost'   → solo se repostea una publicación ya existente; se necesita el
--                  LINK de esa publicación original (`url_original`) para incluirlo
--                  en el mensaje de WhatsApp (y NO incluirlo cuando es rediseño).
--
-- Dos columnas aditivas en `casos` (texto + constante en el frontend, como
-- `canales_publicacion`/`categoria`; sin enum de BD). La escritura va por RPC
-- (`set_difusion_meta`) porque tras 0180 Redacción no tiene UPDATE directo sobre
-- `casos`. Se recrea la vista curada `casos_difusion` (0180) VERBATIM + las 2
-- columnas nuevas, para que Redacción pueda leerlas. Idempotente. Tras 0188.
-- ============================================================

alter table public.casos add column if not exists tipo_difusion text
  check (tipo_difusion is null or tipo_difusion in ('rediseno', 'repost'));
alter table public.casos add column if not exists url_original text;

comment on column public.casos.tipo_difusion is
  'Cómo difunde Redacción este caso (0188): rediseno = pieza propia; repost = repostear una publicación existente. Null = sin definir.';
comment on column public.casos.url_original is
  'Link de la publicación ORIGINAL a repostear (0188). Se usa/incluye solo cuando tipo_difusion = repost.';

-- ── RPC: fijar el tipo de difusión (y el link original si es repost) ──
-- Frontera igual que publicar/tomar en Redacción: admin, pipeline (incluye Redacción)
-- o el rol de envío a redacción. No toca columnas blindadas (publicado_*), así que el
-- guard de 0169 no interviene.
create or replace function public.set_difusion_meta(p_caso uuid, p_tipo text, p_url_original text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_existe boolean;
begin
  if not (public.es_admin() or public.puede_pipeline() or public.tiene_rol('envio_redaccion')) then
    raise exception 'No tienes permiso para cambiar el tipo de difusión.' using errcode = '42501';
  end if;
  if p_tipo is not null and p_tipo not in ('rediseno', 'repost') then
    raise exception 'Tipo de difusión no válido: %', p_tipo using errcode = '22023';
  end if;
  select true into v_existe from public.casos where id = p_caso;
  if not coalesce(v_existe, false) then
    raise exception 'Solicitud no encontrada.' using errcode = 'P0002';
  end if;
  update public.casos
     set tipo_difusion = p_tipo,
         -- el link original solo tiene sentido en repost; en rediseño se limpia.
         url_original = case when p_tipo = 'repost'
                             then nullif(trim(coalesce(p_url_original, '')), '')
                             else null end,
         actualizado_en = now()
   where id = p_caso;
  perform public.registrar_auditoria('difusion_meta', 'casos', p_caso::text,
    jsonb_build_object('tipo', p_tipo));
end $$;

revoke all on function public.set_difusion_meta(uuid, text, text) from public;
grant execute on function public.set_difusion_meta(uuid, text, text) to authenticated;

-- ── Vista curada de Redacción (0180) recreada VERBATIM + tipo_difusion, url_original ──
drop view if exists public.casos_difusion;
create view public.casos_difusion
  with (security_invoker = false) as
  select
    c.id, c.numero, c.titulo, c.descripcion, c.categoria,
    c.fuente, c.fuente_url, c.fecha_publicacion,
    c.contacto_difusion, c.autoriza_difusion, c.notas,
    c.creado_por, c.actualizado_en, c.requiere_difusion,
    c.es_requerimiento, c.req_tipo, c.req_cantidad, c.req_urgencia,
    c.lat, c.lng, c.estado, c.publicado_en, c.publicacion_url,
    c.redactor_id, c.canales_publicacion,
    c.tipo_difusion, c.url_original
  from public.casos c
  where c.categoria is distinct from 'Desaparecidos'
    and (c.estado::text in ('confirmado', 'enviado_redaccion') or c.publicado_en is not null)
    and public.es_verificado()
    and (public.es_admin() or public.opera_redes() or public.tiene_rol('redaccion'));

grant select on public.casos_difusion to authenticated;

comment on view public.casos_difusion is
  'Paso 10 (Fase 2b): fuente curada de solicitudes para Redacción/Redes — solo columnas seguras (nunca contacto/referente/whatsapp/instagram). Se auto-acota por rol en su WHERE; corre con permisos del dueño. Extendida en 0188 con tipo_difusion/url_original.';
