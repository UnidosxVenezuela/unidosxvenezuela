-- ============================================================
-- 0109 — Liderazgo/coordinación multi-grupo + el superadmin cuenta como admin
-- ------------------------------------------------------------
-- Tres correcciones al modelo de liderazgo/coordinación de grupos:
--
-- 1) EL SUPERADMIN (dueño) CUENTA COMO ADMIN EN LA RLS. Antes solo el acceso al
--    panel (requirePanelAdmin) lo trataba como admin; `es_admin()`/`es_coordinacion()`
--    NO, así que un superadmin que no tuviera además el rol 'admin' veía el panel
--    pero sus escrituras (asignar/quitar líder, cambiar roles) se filtraban a 0 filas.
--    Ahora administra todo, como corresponde al dueño.
--
-- 2) POLÍTICA UPDATE QUE FALTABA EN `miembros_grupo` desde 0055. Sin ella, bajar al
--    líder anterior a 'miembro' era un NO-OP (la RLS filtraba la fila), dejando filas
--    'lider' obsoletas (el equipo quedaba «sin líder» pero la persona seguía marcada
--    como líder) y arriesgando el índice único «un líder por grupo» al reasignar. Se
--    añade con el MISMO criterio que insert/delete (0059).
--
-- (La app, además, deja de "traspasar": una persona puede liderar/coordinar VARIOS
--  grupos; el DELETE de líder deja al grupo sin líder — ambos ya soportados por la BD.)
--
-- Rebase sobre las versiones vigentes: es_admin (0043), es_coordinacion (0055),
-- políticas de miembros_grupo (0059). Idempotente. Ejecutar tras 0108.
-- ============================================================

-- ── 1) El superadmin cuenta como admin (y como coordinación) en la RLS ──
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.tiene_rol('admin')
      or exists (select 1 from public.perfiles where id = auth.uid() and super_admin);
$$;

-- «Coordinación» = admin (0055). Ahora se apoya en es_admin(), así que también
-- incluye al superadmin. No quita a nadie: solo suma al dueño.
create or replace function public.es_coordinacion()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin return public.es_admin(); end $$;

-- ── 2) Política UPDATE de miembros_grupo (faltaba desde 0055) ──
-- Mismo criterio que insert/delete (0059): admin/superadmin, el líder del grupo
-- sobre miembros gestionables, o el coordinador psicosocial de su grupo. Permite
-- promover/bajar el rol_en_grupo (líder ⇄ coordinador ⇄ miembro) de forma efectiva.
drop policy if exists "miembros_update" on public.miembros_grupo;
create policy "miembros_update" on public.miembros_grupo for update to authenticated
  using (public.es_admin()
    or (exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid())
        and public.es_gestionable_por_lider(perfil_id))
    or public.gestionable_por_coord_psico(grupo_id, perfil_id))
  with check (public.es_admin()
    or (exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid())
        and public.es_gestionable_por_lider(perfil_id))
    or public.gestionable_por_coord_psico(grupo_id, perfil_id));
