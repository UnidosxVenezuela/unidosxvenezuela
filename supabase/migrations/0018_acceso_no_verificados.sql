-- ============================================================
-- 0018 — Acceso limitado hasta verificación + motivo + aviso
-- ============================================================
-- Rescatado y reconciliado desde la rama de seguridad. Un usuario sin
-- verificar puede entrar y TOMAR TAREAS ABIERTAS (colaborar desde el
-- minuto uno), pero NO ve el directorio de personas, grupos, tablón ni
-- mapa, ni puede publicar/comentar, hasta que la coordinación lo aprueba.
-- (es_verificado() ya existe desde 0009.)
-- ============================================================

-- ---- Lecturas que ahora requieren verificación ----
drop policy if exists "perfiles_lectura_autenticados" on public.perfiles;
drop policy if exists "perfiles_lectura" on public.perfiles;
create policy "perfiles_lectura" on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_verificado() or public.es_coordinacion());

drop policy if exists "grupos_lectura" on public.grupos;
create policy "grupos_lectura" on public.grupos for select to authenticated
  using (public.es_verificado() or public.es_coordinacion());

drop policy if exists "pub_lectura" on public.publicaciones;
create policy "pub_lectura" on public.publicaciones for select to authenticated
  using (
    public.es_coordinacion()
    or autor_id = auth.uid()
    or (public.es_verificado() and (
      sensibilidad in ('publica', 'interna')
      or (sensibilidad = 'restringida' and grupo_id is not null and public.es_miembro_de(grupo_id))
    ))
  );

drop policy if exists "acopio_lectura" on public.puntos_acopio;
create policy "acopio_lectura" on public.puntos_acopio for select to authenticated
  using (public.es_verificado() or public.es_coordinacion());

-- ---- Escrituras: verificado y NO observador ----
drop policy if exists "acopio_insert" on public.puntos_acopio;
create policy "acopio_insert" on public.puntos_acopio for insert to authenticated
  with check (creado_por = auth.uid() and public.es_verificado());

drop policy if exists "pub_insert" on public.publicaciones;
create policy "pub_insert" on public.publicaciones for insert to authenticated
  with check (autor_id = auth.uid() and public.es_verificado() and public.mi_rol() <> 'observador');

drop policy if exists "compub_insert" on public.comentarios_publicacion;
create policy "compub_insert" on public.comentarios_publicacion for insert to authenticated
  with check (autor_id = auth.uid() and public.es_verificado() and public.mi_rol() <> 'observador');

drop policy if exists "comtarea_insert" on public.comentarios_tarea;
create policy "comtarea_insert" on public.comentarios_tarea for insert to authenticated
  with check (autor_id = auth.uid() and public.es_verificado() and public.mi_rol() <> 'observador');

-- ---- Motivo de la solicitud + alta que arrastra organización y motivo ----
alter table public.perfiles add column if not exists motivo text;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre_completo, telefono, organizacion, motivo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre_completo', ''),
    coalesce(new.raw_user_meta_data ->> 'telefono', new.phone),
    new.raw_user_meta_data ->> 'organizacion',
    new.raw_user_meta_data ->> 'motivo'
  );
  return new;
end; $$;

-- ---- Aviso a la coordinación ante una solicitud nueva ----
create or replace function public.notificar_registro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.verificado = false then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select p.id, 'registro_nuevo',
           'Nueva solicitud de acceso',
           coalesce(nullif(new.nombre_completo, ''), 'Alguien') || ' espera verificación.',
           '/admin/usuarios'
    from public.perfiles p
    where p.rol in ('admin', 'coordinador');
  end if;
  return new;
end; $$;

drop trigger if exists trg_perfiles_notificar_registro on public.perfiles;
create trigger trg_perfiles_notificar_registro
  after insert on public.perfiles
  for each row execute function public.notificar_registro();
