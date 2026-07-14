-- ============================================================
-- 0151 — Los adjuntos de una solicitud se ven a la par que la solicitud
-- ------------------------------------------------------------
-- Problema: Redacción (rol 'redaccion' y admin de Redes / opera_redes) SÍ puede leer
-- las solicitudes confirmadas (casos_select se amplió en 0059→0106→0143), pero NO veía
-- sus ADJUNTOS. La política de lectura de `casos_adjuntos` (cadj_select, 0055) seguía
-- anclada a `puede_ver_caso(creado_por)`, que solo concede admin/verificador/envio_redaccion
-- /creador. Resultado: Redacción abría la solicitud pero las imágenes y archivos no
-- aparecían (la fila de la tabla quedaba invisible aunque el bucket 'adjuntos' sí les
-- da acceso al objeto, 0106). Mismo desfase afectaba a los mandos de Recopilación/Búsqueda.
--
-- Arreglo: la visibilidad del adjunto pasa a SEGUIR a la de su solicitud. Es decir,
-- «ves el adjunto si (y solo si) puedes ver la solicitud». La subconsulta a public.casos
-- respeta la RLS de casos (casos_select), así que esta política se mantiene siempre
-- alineada con quién puede ver cada caso, sin volver a enumerar roles (y sin volver a
-- desfasarse cuando casos_select cambie). Es más correcto (un adjunto es parte del caso)
-- y no filtra nada nuevo: si no ves el caso, tampoco su fila de adjunto.
--
-- NOTA de seguridad: al referenciar public.casos DIRECTAMENTE (no vía la función
-- SECURITY DEFINER puede_ver_caso), la RLS de casos aplica dentro de la subconsulta;
-- por eso `exists (select 1 from casos ...)` devuelve verdadero solo para casos visibles.
--
-- El alta de adjuntos (cadj_insert) NO cambia: sigue exigiendo ser el creador de la fila
-- y poder ver el caso; el gate real de subida es la política del bucket 'adjuntos' (0106).
-- Idempotente. Ejecutar tras 0150.
-- ============================================================

drop policy if exists "cadj_select" on public.casos_adjuntos;
create policy "cadj_select" on public.casos_adjuntos for select to authenticated
  using (exists (select 1 from public.casos c where c.id = caso_id));
