-- ============================================================
-- 0132 — Aviso al mando cuando la coincidencia de un MENOR (NNA) queda pendiente
-- ------------------------------------------------------------
-- `notificar_estado_busqueda` (0094) avisa la `coincidencia_pendiente` SOLO al Enlace
-- de contacto (que la gestiona) y el `cierre_pendiente` al mando. Para los casos de
-- MENORES (NNA) —lo más sensible del sistema— la supervisión del mando debe estar al
-- tanto DESDE que la coincidencia queda pendiente, no solo en el cierre final.
--
-- Este parche AÑADE, sin quitar nada: cuando un caso `es_nna` pasa a
-- `coincidencia_pendiente`, además del aviso al Enlace (que se conserva idéntico) se
-- avisa también al MANDO (líderes de los grupos 'busqueda' y 'busqueda_nna'),
-- excluyendo a quien hizo el cambio y sin duplicar si alguien lidera ambos grupos.
-- Los casos de adultos siguen igual (solo Enlace). El aviso de `cierre_pendiente`
-- queda tal cual.
--
-- Solo redefine la función (el trigger 0090/0094 sigue vigente). Enum-safe: usa los
-- estados existentes por comparación en plpgsql (late-bound). Idempotente. Tras 0131.
-- ============================================================

create or replace function public.notificar_estado_busqueda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado_busqueda = 'coincidencia_pendiente'
     and old.estado_busqueda is distinct from 'coincidencia_pendiente' then
    -- Aviso al Enlace de contacto (gestiona la coincidencia) — SIN CAMBIOS respecto a 0094.
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select pf.id, 'busqueda_enlace', 'Coincidencia por revisar',
           'Un caso tiene una coincidencia pendiente de tu revisión y aprobación.', '/busqueda/' || new.caso_id
    from public.perfiles pf
    where pf.rol::text = 'enlace_contacto'
       or exists (select 1 from unnest(coalesce(pf.roles_extra, '{}'::public.rol_usuario[])) r where r::text = 'enlace_contacto');

    -- NUEVO: si es un MENOR (NNA), avisar TAMBIÉN al mando (supervisión temprana).
    -- Líderes de Búsqueda y de Búsqueda de Menores; distinct evita duplicar si alguien
    -- lidera ambos; se excluye a quien acaba de marcar la coincidencia.
    if coalesce(new.es_nna, false) then
      insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
      select distinct g.lider_id, 'busqueda_aprobacion', 'Coincidencia de un menor (NNA) pendiente',
             'Un caso de un menor tiene una coincidencia pendiente. El Enlace la gestiona; supervisa el proceso.',
             '/busqueda/' || new.caso_id
      from public.grupos g
      where g.clave in ('busqueda','busqueda_nna')
        and g.lider_id is not null
        and g.lider_id is distinct from auth.uid();
    end if;
  end if;

  if new.estado_busqueda = 'cierre_pendiente'
     and old.estado_busqueda is distinct from 'cierre_pendiente' then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select g.lider_id, 'busqueda_confirmacion', 'Cierre por confirmar',
           'Un caso fue finalizado por el Enlace y espera tu confirmación final.', '/busqueda/' || new.caso_id
    from public.grupos g where g.clave in ('busqueda','busqueda_nna') and g.lider_id is not null;
  end if;

  return new;
end $$;
