-- ============================================================
-- 0143 — Supervisión de Recopilación: líderes y coordinadores ven el área
-- ------------------------------------------------------------
-- El equipo de Recopilación («gestion_casos») creaba y veía SOLO sus propias
-- solicitudes (la rama `creado_por` de casos_select). Sus LÍDERES y COORDINADORES
-- no tenían forma de supervisar el trabajo del equipo. Aquí se les da esa
-- supervisión de SOLO LECTURA sobre las solicitudes de «Otras informaciones» (el
-- dominio de Recopilación/Verificación) — igual que ya la tienen el admin de
-- Verificaciones (opera_verificacion) y el rol verificador. No se les da poder de
-- edición (casos_update no cambia): supervisan y ven, no confirman ni descartan.
--
-- es_mando_recopilacion() = líder (grupos.lider_id) o coordinador
-- (miembros_grupo.rol_en_grupo='coordinador') del grupo con clave 'gestion_casos',
-- con su 2ª verificación (identidad) aprobada. Espejo de es_mando_busqueda (0106),
-- pero usando el coordinador POR GRUPO (no el rol global 'coordinador', ya deprecado).
--
-- casos_select se REBASA sobre su versión vigente (0106) sumando SOLO la rama nueva
-- (misma lección de 0105/0106). Idempotente. Ejecutar tras 0142.
-- ============================================================

create or replace function public.es_mando_recopilacion()
returns boolean language sql stable security definer set search_path = public as $$
  select public.identidad_aprobada() and (
    exists (select 1 from public.grupos g
            where g.clave = 'gestion_casos' and g.lider_id = auth.uid())
    or exists (select 1 from public.grupos g
               join public.miembros_grupo m on m.grupo_id = g.id
               where g.clave = 'gestion_casos' and m.perfil_id = auth.uid()
                 and m.rol_en_grupo = 'coordinador')
  );
$$;
grant execute on function public.es_mando_recopilacion() to authenticated;

-- casos_select (base 0106) + rama de supervisión de los mandos de Recopilación.
drop policy if exists "casos_select" on public.casos;
create policy "casos_select" on public.casos for select to authenticated
  using (public.es_verificado() and (
    public.es_admin()
    or public.opera_verificacion()
    or (public.opera_redes() and estado::text in ('confirmado','enviado_redaccion')
        and categoria is distinct from 'Desaparecidos')
    or (public.tiene_rol('verificador') and categoria is distinct from 'Desaparecidos')
    or (public.es_mando_recopilacion() and categoria is distinct from 'Desaparecidos')
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
