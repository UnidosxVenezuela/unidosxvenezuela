-- ============================================================
-- 0009 — Observador = solo lectura + verificación + fix lecturas
-- ============================================================
-- NO reescribe proteger_campos_perfil ni puede_crear_tareas: viven en
-- 0008_seguridad_escalada.sql (con guard auth.uid() is not null que
-- permite el bootstrap del primer admin por service_role).
-- ============================================================

create or replace function public.es_verificado()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and verificado);
$$;

-- (c) Observador no publica ni comenta.
drop policy if exists "pub_insert" on public.publicaciones;
create policy "pub_insert" on public.publicaciones for insert
  to authenticated
  with check (autor_id = auth.uid() and public.mi_rol() <> 'observador');

drop policy if exists "comtarea_insert" on public.comentarios_tarea;
create policy "comtarea_insert" on public.comentarios_tarea for insert
  to authenticated
  with check (autor_id = auth.uid() and public.mi_rol() <> 'observador');

drop policy if exists "compub_insert" on public.comentarios_publicacion;
create policy "compub_insert" on public.comentarios_publicacion for insert
  to authenticated
  with check (autor_id = auth.uid() and public.mi_rol() <> 'observador');

-- Observador no toma tareas (conserva el resto del comportamiento de 0006).
create or replace function public.tomar_tarea(p_tarea uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.mi_rol() = 'observador' then
    raise exception 'Los observadores no pueden tomar tareas.' using errcode = '42501';
  end if;
  update public.tareas
     set asignado_a = auth.uid(), estado = 'asignada'
   where id = p_tarea and asignado_a is null;
  if not found then
    raise exception 'La tarea ya fue tomada o no existe.';
  end if;
end; $$;

-- Lectura de comentarios respeta la visibilidad del padre.
drop policy if exists "comtarea_lectura" on public.comentarios_tarea;
create policy "comtarea_lectura" on public.comentarios_tarea for select
  to authenticated
  using (
    exists (
      select 1 from public.tareas t
      where t.id = tarea_id
        and (
          public.es_coordinacion()
          or t.asignado_a = auth.uid()
          or t.creado_por = auth.uid()
          or (t.grupo_id is not null and public.es_miembro_de(t.grupo_id))
          or (t.asignado_a is null and t.estado = 'pendiente')
        )
    )
  );

drop policy if exists "compub_lectura" on public.comentarios_publicacion;
create policy "compub_lectura" on public.comentarios_publicacion for select
  to authenticated
  using (
    exists (
      select 1 from public.publicaciones p
      where p.id = publicacion_id
        and (
          public.es_coordinacion()
          or p.autor_id = auth.uid()
          or p.sensibilidad in ('publica', 'interna')
          or (p.sensibilidad = 'restringida'
              and p.grupo_id is not null and public.es_miembro_de(p.grupo_id))
        )
    )
  );
