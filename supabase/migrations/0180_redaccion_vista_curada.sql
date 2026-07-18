-- ============================================================
-- 0180 — Blindaje duro del contacto para Redacción (Requerimiento Paso 10, Fase 2b)
-- ------------------------------------------------------------
-- Paso 10: «Redes Sociales NUNCA ve el contacto interno». Hasta ahora Redacción/Redes
-- leía la fila COMPLETA de `casos` (RLS `casos_select`, ramas `redaccion`/`opera_redes`)
-- y la app solo enmascaraba el contacto en la lista de columnas — pero como Postgres no
-- puede ocultar columnas por RLS, un usuario de Redacción podía leer `casos.contacto`
-- directo por la API. Esto lo cierra a nivel de base de datos:
--
--   (1) Se QUITAN de `casos_select` las ramas de `redaccion` y `opera_redes`: Redacción
--       ya NO lee filas de `casos` directamente.
--   (2) Se crea la VISTA CURADA `casos_difusion` con SOLO columnas seguras (nunca
--       contacto/referente/whatsapp/instagram) — corre con permisos del dueño (bypassa
--       la RLS de casos) y se auto-acota por rol en su propio WHERE. La app de Redacción
--       (/envio-redaccion + export/print) lee de esta vista.
--
-- Las evidencias ya estaban cerradas para Redacción (política de storage en 0174). El
-- resto de ramas de `casos_select` (Verificación, Recopilación, Búsqueda, Logística,
-- creador, admin) se conservan VERBATIM. Idempotente. Ejecutar tras 0179.
-- ============================================================

-- ── (1) casos_select SIN las ramas de Redacción/Redes (resto = 0156 verbatim) ──
drop policy if exists "casos_select" on public.casos;
create policy "casos_select" on public.casos for select to authenticated
  using (public.es_verificado() and (
    public.es_admin()
    or public.opera_verificacion()
    or (public.tiene_rol('verificador') and categoria is distinct from 'Desaparecidos')
    or (public.es_mando_recopilacion() and categoria is distinct from 'Desaparecidos')
    or (public.es_mando_busqueda() and categoria = 'Desaparecidos')
    or (public.es_busqueda() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and not public.caso_busqueda_es_nna(id))
    or (public.es_buscador_nna() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and public.caso_busqueda_es_nna(id))
    or (public.es_enlace() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and public.caso_busqueda_etapa_enlace(id))
    or (public.puede_logistica() and estado::text in ('confirmado','enviado_redaccion','resuelto')
        and categoria is distinct from 'Desaparecidos')
    or (creado_por = auth.uid() and public.identidad_aprobada())
  ));

-- ── (2) Vista curada para Redacción: SOLO columnas seguras (sin contacto interno) ──
-- security_invoker = false → corre con permisos del dueño (bypassa la RLS de `casos`);
-- el propio WHERE la restringe a Redacción/Redes/admin, así que solo esos roles ven filas,
-- y NUNCA aparece una columna de contacto interno. Incluye lo que ve la difusión: el
-- contacto AUTORIZADO (`contacto_difusion`) y los campos de estado/publicación.
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
    c.redactor_id, c.canales_publicacion
  from public.casos c
  where c.categoria is distinct from 'Desaparecidos'
    and (c.estado::text in ('confirmado', 'enviado_redaccion') or c.publicado_en is not null)
    and (public.es_admin() or public.opera_redes() or public.tiene_rol('redaccion'));

grant select on public.casos_difusion to authenticated;

comment on view public.casos_difusion is
  'Paso 10 (Fase 2b): fuente curada de solicitudes para Redacción/Redes — solo columnas seguras (nunca contacto/referente/whatsapp/instagram). Se auto-acota por rol en su WHERE; corre con permisos del dueño para no depender de casos_select (del que se quitaron las ramas de Redacción).';
