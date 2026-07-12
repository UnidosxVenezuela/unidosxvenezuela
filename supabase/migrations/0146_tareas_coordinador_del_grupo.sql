-- ============================================================
-- 0146 — Los coordinadores del grupo gestionan las tareas de su grupo
-- ------------------------------------------------------------
-- Alinea la RLS con la interfaz. Hasta ahora, editar/gestionar una tarea (cambiar
-- estado, asignar, completar, sumar/quitar participantes) la BD lo permitía solo a:
-- admin, el asignado, el creador y el LÍDER del grupo. La interfaz, en cambio, muestra
-- esos controles también a los COORDINADORES del grupo (esCoordinacion) — que entonces
-- veían botones que la base rechazaba con un error.
--
-- Aquí se suma, en la RLS, al «coordinador del grupo de la tarea»
-- (miembros_grupo.rol_en_grupo = 'coordinador'), coherente con que los coordinadores ya
-- pueden CREAR tareas y publicar en su grupo. `rol_en_grupo` es TEXT con CHECK (0088),
-- así que se compara directo. Idempotente. Ejecutar tras 0145.
-- ============================================================

-- 1) Editar la tarea (estado / asignación / prioridad / cierre): + coordinador del grupo.
drop policy if exists "tareas_update" on public.tareas;
create policy "tareas_update" on public.tareas for update to authenticated
  using (
    public.es_admin()
    or asignado_a = auth.uid()
    or creado_por = auth.uid()
    or (grupo_id is not null and exists (
          select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid()))
    or (grupo_id is not null and exists (
          select 1 from public.miembros_grupo m
          where m.grupo_id = grupo_id and m.perfil_id = auth.uid() and m.rol_en_grupo = 'coordinador'))
  )
  with check (
    public.es_admin()
    or asignado_a = auth.uid()
    or creado_por = auth.uid()
    or (grupo_id is not null and exists (
          select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid()))
    or (grupo_id is not null and exists (
          select 1 from public.miembros_grupo m
          where m.grupo_id = grupo_id and m.perfil_id = auth.uid() and m.rol_en_grupo = 'coordinador'))
  );

-- 2) Sumar participantes (modelo de cupo): + coordinador del grupo.
drop policy if exists "tp_insert" on public.tarea_personas;
create policy "tp_insert" on public.tarea_personas for insert to authenticated
  with check (
    public.es_coordinacion()
    or exists (select 1 from public.tareas t where t.id = tarea_id
         and (t.creado_por = auth.uid()
              or exists (select 1 from public.grupos g where g.id = t.grupo_id and g.lider_id = auth.uid())
              or exists (select 1 from public.miembros_grupo m
                   where m.grupo_id = t.grupo_id and m.perfil_id = auth.uid() and m.rol_en_grupo = 'coordinador')))
  );

-- 3) Quitar participantes: uno mismo, o quien gestiona (+ coordinador del grupo).
drop policy if exists "tp_delete" on public.tarea_personas;
create policy "tp_delete" on public.tarea_personas for delete to authenticated
  using (
    perfil_id = auth.uid()
    or public.es_coordinacion()
    or exists (select 1 from public.tareas t where t.id = tarea_id
         and (t.creado_por = auth.uid()
              or exists (select 1 from public.grupos g where g.id = t.grupo_id and g.lider_id = auth.uid())
              or exists (select 1 from public.miembros_grupo m
                   where m.grupo_id = t.grupo_id and m.perfil_id = auth.uid() and m.rol_en_grupo = 'coordinador')))
  );

-- 4) puede_editar_tarea (adjuntos / comentarios / storage): + coordinador del grupo.
--    Se conserva la definición de 0026 y solo se AGREGA la rama del coordinador.
create or replace function public.puede_editar_tarea(p_tarea uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tareas t
    where t.id = p_tarea and (
      public.es_coordinacion()
      or t.asignado_a = auth.uid()
      or t.creado_por = auth.uid()
      or exists (select 1 from public.grupos g where g.id = t.grupo_id and g.lider_id = auth.uid())
      or exists (select 1 from public.miembros_grupo m
           where m.grupo_id = t.grupo_id and m.perfil_id = auth.uid() and m.rol_en_grupo = 'coordinador')
      or exists (select 1 from public.tarea_personas tp where tp.tarea_id = t.id and tp.perfil_id = auth.uid())
    )
  );
$$;
