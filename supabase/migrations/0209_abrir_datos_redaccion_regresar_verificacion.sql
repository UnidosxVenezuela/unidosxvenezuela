-- ============================================================
-- 0209 — Redacción/Redes ve el material completo + regresar a verificación + publicado en seguimiento
-- ------------------------------------------------------------
-- Petición #4 del documento del equipo (página 2) + decisiones 1 y 5:
--   · #4a — Redacción/Redes NO podía ver datos importantes. Ahora SÍ (decisión 1,
--     «ya no mantenerlo oculto»): contacto interno, link a la fuente (ya estaba),
--     TODOS los adjuntos (no solo los curados «aptos») y las notas de Logística.
--   · #4b — botón «regresar a verificación» para Redacción: RPC regresar_caso_verificacion.
--   · #4c — al marcar PUBLICADO, reflejarlo en Seguimiento (RPC seguimiento_casos suma
--     publicado_en) y mostrar también las notas de verificación (decisión 5).
--
-- IMPORTANTE (privacidad): esto REVIERTE parte del «blindaje Paso 10» (0180/0187) a
-- propósito, por decisión del equipo. El contacto interno y las evidencias completas
-- quedan visibles para Redacción/Redes (y admin). La vista sigue self-acotada por rol.
-- Idempotente. Ejecutar tras 0208.
-- ============================================================

-- ── (A) casos_difusion: 0208 VERBATIM (columnas + WHERE de ruteo) + contacto interno ──
-- Se conservan EXACTAS las columnas y el WHERE de ruteo explícito de 0208; solo se SUMAN
-- las columnas de contacto interno que antes se ocultaban (decisión 1).
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
    c.tipo_difusion, c.url_original,
    -- Decisión 1 (0209): contacto interno visible para Redacción/Redes.
    c.contacto, c.referente, c.contacto_whatsapp, c.contacto_instagram, c.referente_rol
  from public.casos c
  where c.categoria is distinct from 'Desaparecidos'
    and (
      c.publicado_en is not null
      or c.requiere_difusion
      or c.estado::text = 'enviado_redaccion'
      or exists (select 1 from public.casos_derivaciones d where d.caso_id = c.id and d.area = 'redes')
    )
    and public.es_verificado()
    and (public.es_admin() or public.opera_redes() or public.tiene_rol('redaccion'));

grant select on public.casos_difusion to authenticated;

comment on view public.casos_difusion is
  'Fuente de Redacción/Redes. Ruteo EXPLÍCITO (0208): solo lo derivado a «redes» / enviado a redacción / requiere_difusion / publicado. Desde 0209 (decisión 1) EXPONE el contacto interno para que Redacción trabaje con el material completo; se auto-acota por rol.';

-- ── (B) casos_adjuntos_difusion: TODOS los adjuntos del caso (no solo los «aptos») ──
-- Decisión «todos los adjuntos»: Redacción/Redes ve todas las evidencias, no solo las
-- que Verificación marcó apto_difusion. Se conserva el resto del blindaje (rol + no
-- Desaparecidos). La vista corre con permisos del dueño (Redacción no tiene cadj_select).
drop view if exists public.casos_adjuntos_difusion;
create view public.casos_adjuntos_difusion
  with (security_invoker = false) as
  select a.id, a.caso_id, a.url, a.nombre, a.mime, a.creado_en, a.apto_en
    from public.casos_adjuntos a
    join public.casos c on c.id = a.caso_id
   where c.categoria is distinct from 'Desaparecidos'
     and public.es_verificado()
     and (public.es_admin() or public.opera_redes() or public.tiene_rol('redaccion'));

grant select on public.casos_adjuntos_difusion to authenticated;

comment on view public.casos_adjuntos_difusion is
  'Adjuntos para Redacción/Redes. Desde 0209 (decisión «todos los adjuntos»): TODAS las evidencias del caso, no solo apto_difusion. Nunca Desaparecidos; self-acotada por rol.';

-- Storage: LECTURA de los objetos de un caso para Redacción/Redes, ya sin exigir apto.
drop policy if exists "adjuntos_casos_difusion" on storage.objects;
create policy "adjuntos_casos_difusion" on storage.objects for select to authenticated
  using (bucket_id = 'adjuntos'
    and (storage.foldername(name))[1] = 'casos'
    and (public.opera_redes() or public.tiene_rol('redaccion'))
    and exists (select 1 from public.casos_adjuntos a
                join public.casos c on c.id = a.caso_id
                where a.url = storage.objects.name
                  and c.categoria is distinct from 'Desaparecidos'));

