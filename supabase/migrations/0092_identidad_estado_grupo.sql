-- ============================================================
-- 0092 — Estado de identidad (2ª verificación) visible al mando del grupo
-- ============================================================
-- En los grupos que exigen 2ª verificación (recopilación, búsqueda, enlace de
-- contacto, digitalización) el mando del grupo —admin, líder o coordinador—
-- necesita ver qué miembros tienen su identidad APROBADA, en revisión o sin
-- iniciar, para acompañar a quien falte. Pero la RLS de `verificaciones_identidad`
-- solo deja leer la fila propia o al admin (y la tabla guarda además rutas de la
-- selfie/documento, que NO deben verse). Por eso exponemos SOLO (perfil_id,
-- estado) mediante una función SECURITY DEFINER escopada al grupo y a su mando.
-- Idempotente.
-- ============================================================

create or replace function public.identidades_de_grupo(p_grupo uuid)
returns table (perfil_id uuid, estado text)
language sql stable security definer set search_path = public as $$
  select m.perfil_id,
         coalesce(vi.estado, 'sin_iniciar') as estado
  from public.miembros_grupo m
  left join public.verificaciones_identidad vi on vi.perfil_id = m.perfil_id
  where m.grupo_id = p_grupo
    -- Solo el mando del grupo (o admin) obtiene datos; el resto recibe 0 filas.
    and (
      public.es_admin()
      or exists (select 1 from public.grupos g
                 where g.id = p_grupo and g.lider_id = auth.uid())
      or exists (select 1 from public.miembros_grupo mm
                 where mm.grupo_id = p_grupo and mm.perfil_id = auth.uid()
                   and mm.rol_en_grupo = 'coordinador')
    );
$$;

grant execute on function public.identidades_de_grupo(uuid) to authenticated;
