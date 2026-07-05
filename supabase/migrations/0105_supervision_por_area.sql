-- ============================================================
-- 0105 — Supervisión (LECTURA) de casos/contenido por administración de área
-- ------------------------------------------------------------
-- Fase 3B: el admin de área puede VER (solo lectura) los datos operativos de SU área,
-- para supervisar — no para operar. No se toca ninguna policy de escritura, así que las
-- mutaciones (crear caso, tomar, aprobar coincidencia, cambiar estado, editar contenido…)
-- siguen bloqueadas para el admin de área tanto por la RLS de escritura como por las
-- Server Actions (que exigen los roles operativos).
--
--   · Admin de Verificaciones (es_admin_verificacion) → lee TODO su área: casos (incluye
--     Desaparecidos y NNA), fichas de búsqueda (incl. NNA), coincidencias, bitácora y la
--     digitalización (listados, personas, lugares y los documentos escaneados). Decisión
--     explícita del dueño: es un perfil elegido con mucho cuidado y supervisa la búsqueda,
--     que incluye a los menores. NO exige 2ª verificación (opera como un admin acotado).
--   · Admin de Redes (es_admin_redes) → lee el pipeline de contenido (piezas) y los casos
--     confirmados/enviados a Redacción que NO son Desaparecidos (la mesa de Envío a Redacción).
--
-- Cada policy/función se reconstruye desde su versión VIGENTE (la de mayor número) y solo se
-- le AÑADE la rama del admin de área — sin revertir nada (lección de 0104). Idempotente.
-- ============================================================

-- ── 1) casos: el admin de Verificaciones ve todos; el de Redes, los de contenido ──
-- Base: 0094 (última definición de casos_select).
drop policy if exists "casos_select" on public.casos;
create policy "casos_select" on public.casos for select to authenticated
  using (public.es_verificado() and (
    public.es_admin()
    or public.es_admin_verificacion()
    or (public.es_admin_redes() and estado::text in ('confirmado','enviado_redaccion')
        and categoria is distinct from 'Desaparecidos')
    or (public.tiene_rol('verificador') and categoria is distinct from 'Desaparecidos')
    or (public.es_mando_busqueda() and categoria = 'Desaparecidos')
    or (public.es_busqueda() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and not public.caso_busqueda_es_nna(id))
    or (public.es_buscador_nna() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and public.caso_busqueda_es_nna(id))
    or (public.es_enlace() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and public.caso_busqueda_etapa_enlace(id))
    or (public.tiene_rol('redaccion') and estado::text in ('confirmado','enviado_redaccion')
        and categoria is distinct from 'Desaparecidos')
    or (creado_por = auth.uid() and public.identidad_aprobada())
  ));

-- ── 2) busqueda_casos: el admin de Verificaciones ve todas las fichas (incl. NNA) ──
-- Base: 0094 (última definición de busqueda_casos_select).
drop policy if exists "busqueda_casos_select" on public.busqueda_casos;
create policy "busqueda_casos_select" on public.busqueda_casos for select to authenticated
  using (
    public.es_admin()
    or public.es_admin_verificacion()
    or public.es_mando_busqueda()
    or (public.es_busqueda() and public.identidad_aprobada() and es_nna = false)
    or (public.es_buscador_nna() and public.identidad_aprobada() and es_nna = true)
    or (public.es_enlace() and public.identidad_aprobada()
        and estado_busqueda not in ('activo','en_revision'))
  );

-- ── 3) coincidencias: lectura para el admin de Verificaciones ──
-- Base: 0083 (única definición de coincidencias_select).
drop policy if exists coincidencias_select on public.coincidencias;
create policy coincidencias_select on public.coincidencias for select to authenticated
  using (public.es_admin() or public.es_admin_verificacion()
         or (public.es_busqueda() and public.identidad_aprobada()));

-- La página /coincidencias no lee la tabla directo, sino esta RPC (SECURITY DEFINER con
-- su propio gate en el WHERE). Se reconstruye la versión VIGENTE (0083) y se añade la rama.
create or replace function public.listar_coincidencias()
returns table (
  id uuid, estado text, motivo text, creado_en timestamptz,
  persona_nombre text, persona_cedula text, persona_edad int, persona_condicion text, es_menor boolean,
  lugar_nombre text, lugar_tipo text,
  caso_id uuid, caso_numero bigint, caso_titulo text
) language sql stable security definer set search_path = public as $$
  select c.id, c.estado, c.motivo, c.creado_en,
         p.nombre_completo, p.cedula, p.edad, p.condicion,
         (p.edad is not null and p.edad < 18),
         l.nombre, l.tipo,
         ca.id, ca.numero, ca.titulo
  from public.coincidencias c
  join public.personas_listado p on p.id = c.persona_listado_id
  left join public.listados_digitalizados ld on ld.id = p.listado_id
  left join public.lugares l on l.id = ld.lugar_id
  join public.casos ca on ca.id = c.caso_id
  where public.es_admin() or public.es_admin_verificacion()
        or (public.es_busqueda() and public.identidad_aprobada())
  order by (c.estado = 'nueva') desc, c.creado_en desc
  limit 300;
$$;

-- ── 4) bitácora de búsqueda: lectura para el admin de Verificaciones ──
-- Base: 0087 (única definición de bitacora_busqueda_select).
drop policy if exists "bitacora_busqueda_select" on public.bitacora_busqueda;
create policy "bitacora_busqueda_select" on public.bitacora_busqueda for select to authenticated
  using (public.es_admin() or public.es_admin_verificacion() or public.puede_atender_busqueda(caso_id));

-- ── 5) piezas de contenido: lectura para el admin de Redes ──
-- Base: 0037 (única definición de piezas_lectura; 0064 solo redefine piezas_insert).
drop policy if exists "piezas_lectura" on public.piezas_contenido;
create policy "piezas_lectura" on public.piezas_contenido for select to authenticated
  using (public.puede_pipeline() or public.es_admin_redes());

-- ── 6) Digitalización: lectura para el admin de Verificaciones ──
-- Base: 0080 (listados_select, personas_select, storage digitalizacion_select) y 0082 (lugares_select).
drop policy if exists listados_select on public.listados_digitalizados;
create policy listados_select on public.listados_digitalizados for select to authenticated
  using (public.es_admin_verificacion() or public.puede_ver_listado(tipo_lugar));

drop policy if exists personas_select on public.personas_listado;
create policy personas_select on public.personas_listado for select to authenticated
  using (public.es_admin_verificacion()
         or exists (select 1 from public.listados_digitalizados l
                    where l.id = listado_id and public.puede_ver_listado(l.tipo_lugar)));

drop policy if exists lugares_select on public.lugares;
create policy lugares_select on public.lugares for select to authenticated
  using (public.es_admin_verificacion() or public.puede_digitalizar());

-- Documentos escaneados (bucket 'digitalizacion'): lectura para el admin de Verificaciones.
drop policy if exists digitalizacion_select on storage.objects;
create policy digitalizacion_select on storage.objects for select to authenticated
  using (bucket_id = 'digitalizacion' and (public.puede_digitalizar() or public.es_admin_verificacion()));
