-- ============================================================
-- Seguridad: cerrar auto-escalada de privilegios y endurecer
-- la creación de tareas (RLS = fuente de verdad).
-- ============================================================

-- 1) Un usuario NO puede cambiarse su propio rol ni 'verificado'.
--    Solo la coordinación (o un contexto sin sesión: service_role /
--    SQL editor, donde auth.uid() es null) puede modificarlos.
create or replace function public.proteger_campos_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.rol is distinct from old.rol
      or new.verificado is distinct from old.verificado)
     and auth.uid() is not null
     and not public.es_coordinacion() then
    raise exception 'No puedes cambiar tu rol ni tu estado de verificación.';
  end if;
  return new;
end; $$;

drop trigger if exists trg_proteger_perfil on public.perfiles;
create trigger trg_proteger_perfil
  before update on public.perfiles
  for each row execute function public.proteger_campos_perfil();

-- 2) Crear tareas: solo gestores (admin / coordinador / líder de grupo).
create or replace function public.puede_crear_tareas()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol in ('admin', 'coordinador', 'lider_grupo')
  );
$$;

drop policy if exists "tareas_insert" on public.tareas;
create policy "tareas_insert" on public.tareas for insert
  to authenticated
  with check (creado_por = auth.uid() and public.puede_crear_tareas());
