-- ============================================================
-- 0147 — Mandos de Verificación: revertir / gestionar solicitudes
-- ------------------------------------------------------------
-- Los LÍDERES y COORDINADORES del grupo de Verificación necesitan poder
-- «regresar a verificación» una solicitud ya finalizada (confirmada, enviada a
-- Redacción, descartada o resuelta) para corregir errores — igual que el admin.
--
-- es_mando_verificacion() = líder (grupos.lider_id) o coordinador
-- (miembros_grupo.rol_en_grupo='coordinador') del grupo con clave 'verificacion',
-- con su 2ª verificación (identidad) aprobada. Espejo EXACTO de
-- es_mando_recopilacion (0143), pero sobre el grupo de Verificación.
--
-- casos_update se REBASA sobre su versión vigente (0107) sumando SOLO la rama
-- nueva: estos mandos pueden ACTUALIZAR (y por tanto revertir) una solicitud de
-- «Otras informaciones» en CUALQUIER estado (incluido enviado_redaccion). Se
-- respeta la frontera con Búsqueda (nunca 'Desaparecidos'). El resto de ramas de
-- la política queda idéntico. Idempotente. Ejecutar tras 0146.
-- ============================================================

create or replace function public.es_mando_verificacion()
returns boolean language sql stable security definer set search_path = public as $$
  select public.identidad_aprobada() and (
    exists (select 1 from public.grupos g
            where g.clave = 'verificacion' and g.lider_id = auth.uid())
    or exists (select 1 from public.grupos g
               join public.miembros_grupo m on m.grupo_id = g.id
               where g.clave = 'verificacion' and m.perfil_id = auth.uid()
                 and m.rol_en_grupo = 'coordinador')
  );
$$;
grant execute on function public.es_mando_verificacion() to authenticated;

-- casos_update (base 0107) + rama de los mandos de Verificación (gestionar/revertir).
drop policy if exists "casos_update" on public.casos;
create policy "casos_update" on public.casos for update to authenticated
  using (
    public.es_admin()
    or (public.opera_verificacion() and estado::text <> 'enviado_redaccion')
    or (public.opera_redes() and estado::text in ('confirmado','enviado_redaccion') and categoria is distinct from 'Desaparecidos')
    or (public.tiene_rol('verificador') and public.es_verificado()
        and categoria is distinct from 'Desaparecidos' and estado::text <> 'enviado_redaccion')
    or (public.es_mando_verificacion() and categoria is distinct from 'Desaparecidos')
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
    or (public.es_mando_verificacion() and categoria is distinct from 'Desaparecidos')
    or (public.es_mando_busqueda() and categoria = 'Desaparecidos')
    or (public.es_busqueda() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and not public.caso_busqueda_es_nna(id))
    or (public.es_buscador_nna() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and public.caso_busqueda_es_nna(id))
    or (public.es_verificado() and public.tiene_rol('redaccion')
        and estado::text in ('confirmado','enviado_redaccion') and categoria is distinct from 'Desaparecidos')
    or (creado_por = auth.uid() and estado::text in ('pendiente','en_proceso') and public.identidad_aprobada())
  );
