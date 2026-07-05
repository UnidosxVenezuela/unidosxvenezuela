-- ============================================================
-- 0099 — El líder de cada grupo figura como miembro (rol_en_grupo='lider')
-- ------------------------------------------------------------
-- `grupos.lider_id` es la fuente de verdad del liderazgo, pero el líder no siempre
-- tenía fila en `miembros_grupo` (líderes históricos, de sistema o asignados fuera
-- del flujo `asignarLider`). Por eso NO aparecían en el listado de miembros del grupo.
-- Se rellena la membresía faltante y se alinea el rol del líder ya-miembro a 'lider'.
-- (0088 garantiza un solo 'lider' por grupo; aquí no se crean duplicados.)
-- Idempotente. Ejecutar tras 0098.
-- ============================================================

-- 1) El líder sin fila de miembro: se añade como 'lider'.
insert into public.miembros_grupo (grupo_id, perfil_id, rol_en_grupo)
select g.id, g.lider_id, 'lider'
from public.grupos g
where g.lider_id is not null
  and not exists (
    select 1 from public.miembros_grupo m
    where m.grupo_id = g.id and m.perfil_id = g.lider_id
  )
on conflict (grupo_id, perfil_id) do nothing;

-- 2) El líder que ya era miembro con otro rol (miembro/coordinador) → 'lider'.
update public.miembros_grupo m
  set rol_en_grupo = 'lider'
from public.grupos g
where g.id = m.grupo_id
  and g.lider_id = m.perfil_id
  and m.rol_en_grupo <> 'lider';
