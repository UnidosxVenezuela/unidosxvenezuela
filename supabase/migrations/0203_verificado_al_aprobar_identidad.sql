-- ============================================================
-- 0203 — Aprobar la 2ª verificación de identidad marca la cuenta como VERIFICADA
-- ------------------------------------------------------------
-- BUG (Recopilación «no logra subir solicitudes»): aprobar la identidad
-- (verificaciones_identidad.estado='aprobada') NO ponía perfiles.verificado=true.
-- Pero /casos/nuevo (y /busqueda, /digitalizacion, enlace…) MUESTRAN el formulario
-- según la identidad aprobada (identidad_aprobada()), mientras que CREAR exige, además,
-- es_verificado() = perfiles.verificado (exigirCasos + la policy casos_insert de 0106).
-- Resultado: quien se registró solo y luego pasó su 2ª verificación (identidad) queda con
-- identidad 'aprobada' pero verificado=false → VE el formulario y la RLS rechaza el envío.
--
-- Arreglo (fuente de verdad en la BD):
--   1) Trigger: al ENTRAR la identidad a 'aprobada', marcar perfiles.verificado=true.
--      La 2ª verificación (selfie + documento, revisada por un admin) es la señal de
--      confianza MÁS fuerte; tener la identidad aprobada implica cuenta verificada.
--   2) Backfill idempotente de los ya aprobados (desbloquea a los que hoy están trabados).
--
-- proteger_campos_perfil (0191) lo permite sin cambios: el que aprueba es admin y
-- es_coordinacion()=es_admin() → autoriza el cambio de `verificado`; el backfill corre
-- sin auth.uid() (bypass del propio proteger_campos_perfil). El trigger solo toca
-- `verificado` (nunca rol/roles_extra), así que no dispara las reglas de rol. Idempotente.
-- ============================================================

create or replace function public.marcar_verificado_al_aprobar_identidad()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Solo al ENTRAR a 'aprobada' (INSERT directo o transición desde otro estado) y solo si falta.
  if new.estado = 'aprobada'
     and (tg_op = 'INSERT' or old.estado is distinct from 'aprobada') then
    update public.perfiles
       set verificado = true
     where id = new.perfil_id
       and verificado is distinct from true;
  end if;
  return new;
end $$;

drop trigger if exists trg_verificado_al_aprobar_identidad on public.verificaciones_identidad;
create trigger trg_verificado_al_aprobar_identidad
  after insert or update of estado on public.verificaciones_identidad
  for each row execute function public.marcar_verificado_al_aprobar_identidad();

-- Backfill: cuentas con identidad aprobada que quedaron SIN verificar (las bloqueadas hoy).
update public.perfiles p
   set verificado = true
  from public.verificaciones_identidad v
 where v.perfil_id = p.id
   and v.estado = 'aprobada'
   and p.verificado is distinct from true;
