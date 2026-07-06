-- ============================================================
-- 0111 — El grupo se queda SIN LÍDER cuando el líder deja de ser miembro
-- ------------------------------------------------------------
-- Bug reportado: tras quitar a alguien de un grupo (o cambiarle el rol), la ficha
-- y la tarjeta del grupo seguían mostrándolo como «Líder», aunque el grupo ya no
-- tuviera miembros. Causa: `grupos.lider_id` solo lo limpiaba `quitarLider`; las
-- otras vías que sacan a una persona del grupo —`quitarMiembro`, `banearMiembro`,
-- degradar el rol desde Administración— borran/actualizan la membresía pero NUNCA
-- tocaban `grupos.lider_id`, que quedaba «colgado» apuntando al ex-líder.
--
-- La `lider_id` de `grupos` ya tiene `on delete set null` (0001:65), así que ELIMINAR
-- la cuenta de la persona sí lo limpia; lo que faltaba era limpiarlo cuando la persona
-- sigue existiendo pero SALE del grupo o deja de ser su líder.
--
-- Solución en la BD (fuente de verdad): un trigger que mantiene el invariante
--   `grupos.lider_id = X`  ⇒  existe membresía (grupo, X, rol_en_grupo='lider')
-- limpiando `lider_id` en cuanto el líder se va (DELETE) o deja de ser 'lider'
-- (UPDATE). Es SECURITY DEFINER, así que se aplica pase quien pase la acción
-- (admin, líder, o función DEFINER), sin depender de la RLS de `grupos`.
--
-- No colisiona con los triggers existentes de `miembros_grupo`
-- (`trg_bloquear_baneado` BEFORE INSERT, `trg_sincronizar_rol_grupo` AFTER INSERT/
-- DELETE que sincroniza `perfiles.roles_extra`): función y propósito distintos.
-- En los flujos de asignación (`asignarLider`/`cambiarRol`) el trigger limpia al
-- degradar al líder anterior y luego el propio flujo re-fija `lider_id` al nuevo,
-- así que el resultado neto no cambia; solo se AÑADE la limpieza cuando nadie
-- vuelve a fijar un líder.
--
-- Incluye una reconciliación única de los datos ya inconsistentes. Idempotente.
-- Ejecutar tras 0110.
-- ============================================================

-- ── Trigger: liberar el liderazgo cuando el líder sale o se degrada ──
create or replace function public.limpiar_lider_grupo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    -- El (ex)miembro salió del grupo: si era el líder registrado, dejarlo sin líder.
    update public.grupos set lider_id = null
      where id = old.grupo_id and lider_id = old.perfil_id;
    return old;
  end if;
  -- UPDATE: si dejó de ser 'lider' y era el líder registrado, liberar el liderazgo.
  if old.rol_en_grupo = 'lider' and new.rol_en_grupo <> 'lider' then
    update public.grupos set lider_id = null
      where id = old.grupo_id and lider_id = old.perfil_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_limpiar_lider_grupo on public.miembros_grupo;
create trigger trg_limpiar_lider_grupo
  after delete or update of rol_en_grupo on public.miembros_grupo
  for each row execute function public.limpiar_lider_grupo();

-- ── Reconciliación de datos ya inconsistentes ──
-- (a) Líderes legítimos cuya membresía quedó como 'miembro' (p. ej. porque antes de
--     0109 no existía la política UPDATE de miembros_grupo y la promoción no marcó
--     'lider'): se re-marcan 'lider' SOLO si el grupo no tiene ya otro 'lider'
--     (respeta el índice único parcial `uq_miembros_un_lider`, 0088).
update public.miembros_grupo m
   set rol_en_grupo = 'lider'
  from public.grupos g
 where g.id = m.grupo_id
   and g.lider_id = m.perfil_id
   and m.rol_en_grupo <> 'lider'
   and not exists (
     select 1 from public.miembros_grupo x
      where x.grupo_id = g.id and x.rol_en_grupo = 'lider'
   );

-- (b) Líderes «colgados»: `lider_id` apunta a alguien que ya NO es miembro del grupo.
--     Se libera el liderazgo (es exactamente el caso reportado: grupo con 0 miembros
--     que seguía mostrando «Líder: …»).
update public.grupos g
   set lider_id = null
 where g.lider_id is not null
   and not exists (
     select 1 from public.miembros_grupo m
      where m.grupo_id = g.id and m.perfil_id = g.lider_id
   );
