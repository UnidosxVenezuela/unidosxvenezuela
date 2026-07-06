-- ============================================================
-- 0110 — Los admin de área ACCEDEN y SUPERVISAN (solo lectura) sus grupos
-- ------------------------------------------------------------
-- El admin de Verificaciones y el de Redes deben poder ENTRAR y SUPERVISAR los
-- grupos de SU área (miembros, tareas, anuncios, reuniones) aunque no sean
-- miembros ni líderes. Hasta ahora la RLS de las tablas de grupo era estricta por
-- membresía/liderazgo (0055/0056/0057), así que un admin de área ni siquiera podía
-- abrir la ficha del grupo.
--
-- Se añade `puede_supervisar_grupo(g)` (mapea el área del admin ↔ las `clave` de
-- sus grupos, igual que GRUPOS_POR_AREA_ADMIN en la app) y se OR-suma SOLO a las
-- políticas de LECTURA (select). La escritura (crear/gestionar) NO cambia: la
-- supervisión es de lectura, como la de 0105. Cada política se reescribe SOBRE su
-- versión vigente sumando ÚNICAMENTE la rama nueva (no revierte nada — lección 0104).
-- Idempotente. Ejecutar tras 0109.
-- ============================================================

create or replace function public.puede_supervisar_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or exists (
    select 1 from public.grupos g where g.id = p_grupo and (
      (public.es_admin_verificacion() and g.clave in
         ('gestion_casos','verificacion','busqueda','busqueda_nna','enlace_contacto','digitalizacion'))
      or (public.es_admin_redes() and g.clave in
         ('redaccion','redes_sociales','diseno_grafico','edicion_video','influencers'))
    )
  );
$$;
grant execute on function public.puede_supervisar_grupo(uuid) to authenticated;

-- ── grupos (imprescindible: sin esto no se abre la ficha) — rebase 0055:67-68 ──
drop policy if exists "grupos_select" on public.grupos;
create policy "grupos_select" on public.grupos for select to authenticated
  using (public.es_admin() or lider_id = auth.uid() or public.es_miembro_de(id)
         or public.puede_supervisar_grupo(id));

-- ── miembros_grupo — rebase 0055:73-75 ──
drop policy if exists "miembros_select" on public.miembros_grupo;
create policy "miembros_select" on public.miembros_grupo for select to authenticated
  using (public.es_admin() or perfil_id = auth.uid() or public.es_miembro_de(grupo_id)
         or exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid())
         or public.puede_supervisar_grupo(grupo_id));

-- ── tareas del grupo — rebase 0055:95-98 ──
drop policy if exists "tareas_select" on public.tareas;
create policy "tareas_select" on public.tareas for select to authenticated
  using (public.es_admin() or asignado_a = auth.uid() or creado_por = auth.uid()
         or (grupo_id is not null and public.es_miembro_de(grupo_id))
         or (grupo_id is not null and exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid()))
         or (grupo_id is not null and public.puede_supervisar_grupo(grupo_id)));

-- ── anuncios fijados — rebase 0056:31-33 ──
drop policy if exists "fijados_select" on public.mensajes_fijados;
create policy "fijados_select" on public.mensajes_fijados for select to authenticated
  using (public.es_admin() or public.es_miembro_de(grupo_id)
         or exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid())
         or public.puede_supervisar_grupo(grupo_id));

-- ── reuniones — rebase 0057:68-70 ──
drop policy if exists "reuniones_select" on public.reuniones;
create policy "reuniones_select" on public.reuniones for select to authenticated
  using (public.es_admin() or public.es_miembro_de(grupo_id)
         or exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid())
         or public.puede_supervisar_grupo(grupo_id));
