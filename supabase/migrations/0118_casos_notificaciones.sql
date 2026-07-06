-- ============================================================
-- 0118 — Casos: avisos del ciclo de verificación (reportar → verificar → veredicto)
-- ------------------------------------------------------------
-- El lazo de logística ya avisaba (0116), pero el ciclo básico de un caso no emitía
-- ninguna notificación. Se cierran dos huecos:
--   (a) Al REPORTARSE un caso nuevo de «Otras informaciones» (nace 'pendiente') se
--       avisa al equipo de Verificación que hay algo por verificar. (Los Desaparecidos
--       nacen 'en_proceso' y van al Grupo de Búsqueda con su propio flujo, así que NO
--       se tocan aquí.)
--   (b) Cuando Verificación deja un veredicto (confirmado / falso), se avisa a quien
--       REPORTÓ el caso el resultado de su reporte.
--
-- Ambos avisos usan `notificaciones` (0001): su webhook per-row (0060) emite el push y
-- alimenta la campana, sin tocar la app. `tipo` es texto libre (sin enum). Los roles se
-- comparan con valores del enum YA existentes ('verificador' es de 0034), así que el
-- cast es seguro (no son valores añadidos en esta misma migración). Idempotente.
-- Ejecutar tras 0117.
-- ============================================================

-- ── (a) Caso nuevo 'pendiente' → avisar al equipo de Verificación ──
create or replace function public.notificar_caso_nuevo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Solo los reportes de «Otras informaciones» nacen 'pendiente' y esperan verificación.
  if new.estado::text = 'pendiente' then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select p.id, 'caso_por_verificar', 'Nuevo caso por verificar',
           coalesce(new.titulo, 'Un caso nuevo') || ' — llegó para verificar.',
           '/casos?caso=' || new.id
    from public.perfiles p
    where p.verificado
      and p.id is distinct from new.creado_por  -- no avisar a quien lo reportó
      and (p.rol = 'verificador'::public.rol_usuario
           or 'verificador'::public.rol_usuario = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[])));
  end if;
  return new;
end $$;

drop trigger if exists trg_notificar_caso_nuevo on public.casos;
create trigger trg_notificar_caso_nuevo
  after insert on public.casos
  for each row execute function public.notificar_caso_nuevo();

-- ── (b) Veredicto (confirmado / falso) → avisar a quien reportó ──
create or replace function public.notificar_veredicto_caso()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado::text in ('confirmado', 'falso')
     and new.estado is distinct from old.estado
     and new.creado_por is not null
     and new.creado_por is distinct from auth.uid() then  -- no auto-aviso a quien lo verificó
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    values (
      new.creado_por,
      'caso_verificado',
      case when new.estado::text = 'confirmado' then 'Tu caso fue confirmado' else 'Tu caso fue descartado' end,
      case when new.estado::text = 'confirmado'
           then coalesce(new.titulo, 'Tu reporte') || ' se confirmó y sigue en el flujo.'
           else coalesce(new.titulo, 'Tu reporte') || ' se revisó y se descartó como no confirmado.' end,
      '/casos?caso=' || new.id
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_notificar_veredicto_caso on public.casos;
create trigger trg_notificar_veredicto_caso
  after update of estado on public.casos
  for each row execute function public.notificar_veredicto_caso();
