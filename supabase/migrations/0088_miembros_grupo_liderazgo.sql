-- ============================================================
-- 0088 — Un solo líder por grupo (varios coordinadores permitidos)
-- ------------------------------------------------------------
-- La regla del equipo: un grupo tiene UN líder pero puede tener VARIOS
-- coordinadores. Hasta ahora eso solo se garantizaba en la app (grupos.lider_id
-- es una columna única de facto, pero miembros_grupo.rol_en_grupo no tenía tope).
-- Se blinda a nivel de BD:
--   · CHECK de valores válidos de rol_en_grupo ('miembro','lider','coordinador').
--   · Índice único PARCIAL que impide dos filas 'lider' en el mismo grupo.
-- (No se limita 'coordinador': puede haber varios por grupo.)
-- Idempotente. Ejecutar tras 0087.
-- ============================================================

-- ── 1) Normalizar datos antes de restringir ──
-- Cualquier valor inesperado pasa a 'miembro'.
update public.miembros_grupo
  set rol_en_grupo = 'miembro'
  where rol_en_grupo is null or rol_en_grupo not in ('miembro', 'lider', 'coordinador');

-- Si algún grupo tuviera >1 fila 'lider', deja como 'lider' solo a quien figura en
-- grupos.lider_id (fuente de verdad); el resto baja a 'miembro'.
update public.miembros_grupo m
  set rol_en_grupo = 'miembro'
  where m.rol_en_grupo = 'lider'
    and not exists (
      select 1 from public.grupos g where g.id = m.grupo_id and g.lider_id = m.perfil_id
    );

-- ── 2) CHECK de valores válidos ──
do $$ begin
  alter table public.miembros_grupo
    add constraint miembros_grupo_rol_chk check (rol_en_grupo in ('miembro', 'lider', 'coordinador'));
exception when duplicate_object then null; end $$;

-- ── 3) Un solo líder por grupo (índice único parcial) ──
create unique index if not exists uq_miembros_un_lider
  on public.miembros_grupo (grupo_id)
  where rol_en_grupo = 'lider';
