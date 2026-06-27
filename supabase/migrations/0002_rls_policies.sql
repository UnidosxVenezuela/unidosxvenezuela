-- ============================================================
-- Plataforma Unidos — Seguridad a nivel de fila (RLS)
-- ============================================================
-- Principio: denegar por defecto. Cada tabla activa RLS y solo
-- se permite lo declarado explícitamente. Las funciones auxiliares
-- (mi_rol, es_admin, es_coordinacion, es_miembro_de) viven en 0001.
-- ============================================================

alter table public.perfiles               enable row level security;
alter table public.areas                   enable row level security;
alter table public.grupos                  enable row level security;
alter table public.miembros_grupo          enable row level security;
alter table public.tareas                  enable row level security;
alter table public.comentarios_tarea       enable row level security;
alter table public.publicaciones           enable row level security;
alter table public.comentarios_publicacion enable row level security;
alter table public.notificaciones          enable row level security;
alter table public.registro_auditoria      enable row level security;

-- ------------------------------------------------------------
-- perfiles
-- ------------------------------------------------------------
-- Cualquier usuario autenticado ve perfiles (directorio básico del operativo).
create policy "perfiles_lectura_autenticados"
  on public.perfiles for select
  to authenticated using (true);

-- Cada quien edita su propio perfil (no puede auto-promocionarse de rol:
-- el cambio de rol se gestiona desde el panel admin con la service key).
create policy "perfiles_actualiza_propio"
  on public.perfiles for update
  to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- La coordinación puede actualizar cualquier perfil (verificar, asignar rol).
create policy "perfiles_admin_total"
  on public.perfiles for all
  to authenticated using (public.es_coordinacion()) with check (public.es_coordinacion());

-- ------------------------------------------------------------
-- areas  (catálogo: lectura para todos; escritura solo admin)
-- ------------------------------------------------------------
create policy "areas_lectura" on public.areas for select
  to authenticated using (true);
create policy "areas_admin" on public.areas for all
  to authenticated using (public.es_admin()) with check (public.es_admin());

-- ------------------------------------------------------------
-- grupos
-- ------------------------------------------------------------
create policy "grupos_lectura" on public.grupos for select
  to authenticated using (true);

-- Crear/editar grupos: coordinación; el líder puede editar su grupo.
create policy "grupos_insert_coord" on public.grupos for insert
  to authenticated with check (public.es_coordinacion());
create policy "grupos_update_coord_o_lider" on public.grupos for update
  to authenticated
  using (public.es_coordinacion() or lider_id = auth.uid())
  with check (public.es_coordinacion() or lider_id = auth.uid());
create policy "grupos_delete_coord" on public.grupos for delete
  to authenticated using (public.es_coordinacion());

-- ------------------------------------------------------------
-- miembros_grupo
-- ------------------------------------------------------------
-- Ves la membresía si eres del grupo o coordinación.
create policy "miembros_lectura" on public.miembros_grupo for select
  to authenticated
  using (public.es_coordinacion() or public.es_miembro_de(grupo_id));

-- Añadir/quitar miembros: coordinación o el líder del grupo.
create policy "miembros_gestion" on public.miembros_grupo for all
  to authenticated
  using (
    public.es_coordinacion()
    or exists (select 1 from public.grupos g
               where g.id = grupo_id and g.lider_id = auth.uid())
  )
  with check (
    public.es_coordinacion()
    or exists (select 1 from public.grupos g
               where g.id = grupo_id and g.lider_id = auth.uid())
  );

-- ------------------------------------------------------------
-- tareas
-- ------------------------------------------------------------
-- Lectura: coordinación ve todo; el resto ve tareas de sus grupos,
-- las que tiene asignadas o las que creó.
create policy "tareas_lectura" on public.tareas for select
  to authenticated
  using (
    public.es_coordinacion()
    or asignado_a = auth.uid()
    or creado_por = auth.uid()
    or (grupo_id is not null and public.es_miembro_de(grupo_id))
  );

-- Crear: cualquier miembro autenticado y verificado del operativo.
create policy "tareas_insert" on public.tareas for insert
  to authenticated
  with check (creado_por = auth.uid());

-- Editar: la persona asignada, el creador, coordinación o el líder del grupo.
create policy "tareas_update" on public.tareas for update
  to authenticated
  using (
    public.es_coordinacion()
    or asignado_a = auth.uid()
    or creado_por = auth.uid()
    or exists (select 1 from public.grupos g
               where g.id = grupo_id and g.lider_id = auth.uid())
  );

create policy "tareas_delete_coord" on public.tareas for delete
  to authenticated using (public.es_coordinacion() or creado_por = auth.uid());

-- Comentarios de tarea: ve/escribe quien puede ver la tarea.
create policy "comtarea_lectura" on public.comentarios_tarea for select
  to authenticated
  using (exists (select 1 from public.tareas t where t.id = tarea_id));
create policy "comtarea_insert" on public.comentarios_tarea for insert
  to authenticated with check (autor_id = auth.uid());

-- ------------------------------------------------------------
-- publicaciones (tablón) — visibilidad según sensibilidad
-- ------------------------------------------------------------
create policy "pub_lectura" on public.publicaciones for select
  to authenticated
  using (
    public.es_coordinacion()
    or autor_id = auth.uid()
    or (sensibilidad = 'publica')
    or (sensibilidad = 'interna')
    or (sensibilidad = 'restringida'
        and grupo_id is not null and public.es_miembro_de(grupo_id))
    -- 'confidencial' solo coordinación (cubierto arriba) y autor.
  );

create policy "pub_insert" on public.publicaciones for insert
  to authenticated with check (autor_id = auth.uid());
create policy "pub_update_propia_o_coord" on public.publicaciones for update
  to authenticated using (autor_id = auth.uid() or public.es_coordinacion());
create policy "pub_delete_propia_o_coord" on public.publicaciones for delete
  to authenticated using (autor_id = auth.uid() or public.es_coordinacion());

create policy "compub_lectura" on public.comentarios_publicacion for select
  to authenticated
  using (exists (select 1 from public.publicaciones p where p.id = publicacion_id));
create policy "compub_insert" on public.comentarios_publicacion for insert
  to authenticated with check (autor_id = auth.uid());

-- ------------------------------------------------------------
-- notificaciones — privadas del destinatario
-- ------------------------------------------------------------
create policy "notif_lectura_propia" on public.notificaciones for select
  to authenticated using (destinatario_id = auth.uid());
create policy "notif_update_propia" on public.notificaciones for update
  to authenticated using (destinatario_id = auth.uid());

-- ------------------------------------------------------------
-- registro_auditoria — solo coordinación puede leer; nadie escribe
-- directo (se llena por triggers / service role).
-- ------------------------------------------------------------
create policy "audit_lectura_coord" on public.registro_auditoria for select
  to authenticated using (public.es_coordinacion());
