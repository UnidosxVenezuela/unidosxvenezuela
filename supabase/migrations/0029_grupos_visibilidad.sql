-- ============================================================
-- 0029 — Grupos abiertos vs privados
-- ============================================================
-- abierto = true  → cualquier verificado lo ve y puede unirse solo.
-- abierto = false → solo lo ven sus miembros (y coordinación); el alta es
--                   por invitación (líder/coordinación lo agregan).
-- ============================================================

alter table public.grupos
  add column if not exists abierto boolean not null default true;

-- Lectura: coordinación ve todo; los abiertos los ve cualquier verificado;
-- los privados solo sus miembros (o su líder).
drop policy if exists "grupos_lectura" on public.grupos;
create policy "grupos_lectura" on public.grupos for select to authenticated
  using (
    public.es_coordinacion()
    or (abierto and public.es_verificado())
    or public.es_miembro_de(id)
    or lider_id = auth.uid()
  );

-- Auto-unirse: SOLO a grupos abiertos (además de la gestión por líder/coordinación
-- vía la policy 'miembros_gestion'). El trigger de vetados sigue aplicando.
drop policy if exists "miembros_autounirse" on public.miembros_grupo;
create policy "miembros_autounirse" on public.miembros_grupo for insert to authenticated
  with check (
    perfil_id = auth.uid()
    and public.es_verificado()
    and exists (select 1 from public.grupos g where g.id = grupo_id and g.abierto)
  );
