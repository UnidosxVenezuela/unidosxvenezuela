-- ============================================================
-- 0213 — Logística adjunta imágenes A LA PROPIA SOLICITUD (visibles para todas las áreas)
-- ------------------------------------------------------------
-- Aclaración del área de Logística sobre 0212: las imágenes no son solo para su gestión
-- interna (insumo recibido, guía de despacho, punto de entrega). A veces hace falta
-- adjuntar una imagen A LA SOLICITUD MISMA, y que la vean TODAS las áreas.
--
-- La «solicitud» que ven todas las áreas es el CASO. Sus adjuntos ya se leen por
-- `cadj_select` (0151: lo ve quien puede ver el caso) y Redacción/Redes los ven por
-- `casos_adjuntos_difusion` (0209). Lo único que faltaba: Logística podía LEER esos
-- adjuntos (0156) pero no SUBIRLOS.
--
-- Aquí se abre esa escritura (tabla + storage) y, de paso, se amplía la lectura de la
-- galería operativa de 0212 para que Verificación y Redacción tampoco se queden fuera.
-- Idempotente. Ejecutar tras 0212.
-- ============================================================

-- ── (A) Logística puede ADJUNTAR al caso (tabla) ──
-- 0207 VERBATIM + rama de Logística. Se conserva `creado_por = auth.uid()` (trazabilidad).
-- Nunca «Desaparecidos»: ese flujo es de Búsqueda y no pasa por Logística.
drop policy if exists "cadj_insert" on public.casos_adjuntos;
create policy "cadj_insert" on public.casos_adjuntos for insert to authenticated
  with check (creado_por = auth.uid() and (
    exists (select 1 from public.casos c where c.id = caso_id and public.puede_ver_caso(c.creado_por))
    or (public.puede_logistica() and exists (
          select 1 from public.casos c
          where c.id = caso_id and c.categoria is distinct from 'Desaparecidos'))
  ));

-- ── (B) Logística puede SUBIR el objeto a la carpeta del caso (storage) ──
-- Policy aparte, solo INSERT: el `for all` de 0174 (que da lectura+escritura a
-- Verificación/Recopilación/Búsqueda) NO se toca. Las permissive se SUMAN.
-- La LECTURA de Logística ya existe desde 0156 (adjuntos_casos_logistica_sel).
drop policy if exists adjuntos_casos_logistica_ins on storage.objects;
create policy adjuntos_casos_logistica_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = 'casos'
              and public.puede_logistica());

-- ── (C) La galería operativa de la solicitud (0212) deja de ser solo de Logística ──
-- Decisión del equipo: que Verificación y Redacción también las vean. Se amplía la
-- lectura de la tabla Y del bucket privado 'entregas' (sin la segunda, la fila se leería
-- pero la imagen no se podría abrir). El ALTA y la BAJA siguen siendo de Logística.
drop policy if exists insadj_select on public.insumos_adjuntos;
create policy insadj_select on public.insumos_adjuntos for select to authenticated
  using (public.puede_logistica() or public.puede_ver_casos() or public.puede_pipeline());

drop policy if exists entregas_obj_select on storage.objects;
create policy entregas_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'entregas'
         and (public.puede_logistica() or public.puede_ver_casos() or public.puede_pipeline()));

comment on table public.insumos_adjuntos is
  'Imágenes/adjuntos de una solicitud de insumo (0212). La fila guarda la RUTA dentro del bucket privado «entregas»; la app sirve URLs firmadas. Suben y quitan Logística/admin; desde 0213 también LEEN Verificación/Recopilación y Redacción/Redes. Para que una imagen la vea TODA el área operativa en la solicitud, Logística la adjunta al CASO (casos_adjuntos).';
