-- ============================================================
-- 0153 — El ALTA de un «Donación-Ofrecimiento» es de Logística/Recopilación, no de Verificación
-- ------------------------------------------------------------
-- Regla del equipo: Verificación VERIFICA los ofrecimientos, NO los ingresa. La política
-- de alta de 0141 (oportdon_insert) permitía a CUALQUIER verificado crear el suyo —lo que
-- dejaba crear también a Verificación (y a otros roles)—. Se acota el alta a quienes
-- captan/gestionan ofertas:
--   · puede_logistica()  → admin, logística y admin de Logística (0119).
--   · tiene_rol('recopilacion') → Recopilación (rol principal o por grupo; mis_roles 0043).
-- Verificación (verificador / admin_verificacion) queda FUERA del alta; sigue pudiendo
-- LEER y VERIFICAR (oportdon_select y verificar_oportunidad_donacion no cambian).
--
-- La app ya lo refuerza (puedeRegistrarOportunidad); esto lo cierra en la RLS. Se mantiene
-- creado_por = auth.uid() (no se crea a nombre de otro) y es_verificado(). Idempotente.
-- Ejecutar tras 0152.
-- ============================================================

drop policy if exists oportdon_insert on public.oportunidades_donacion;
create policy oportdon_insert on public.oportunidades_donacion for insert to authenticated
  with check (
    public.es_verificado()
    and creado_por = auth.uid()
    and (public.puede_logistica() or public.tiene_rol('recopilacion'))
  );
