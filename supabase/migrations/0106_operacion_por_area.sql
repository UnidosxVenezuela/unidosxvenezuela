-- ============================================================
-- 0106 — Operación COMPLETA del admin de área (con llave de 2ª verificación)
-- ------------------------------------------------------------
-- Fase 4: el admin de área deja de ser solo supervisor de LECTURA (0105) y pasa a
-- OPERAR su área por completo — pero solo cuando su identidad (2ª verificación) esté
-- APROBADA por un admin general o el superadmin (en /admin/verificaciones, exclusivo de
-- ellos). Doble llave: el rol lo asigna el admin general/super, y la identidad la aprueba
-- el admin general/super. Sin identidad aprobada, el admin de área no ve ni toca datos
-- operativos (solo su panel de personas).
--
--   · opera_verificacion() = es_admin_verificacion() AND identidad_aprobada()
--   · opera_redes()        = es_admin_redes()        AND identidad_aprobada()
--
-- Se inyectan en los CHOKE POINTS (no en decenas de policies): al hacer del admin de
-- Verificaciones un «mando de búsqueda», hereda todo el flujo (búsqueda adultos+NNA,
-- aprobar/cerrar/derivar/custodia, bitácora, coincidencias y las policies de
-- busqueda_casos), y al sumarlo a puede_digitalizar/puede_pipeline/puede_editar_etapa,
-- hereda digitalización / contenido. Solo casos y unas pocas policies directas se tocan.
-- Cada función/policy se reconstruye desde su versión VIGENTE (no se revierte nada; la
-- eliminación de casos y la moderación de lugares siguen siendo del admin general).
-- Idempotente. Ejecutar tras 0105.
-- ============================================================

-- ── 1) Predicados de operación por área (rol de área + 2ª verificación) ──
create or replace function public.opera_verificacion()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin_verificacion() and public.identidad_aprobada();
$$;
grant execute on function public.opera_verificacion() to authenticated;

create or replace function public.opera_redes()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin_redes() and public.identidad_aprobada();
$$;
grant execute on function public.opera_redes() to authenticated;

-- ── 2) es_mando_busqueda: el admin de Verificaciones (con identidad) es mando de su área ──
-- Base: 0093. Este es el choke point de mayor alcance: fluye por el trigger de blindaje,
-- por las policies de busqueda_casos (insert/update/delete), por puede_atender_busqueda
-- (bitácora) y por TODAS las RPC del mando/enlace (aprobar/cerrar/derivar/custodia/
-- confirmar). El admin de Verificaciones queda habilitado para adultos y NNA.
create or replace function public.es_mando_busqueda()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or public.opera_verificacion() or (
    public.identidad_aprobada() and (
      exists (select 1 from public.grupos g
              where g.clave in ('busqueda','busqueda_nna') and g.lider_id = auth.uid())
      or (public.tiene_rol('coordinador') and exists (
            select 1 from public.grupos g
            join public.miembros_grupo m on m.grupo_id = g.id
            where g.clave in ('busqueda','busqueda_nna') and m.perfil_id = auth.uid()))
    )
  );
$$;

-- ── 3) puede_digitalizar: el admin de Verificaciones (con identidad) digitaliza. Base: 0081 ──
-- Cubre listados/personas/lugares (insert/update) vía puede_ver_listado, el bucket
-- 'digitalizacion' y la RPC resolver_lugar.
create or replace function public.puede_digitalizar()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or public.opera_verificacion()
      or (public.es_digitalizador() and public.identidad_aprobada());
$$;

-- ── 4) Contenido: el admin de Redes (con identidad) opera el pipeline. Base: 0064 ──
create or replace function public.puede_pipeline()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_verificado() and (public.opera_redes() or (public.mis_roles() && array[
    'admin','coordinador','redaccion','diseno_grafico','edicion_video','redes_sociales','influencers'
  ]::public.rol_usuario[]));
$$;

