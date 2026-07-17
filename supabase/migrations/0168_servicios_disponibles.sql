-- ============================================================
-- 0168 — Servicios en Logística: directorio de «Servicios disponibles»
-- ------------------------------------------------------------
-- Un SERVICIO (oportunidades_donacion.clase = 'servicio', 0152) no es transaccional
-- como una donación. Una donación se ofrece → se compromete → se ENTREGA y CIERRA
-- («cumplida»). Un servicio (transporte a la orden, atención médica/legal/psicosocial…)
-- es una CAPACIDAD PERMANENTE: una vez VERIFICADO queda DISPONIBLE (activo) y así se
-- mantiene, hasta que Logística lo DA DE BAJA porque terminó o ya no se requiere
-- (reactivable). Se añade ese ciclo SIN tocar el flujo de donaciones.
--
-- El «directorio» no necesita tabla ni trigger: es la consulta
--   clase='servicio' and estado_verificacion='verificada' and servicio_estado='activo'.
-- Solo agregamos el estado de disponibilidad + su blindaje (baja/reactivación = Logística).
-- Idempotente. Ejecutar tras 0167.
-- ============================================================

alter table public.oportunidades_donacion
  add column if not exists servicio_estado      text not null default 'activo',
  add column if not exists servicio_baja_motivo text,
  add column if not exists servicio_baja_en      timestamptz,
  add column if not exists servicio_baja_por     uuid references public.perfiles (id) on delete set null;

do $$ begin
  alter table public.oportunidades_donacion
    add constraint oportdon_servicio_estado_chk check (servicio_estado in ('activo','baja'));
exception when duplicate_object then null; end $$;

-- Blindaje de columnas (base: 0160): se suma la disponibilidad del servicio a lo que
-- SOLO Logística/admin puede cambiar (como el estado y la asignación del pipeline).
create or replace function public.proteger_campos_oportunidad()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;

  -- Pipeline de Logística: el estado y la asignación son suyos (o de un admin).
  if (new.estado is distinct from old.estado
      or new.asignado_a is distinct from old.asignado_a)
     and not (public.puede_logistica() or public.es_admin()) then
    raise exception 'Solo Logística puede cambiar el estado o la asignación del ofrecimiento.'
      using errcode = '42501';
  end if;

  -- Directorio de servicios: dar de baja o reactivar un servicio es de Logística.
  if (new.servicio_estado      is distinct from old.servicio_estado
      or new.servicio_baja_motivo is distinct from old.servicio_baja_motivo
      or new.servicio_baja_en     is distinct from old.servicio_baja_en
      or new.servicio_baja_por    is distinct from old.servicio_baja_por)
     and not (public.puede_logistica() or public.es_admin()) then
    raise exception 'Solo Logística puede dar de baja o reactivar un servicio.'
      using errcode = '42501';
  end if;

  -- Veredicto de Verificación: lo fija solo Verificación (en la práctica, vía la RPC 0144).
  if (new.estado_verificacion is distinct from old.estado_verificacion
      or new.nota_verificacion is distinct from old.nota_verificacion
      or new.verificada_por    is distinct from old.verificada_por
      or new.verificada_en     is distinct from old.verificada_en)
     and not (public.puede_verificar() or public.opera_verificacion() or public.es_admin()) then
    raise exception 'Solo Verificación puede fijar el resultado de verificación del ofrecimiento.'
      using errcode = '42501';
  end if;

  -- El correlativo (0155) y la autoría los fija el alta: inmutables salvo para un admin.
  if new.numero is distinct from old.numero and not public.es_admin() then
    raise exception 'El número del ofrecimiento no se puede cambiar.' using errcode = '42501';
  end if;
  if new.creado_por is distinct from old.creado_por and not public.es_admin() then
    raise exception 'No se puede cambiar quién registró el ofrecimiento.' using errcode = '42501';
  end if;

  return new;
end $$;
