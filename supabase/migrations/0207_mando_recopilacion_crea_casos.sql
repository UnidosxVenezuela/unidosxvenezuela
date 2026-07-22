-- ============================================================
-- 0207 — Recopilación: sus LÍDERES y COORDINADORES pueden CREAR solicitudes
-- ------------------------------------------------------------
-- Problema (reportado): una COORDINADORA del grupo de Recopilación no lograba crear
-- solicitudes desde la web («presiona el botón y no pasa nada»). Causa raíz: la
-- creación de casos exige el ROL OPERATIVO `recopilacion` (política `casos_insert`,
-- 0057), pero un líder/coordinador NO lo recibe de forma fiable:
--   • `sincronizar_rol_grupo` (0154) solo otorga el rol del grupo en el INSERT de la
--     membresía y NO cuando el rol PRINCIPAL de la persona es 'voluntario' (el caso
--     más común); a los líderes/coordinadores se les asigna por `upsert` (a veces
--     UPDATE, que el trigger ni observa) y por `grupos.lider_id` (que tampoco lo dispara).
--   • `es_mando_recopilacion()` (0143) solo les daba SUPERVISIÓN de SOLO LECTURA
--     (rama de `casos_select`), nunca alta.
-- Resultado: el mando de Recopilación quedaba sin poder crear; en la web la puerta de
-- `/casos/nuevo` lo devolvía a `/casos` (de ahí el «no pasa nada»).
--
-- Arreglo: `casos_insert` acepta además al MANDO de Recopilación (líder por
-- `grupos.lider_id` o coordinador por `miembros_grupo.rol_en_grupo='coordinador'` del
-- grupo `gestion_casos`), que YA exige su 2ª verificación de identidad aprobada
-- (`es_mando_recopilacion()` ⇒ `identidad_aprobada()`). Por eso su rama NO se re-condiciona
-- a `es_verificado()`: la verificación de identidad es el candado más fuerte, así el mando
-- puede crear aunque el flag `verificado` no esté puesto (robusto ante 0203 sin aplicar).
-- El caso creado lleva `creado_por = mando`, de modo que ver/editar/adjuntar de SU propia
-- solicitud funcionan por las ramas de «creador» ya existentes (casos_select/casos_update/
-- cadj_insert) sin más cambios. La supervisión de solo lectura (0143) se conserva.
--
-- Idempotente (drop + create). No toca enums. Ejecutar tras 0206.
-- ============================================================

drop policy if exists "casos_insert" on public.casos;
create policy "casos_insert" on public.casos for insert to authenticated
  with check (
    creado_por = auth.uid()
    and (
      -- Recopilador operativo o admin (comportamiento previo, 0057).
      (public.es_verificado() and (public.tiene_rol('recopilacion') or public.tiene_rol('admin')))
      -- Mando de Recopilación (líder/coordinador de gestion_casos, con identidad aprobada).
      or public.es_mando_recopilacion()
    )
  );
