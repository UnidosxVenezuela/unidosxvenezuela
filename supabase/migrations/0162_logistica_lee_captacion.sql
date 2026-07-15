-- ============================================================
-- 0162 — Logística consulta las oportunidades ENVIADAS por Captación
-- ------------------------------------------------------------
-- La sección «Proveedores» de Logística se sustituye por «Captación»: una
-- referencia de las empresas, organizaciones, fundaciones, proyectos y alianzas
-- que el equipo de Captación ya trabajó y marcó como ENVIADAS, para que
-- Logística revise si alguna le sirve para completar una solicitud.
--
-- Hoy la RLS de `oportunidades` (CRM de Captación, 0129) solo deja leer a
-- Captación/admin. Se añade UNA policy de SOLO LECTURA para Logística acotada a
-- `estado = 'enviado'` (lo en investigación/verificado sigue siendo interno de
-- Captación). También lectura del bucket privado 'oportunidades' para que
-- Logística vea la foto/archivo adjunto. Sin escritura: la gestión sigue siendo
-- exclusiva de Captación. Idempotente. Ejecutar tras 0161.
-- ============================================================

drop policy if exists oportunidades_select_logistica on public.oportunidades;
create policy oportunidades_select_logistica on public.oportunidades for select to authenticated
  using (public.puede_logistica() and estado = 'enviado');

-- Lectura del bucket privado 'oportunidades' (0129) para Logística (URLs firmadas
-- de las miniaturas/archivos). Solo SELECT: subir/borrar sigue siendo de Captación.
drop policy if exists oportunidades_storage_logistica on storage.objects;
create policy oportunidades_storage_logistica on storage.objects for select to authenticated
  using (bucket_id = 'oportunidades' and public.puede_logistica());
