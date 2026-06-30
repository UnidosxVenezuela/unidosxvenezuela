-- 0038: El rol 'recopilacion' puede ENVIAR (crear) y VER casos, pero NO verificarlos.
-- Verificación (cambiar estado / asignar) sigue exigiendo puede_verificar().
-- Aplicar DESPUÉS de 0036 (usa el rol 'recopilacion').

create or replace function public.puede_ver_casos()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_verificado() and public.mi_rol() in
    ('admin', 'coordinador', 'verificador', 'recopilacion');
$$;
grant execute on function public.puede_ver_casos() to authenticated;

-- Lectura del panel: coordinación, verificador o recopilación.
drop policy if exists "casos_lectura" on public.casos;
create policy "casos_lectura" on public.casos for select to authenticated
  using (public.puede_ver_casos());

-- Crear/enviar un caso: coordinación, verificador o recopilación.
drop policy if exists "casos_insert" on public.casos;
create policy "casos_insert" on public.casos for insert to authenticated
  with check (public.puede_ver_casos() and creado_por = auth.uid());

-- casos_update y casos_delete NO cambian: verificar/cambiar estado sigue siendo
-- de coordinación o verificador; borrar, de coordinación.
