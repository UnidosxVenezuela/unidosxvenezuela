-- ============================================================
-- 0174 — Privacidad del contacto y las evidencias frente a la difusión (Paso 10)
-- ------------------------------------------------------------
-- El requerimiento (Paso 10) separa dos contactos y protege las evidencias:
--   • Contacto INTERNO (el real): lo ven Verificación / Logística / Donaciones /
--     Alianzas / Coordinación. NUNCA Redes Sociales.
--   • Contacto AUTORIZADO PARA DIFUSIÓN: solo existe con autorización explícita y es lo
--     ÚNICO que puede ver/usar la difusión (Envío a Redacción / Redes).
--   • Capturas/imágenes/evidencias: uso interno; no se publican salvo autorización.
--
-- Esta migración cubre la parte que se puede blindar en la BASE de forma contenida y
-- de bajo riesgo:
--   1) Dos columnas nuevas en `casos` (aditivas): `contacto_difusion` (texto que la
--      Verificación autoriza para difundir) y `autoriza_difusion` (bandera).
--   2) Cierra el ACCESO AL ARCHIVO de evidencia para la difusión: la política del bucket
--      `adjuntos` (carpeta casos) deja de conceder LECTURA a `redaccion` y a `opera_redes`
--      (admin de Redes). Así, aunque puedan ver el ESTADO de la solicitud, NO pueden
--      descargar sus evidencias (createSignedUrl falla sin permiso de lectura). Logística
--      conserva su lectura por su política aparte (0156); Verificación/Recopilación/admin
--      siguen igual. La escritura no cambia (esos roles nunca subieron evidencias de casos).
--
-- El ocultamiento del contacto interno en la vista de Redacción se hace en la capa de app
-- (Redacción solo ve `contacto_difusion`). El blindaje DURO del contacto por columna
-- (Redacción leyendo una vista curada en vez de la fila completa) queda para un cambio
-- posterior, por ser un reruteo mayor del módulo. Idempotente. Ejecutar tras 0173.
-- ============================================================

-- 1) Contacto autorizado para difusión (Paso 10). Aditivo, nullable + bandera.
alter table public.casos add column if not exists contacto_difusion text;
alter table public.casos add column if not exists autoriza_difusion boolean not null default false;

-- 2) Evidencias: la difusión (redaccion / opera_redes) pierde la LECTURA del archivo.
--    Reproduce la política vigente (0106) SIN esos dos roles en el `using` (lectura).
--    El `with check` (escritura) se mantiene idéntico a 0106 (ya no incluía difusión).
drop policy if exists "adjuntos_casos" on storage.objects;
create policy "adjuntos_casos" on storage.objects for all to authenticated
  using (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = 'casos'
         and (public.tiene_rol('admin') or public.tiene_rol('verificador')
              or public.es_busqueda() or public.es_buscador_nna()
              or public.tiene_rol('recopilacion')
              or public.opera_verificacion()))
  with check (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = 'casos'
         and (public.tiene_rol('admin') or public.tiene_rol('verificador')
              or public.es_busqueda() or public.es_buscador_nna() or public.tiene_rol('recopilacion')
              or public.opera_verificacion()));
