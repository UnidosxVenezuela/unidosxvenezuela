-- ============================================================
-- 0161 — Flujo por equipos del Donación-Ofrecimiento
-- ------------------------------------------------------------
-- Dos ajustes pedidos por coordinación:
--  (a) TODO el equipo de Recopilación puede EDITAR los datos de cualquier
--      ofrecimiento (no solo quien lo registró): el equipo se reparte la carga.
--      Sigue sin poder tocar el pipeline (estado/asignación, de Logística) ni el
--      veredicto (de Verificación): eso lo impone proteger_campos_oportunidad (0160).
--  (b) CANDADO DE FLUJO: Logística NO puede AVANZAR un ofrecimiento por el pipeline
--      de contacto (contactada → en conversación → comprometida → cumplida) si
--      Verificación aún no lo marcó como «Verificada». Descartar (depurar ofertas
--      falsas o duplicadas) y regresar a «nueva» sí se permiten sin verificación.
-- Idempotente. Ejecutar tras 0160.
-- ============================================================

-- ── (a) Edición en equipo: cualquier recopilador actualiza la fila ──
-- (El blindaje de columnas de 0160 sigue acotando QUÉ puede cambiar cada quien.)
drop policy if exists oportdon_update on public.oportunidades_donacion;
create policy oportdon_update on public.oportunidades_donacion for update to authenticated
  using (
    public.puede_logistica() or public.puede_verificar() or public.opera_verificacion()
    or public.tiene_rol('recopilacion')
  )
  with check (
    public.puede_logistica() or public.puede_verificar() or public.opera_verificacion()
    or public.tiene_rol('recopilacion')
  );

-- ── (b) Candado de flujo dentro del blindaje de columnas (0160 + esta regla) ──
-- Mismo trigger BEFORE UPDATE; se recrea la función completa añadiendo la sección
-- del candado. El service_role y las migraciones (auth.uid() null) no se ven
-- afectados, y la RPC verificar_oportunidad_donacion (0144) tampoco (no toca estado).
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

  -- Candado de flujo (0161): sin verificación previa no se AVANZA por el pipeline.
  -- Descartar y regresar a «nueva» quedan fuera del candado a propósito.
  if new.estado is distinct from old.estado
     and new.estado in ('contactada','en_conversacion','comprometida','cumplida')
     and coalesce(new.estado_verificacion, 'pendiente') <> 'verificada' then
    raise exception 'Verificación debe marcar este ofrecimiento como «Verificada» antes de poder avanzarlo.'
      using errcode = '23514';
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
drop trigger if exists trg_proteger_campos_oportunidad on public.oportunidades_donacion;
create trigger trg_proteger_campos_oportunidad
  before update on public.oportunidades_donacion
  for each row execute function public.proteger_campos_oportunidad();
