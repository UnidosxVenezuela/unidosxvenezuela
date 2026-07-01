-- ============================================================
-- 0047 — Grupos del flujo de casos (pre-creados)
-- ============================================================
-- Deja listos los 6 grupos operativos del flujo de casos/contenido, PRIVADOS
-- (solo los ven sus miembros y la coordinación). Idempotente: no duplica si ya
-- existen (se compara por nombre). A los grupos con líder conocido se les asigna
-- por su número de WhatsApp SI la persona ya está registrada; si aún no lo está,
-- el grupo queda sin líder y se asigna luego desde la ficha del grupo.
-- ============================================================

insert into public.grupos (nombre, area, descripcion, abierto)
select v.nombre, v.area::public.area_clave, v.descripcion, false
from (values
  ('1. Gestión de Información web',      'gestion_informacion', 'Gestión y monitoreo de información en la web.'),
  ('2. Seguimiento de Casos',           'gestion_informacion', 'Seguimiento y verificación de los casos reportados.'),
  ('3. Caso de Niños',                  'proteccion',          'Casos que involucran a niñas y niños (protección).'),
  ('4. Otras Informaciones Relevantes', 'gestion_informacion', 'Otras informaciones relevantes para el equipo.'),
  ('5. Grupo Urgente',                  'gestion_informacion', 'Atención de casos urgentes por turnos.'),
  ('6. Envío a Redacción de Contenido', 'comunicaciones',      'Puente entre verificación y la redacción de contenido.')
) as v(nombre, area, descripcion)
where not exists (select 1 from public.grupos g where g.nombre = v.nombre);

-- Líder por WhatsApp (solo si la persona ya está registrada y el grupo no tiene líder).
update public.grupos g set lider_id = p.id
from public.perfiles p
where g.lider_id is null and (
     (g.nombre = '3. Caso de Niños'                  and p.whatsapp = '35799168012')
  or (g.nombre = '6. Envío a Redacción de Contenido' and p.whatsapp = '393534042281')
);

-- Asegurar la membresía (como líder) de quien haya quedado asignado.
insert into public.miembros_grupo (grupo_id, perfil_id, rol_en_grupo)
select g.id, g.lider_id, 'lider'
from public.grupos g
where g.lider_id is not null
  and g.nombre in ('3. Caso de Niños', '6. Envío a Redacción de Contenido')
  and not exists (
    select 1 from public.miembros_grupo m where m.grupo_id = g.id and m.perfil_id = g.lider_id
  );
