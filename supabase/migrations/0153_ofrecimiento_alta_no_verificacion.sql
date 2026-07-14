-- ============================================================
-- 0153 — El ALTA de un «Donación-Ofrecimiento» es SOLO de Recopilación (y admin)
-- ------------------------------------------------------------
-- Regla del equipo: Recopilación CAPTA/crea los ofrecimientos; los demás NO los ingresan
--   · Logística GESTIONA (contacta, empareja, avanza estado) — no crea.
--   · Verificación VERIFICA — no crea.
--   · Administración de Verificaciones supervisa; Captación consulta.
-- La política de alta de 0141 (oportdon_insert) permitía a CUALQUIER verificado crear el
-- suyo. Se acota a Recopilación (rol principal o por grupo; mis_roles 0043) y al admin
-- general (es_admin). Todos los demás quedan FUERA del alta pero conservan lo suyo:
-- Logística gestiona (oportdon_update, puede_logistica), Verificación verifica
-- (verificar_oportunidad_donacion), y la lectura (oportdon_select) no cambia.
--
-- La app ya lo refuerza (puedeRegistrarOportunidad = admin/recopilación); esto lo cierra en
-- la RLS. Se mantiene creado_por = auth.uid() (no se crea a nombre de otro) y
-- es_verificado(). Idempotente. Ejecutar tras 0152.
-- ============================================================

drop policy if exists oportdon_insert on public.oportunidades_donacion;
create policy oportdon_insert on public.oportunidades_donacion for insert to authenticated
  with check (
    public.es_verificado()
    and creado_por = auth.uid()
    and (public.es_admin() or public.tiene_rol('recopilacion'))
  );