create or replace function public.puede_editar_etapa(p_etapa public.etapa_contenido)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_coordinacion() or public.opera_redes()
     or public.tiene_rol('influencers')
     or case p_etapa
          when 'redaccion' then public.tiene_rol('redaccion')
          when 'diseno'    then public.tiene_rol('diseno_grafico')
          when 'video'     then public.tiene_rol('edicion_video')
          when 'redes'     then public.tiene_rol('redes_sociales')
          else false
        end;
$$;

-- ── 5) casos: crear/editar (Verificaciones) + handoff a Redacción (Redes) ──
-- casos_insert base 0078: el admin de Verificaciones también crea casos.
drop policy if exists "casos_insert" on public.casos;
create policy "casos_insert" on public.casos for insert to authenticated
  with check (public.es_verificado() and creado_por = auth.uid() and (
    public.es_admin()
    or public.opera_verificacion()
    or (public.tiene_rol('recopilacion') and public.identidad_aprobada())
  ));

-- casos_update base 0093 + rama Verificaciones (cualquier caso salvo ya enviado a
-- Redacción; Desaparecidos ya cubierto por es_mando_busqueda) + rama Redes (confirmados/
-- enviados no-Desaparecidos, como Redacción). Lectura del admin de área con identidad.
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
    or (creado_por = auth.uid() and estado::text = 'en_proceso' and public.identidad_aprobada())
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
    or (creado_por = auth.uid() and estado::text = 'en_proceso' and public.identidad_aprobada())
  );