-- ── (C) regresar_caso_verificacion — botón de Redacción para devolver a Verificación (#4b) ──
-- Redacción NO tiene UPDATE sobre casos (blindaje 0180), así que el cambio va por RPC
-- SECURITY DEFINER. Devuelve un caso del pipeline de Redacción (confirmado / enviado a
-- redacción, aún no publicado) a 'en_proceso' para que Verificación lo retome; libera al
-- redactor, anexa el motivo a las notas, audita y avisa a Verificación.
create or replace function public.regresar_caso_verificacion(p_caso uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_caso record; v_motivo text; v_sello text;
begin
  if not (public.es_verificado() and (public.es_admin() or public.opera_redes() or public.tiene_rol('redaccion'))) then
    raise exception 'No tienes permiso para regresar la solicitud a verificación.' using errcode = '42501';
  end if;

  select id, titulo, estado, notas into v_caso from public.casos where id = p_caso;
  if v_caso.id is null then
    raise exception 'Solicitud no encontrada.' using errcode = 'P0002';
  end if;
  if v_caso.estado::text not in ('confirmado', 'enviado_redaccion') then
    raise exception 'Solo se regresa a verificación una solicitud confirmada o enviada a redacción.' using errcode = '22023';
  end if;

  v_motivo := nullif(trim(coalesce(p_motivo, '')), '');
  v_sello := '[Regresado a verificación ' || to_char(now(), 'YYYY-MM-DD') || ']'
             || case when v_motivo is not null then ' ' || v_motivo else '' end;

  update public.casos
     set estado = 'en_proceso',
         redactor_id = null,
         notas = case when coalesce(notas, '') = '' then v_sello else notas || E'\n' || v_sello end,
         actualizado_en = now()
   where id = p_caso;

  perform public.registrar_auditoria('regresar_caso_verificacion', 'casos', p_caso::text,
    jsonb_build_object('motivo', v_motivo));

  -- Aviso a Verificación (admin + verificadores verificados), anti-spam 6 h por caso.
  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select p.id, 'caso_derivado',
         'Solicitud regresada a verificación',
         'Redacción devolvió «' || coalesce(v_caso.titulo, 'una solicitud') || '» para revisar.'
           || case when v_motivo is not null then ' Motivo: ' || v_motivo || '.' else '' end,
         '/casos?caso=' || p_caso
  from public.perfiles p
  where p.verificado
    and p.id is distinct from auth.uid()
    and (p.rol in ('admin'::public.rol_usuario, 'verificador'::public.rol_usuario)
         or p.roles_extra && array['admin','verificador']::public.rol_usuario[])
    and not exists (
      select 1 from public.notificaciones n
      where n.destinatario_id = p.id and n.tipo = 'caso_derivado'
        and n.enlace = '/casos?caso=' || p_caso and n.creado_en > now() - interval '6 hours');
end $$;

revoke all on function public.regresar_caso_verificacion(uuid, text) from public;
grant execute on function public.regresar_caso_verificacion(uuid, text) to authenticated;

comment on function public.regresar_caso_verificacion(uuid, text) is
  'Botón de Redacción (#4b, 0209): devuelve un caso confirmado/enviado a redacción a «en_proceso» para que Verificación lo retome; libera al redactor, anexa el motivo a notas, audita y avisa a Verificación.';

-- ── (D) seguimiento_casos: sumar publicado_en (#4c) y notas (decisión 5) ──
-- El recorrido cross-área ahora refleja si ya se PUBLICÓ y muestra las notas de
-- verificación. Mantiene el resto igual (excluye Desaparecidos, solo personal verificado).
drop function if exists public.seguimiento_casos(text);
create function public.seguimiento_casos(p_q text default null)
returns table (
  id uuid,
  numero bigint,
  titulo text,
  categoria text,
  estado text,
  es_requerimiento boolean,
  req_tipo text,
  req_urgencia text,
  ubicacion_estado text,
  ubicacion_municipio text,
  validado boolean,
  publicado_en timestamptz,
  notas text,
  creado_en timestamptz,
  actualizado_en timestamptz
) language plpgsql stable security definer set search_path = public as $$
declare
  v_num text := nullif(regexp_replace(coalesce(p_q, ''), '\D', '', 'g'), '');
  v_txt text := nullif(trim(coalesce(p_q, '')), '');
begin
  if not public.es_verificado() then
    return;
  end if;

  return query
    select c.id, c.numero, c.titulo, c.categoria, c.estado::text,
           c.es_requerimiento, c.req_tipo::text, c.req_urgencia::text,
           c.ubicacion_estado, c.ubicacion_municipio,
           public.caso_esta_validado(c.id), c.publicado_en, c.notas,
           c.creado_en, c.actualizado_en
    from public.casos c
    where c.categoria is distinct from 'Desaparecidos'
      and (
        v_txt is null
        or c.titulo ilike '%' || v_txt || '%'
        or (v_num is not null and c.numero = v_num::bigint)
      )
    order by c.actualizado_en desc
    limit 100;
end $$;

revoke all on function public.seguimiento_casos(text) from public;
grant execute on function public.seguimiento_casos(text) to authenticated;

comment on function public.seguimiento_casos(text) is
  'Paso 5 (cross-área): recorrido/estado de solicitudes para todo el personal verificado. Desde 0209 suma publicado_en (#4c) y notas de verificación (decisión 5). Excluye Desaparecidos.';
