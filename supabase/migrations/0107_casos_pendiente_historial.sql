-- ============================================================
-- 0107 — Casos: estado «Pendiente» + historial visible para líderes/coordinadores
-- ------------------------------------------------------------
-- A pedido del equipo de Verificación:
--   1) Un estado nuevo «pendiente» para distinguir un caso que TODAVÍA NO HA TOMADO
--      NADIE (pendiente de revisión) de uno que YA ESTÁ EN PROCESO (tomado).
--   2) El HISTORIAL de cambios de los casos (registro de auditoría) también visible
--      para los LÍDERES DE GRUPO y COORDINADORES, para el seguimiento de tiempos
--      (detectar si un caso está tardando más de lo habitual).
--
-- Enum-safety: el valor nuevo `pendiente` de `estado_caso` SOLO se usa por comparación
-- de TEXTO (`estado::text in (...)`), nunca con cast eager `'pendiente'::estado_caso`.
-- Idempotente. Ejecutar tras 0106.
-- ============================================================

-- ── 1) Estado nuevo «pendiente» ──
alter type public.estado_caso add value if not exists 'pendiente';

-- ── 2) Historial de casos para líderes de grupo y coordinadores ──
-- El registro de auditoría era solo para el admin (es_coordinacion). Se amplía SOLO la
-- lectura de las entradas de CASOS a coordinadores, líderes de grupo (por rol o por
-- liderar un grupo) y al Admin de Verificaciones. El resto de la auditoría (usuarios,
-- roles, etc.) sigue siendo exclusivo del admin general. Base: 0002 (única definición).
drop policy if exists "audit_lectura_coord" on public.registro_auditoria;
create policy "audit_lectura_coord" on public.registro_auditoria for select to authenticated
  using (
    public.es_coordinacion()
    or (entidad = 'casos' and (
          public.tiene_rol('coordinador')
          or public.tiene_rol('lider_grupo')
          or public.es_admin_verificacion()
          or exists (select 1 from public.grupos g where g.lider_id = auth.uid())
       ))
  );

-- ── 3) El creador puede editar su caso mientras siga «pendiente» o «en proceso» ──
-- Antes el creador solo podía editar en «en_proceso»; con el nuevo estado por defecto
-- «pendiente», se amplía esa rama. Se reconstruye la policy VIGENTE (0106) y solo se
-- cambia esa condición (por TEXTO → enum-safe). El resto de ramas queda igual.
drop policy if exists "casos_update" on public.casos;
create policy "casos_update" on public.casos for update to authenticated
  using (
    public.es_admin()
    or (public.opera_verificacion() and estado::text <> 'enviado_redaccion')
    or (public.opera_redes() and estado::text in ('confirmado','enviado_redaccion') and categoria is distinct from 'Desaparecidos')
    or (public.tiene_rol('verificador') and public.es_verificado()
        and categoria is distinct from 'Desaparecidos' and estado::text <> 'enviado_redaccion')
    or (public.es_mando_busqueda() and categoria = 'Desaparecidos')
    or (public.es_busqueda() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and not public.caso_busqueda_es_nna(id))
    or (public.es_buscador_nna() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and public.caso_busqueda_es_nna(id))
    or (public.es_verificado() and public.tiene_rol('redaccion')
        and estado::text in ('confirmado','enviado_redaccion') and categoria is distinct from 'Desaparecidos')
    or (creado_por = auth.uid() and estado::text in ('pendiente','en_proceso') and public.identidad_aprobada())
  )
  with check (
    public.es_admin()
    or (public.opera_verificacion() and estado::text <> 'enviado_redaccion')
    or (public.opera_redes() and estado::text in ('confirmado','enviado_redaccion') and categoria is distinct from 'Desaparecidos')
    or (public.tiene_rol('verificador') and public.es_verificado()
        and categoria is distinct from 'Desaparecidos' and estado::text <> 'enviado_redaccion')
    or (public.es_mando_busqueda() and categoria = 'Desaparecidos')
    or (public.es_busqueda() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and not public.caso_busqueda_es_nna(id))
    or (public.es_buscador_nna() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and public.caso_busqueda_es_nna(id))
    or (public.es_verificado() and public.tiene_rol('redaccion')
        and estado::text in ('confirmado','enviado_redaccion') and categoria is distinct from 'Desaparecidos')
    or (creado_por = auth.uid() and estado::text in ('pendiente','en_proceso') and public.identidad_aprobada())
  );