-- casos_select (base 0105): endurecer la lectura del admin de área para EXIGIR identidad.
drop policy if exists "casos_select" on public.casos;
create policy "casos_select" on public.casos for select to authenticated
  using (public.es_verificado() and (
    public.es_admin()
    or public.opera_verificacion()
    or (public.opera_redes() and estado::text in ('confirmado','enviado_redaccion')
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

-- El handoff «Enviar a Redacción» también lo hace el admin de Redes. Base: 0078.
create or replace function public.enviar_caso_redaccion(p_caso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado public.estado_caso; v_cat text;
begin
  if not (public.tiene_rol('admin') or public.tiene_rol('redaccion') or public.opera_redes()) then
    raise exception 'Solo el equipo de Redacción puede hacer esto.' using errcode='42501';
  end if;
  select estado, categoria into v_estado, v_cat from public.casos where id = p_caso;
  if not found then raise exception 'Caso no encontrado.'; end if;
  if v_estado::text <> 'confirmado' then raise exception 'Solo se envían casos confirmados.'; end if;
  if v_cat is not distinct from 'Desaparecidos' then
    raise exception 'Los casos de Desaparecidos no pasan a Redacción; los gestiona el Grupo de Búsqueda.' using errcode='42501';
  end if;
  update public.casos set estado = 'enviado_redaccion', actualizado_en = now() where id = p_caso;
end $$;

-- ── 6) Coincidencias: el admin de Verificaciones también descarta/gestiona. Base: 0083 ──
-- (Confirmar sigue encauzado por la RPC + el trigger coincidencias_gate, que ya admite
-- al mando; el admin de Verificaciones es mando por el punto 2.) Lectura endurecida a
-- identidad en el punto 7.
drop policy if exists coincidencias_update on public.coincidencias;
create policy coincidencias_update on public.coincidencias for update to authenticated
  using (public.es_admin() or public.opera_verificacion() or (public.es_busqueda() and public.identidad_aprobada()))
  with check (public.es_admin() or public.opera_verificacion() or (public.es_busqueda() and public.identidad_aprobada()));

-- ── 7) Endurecer las LECTURAS de 0105: exigir identidad al admin de área ──
-- (casos_select ya endurecido arriba.)
drop policy if exists "busqueda_casos_select" on public.busqueda_casos;
create policy "busqueda_casos_select" on public.busqueda_casos for select to authenticated
  using (
    public.es_admin()
    or public.opera_verificacion()
    or public.es_mando_busqueda()
    or (public.es_busqueda() and public.identidad_aprobada() and es_nna = false)
    or (public.es_buscador_nna() and public.identidad_aprobada() and es_nna = true)
    or (public.es_enlace() and public.identidad_aprobada()
        and estado_busqueda not in ('activo','en_revision'))
  );

drop policy if exists coincidencias_select on public.coincidencias;
create policy coincidencias_select on public.coincidencias for select to authenticated
  using (public.es_admin() or public.opera_verificacion()
         or (public.es_busqueda() and public.identidad_aprobada()));

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
  where public.es_admin() or public.opera_verificacion()
        or (public.es_busqueda() and public.identidad_aprobada())
  order by (c.estado = 'nueva') desc, c.creado_en desc
  limit 300;
$$;

drop policy if exists "bitacora_busqueda_select" on public.bitacora_busqueda;
create policy "bitacora_busqueda_select" on public.bitacora_busqueda for select to authenticated
  using (public.es_admin() or public.opera_verificacion() or public.puede_atender_busqueda(caso_id));

drop policy if exists "piezas_lectura" on public.piezas_contenido;
create policy "piezas_lectura" on public.piezas_contenido for select to authenticated
  using (public.puede_pipeline() or public.opera_redes());

-- Digitalización: las lecturas de 0105 (rama es_admin_verificacion sin identidad) se
-- reemplazan por la vía puede_ver_listado/puede_digitalizar, que ahora incluye al admin
-- de Verificaciones CON identidad (punto 3). Así queda una sola fuente y con la llave.
drop policy if exists listados_select on public.listados_digitalizados;
create policy listados_select on public.listados_digitalizados for select to authenticated
  using (public.puede_ver_listado(tipo_lugar));

drop policy if exists personas_select on public.personas_listado;
create policy personas_select on public.personas_listado for select to authenticated
  using (exists (select 1 from public.listados_digitalizados l
                 where l.id = listado_id and public.puede_ver_listado(l.tipo_lugar)));

drop policy if exists lugares_select on public.lugares;
create policy lugares_select on public.lugares for select to authenticated
  using (public.puede_digitalizar());

drop policy if exists digitalizacion_select on storage.objects;
create policy digitalizacion_select on storage.objects for select to authenticated
  using (bucket_id = 'digitalizacion' and public.puede_digitalizar());

-- ── 8) Adjuntos de casos: el admin de área también sube/ve (su área). Base: 0093 ──
drop policy if exists "adjuntos_casos" on storage.objects;
create policy "adjuntos_casos" on storage.objects for all to authenticated
  using (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = 'casos'
         and (public.tiene_rol('admin') or public.tiene_rol('verificador')
              or public.es_busqueda() or public.es_buscador_nna()
              or public.tiene_rol('redaccion') or public.tiene_rol('recopilacion')
              or public.opera_verificacion() or public.opera_redes()))
  with check (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = 'casos'
         and (public.tiene_rol('admin') or public.tiene_rol('verificador')
              or public.es_busqueda() or public.es_buscador_nna() or public.tiene_rol('recopilacion')
              or public.opera_verificacion()));

-- ── 9) Registro de actividad de casos (monitoreo): también el admin de área. Base: 0093 ──
create or replace function public.registrar_evento_caso(p_caso uuid, p_accion text)
returns void language plpgsql security definer set search_path = public as $$
declare v_acc text := case p_accion when 'descarga' then 'descarga' when 'edicion' then 'edicion' else 'copia' end;
begin
  if not (public.es_verificado() and (
      public.tiene_rol('admin') or public.tiene_rol('verificador') or public.es_busqueda()
      or public.es_buscador_nna() or public.tiene_rol('recopilacion') or public.tiene_rol('redaccion')
      or public.opera_verificacion() or public.opera_redes())) then
    raise exception 'No tienes permiso para registrar esta actividad.' using errcode = '42501';
  end if;
  insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
  values (auth.uid(), 'casos:' || v_acc, 'casos', p_caso::text,
          jsonb_build_object('caso_id', p_caso::text));
end; $$;
