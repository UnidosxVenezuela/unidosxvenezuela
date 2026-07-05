-- ============================================================
-- 0097 — Fuentes de verificación: visibles al Buscador NNA y al Enlace + LocalizaPacientes
-- ------------------------------------------------------------
-- El catálogo de fuentes (0087) solo lo veía el rol `busqueda`. Con el equipo NNA
-- (0093) y el Enlace operativo (0094), ambos también verifican/validan y necesitan
-- las fuentes. Se amplía el SELECT y se anexa LocalizaPacientes (para buscadores y
-- Buscador NNA). Idempotente. Ejecutar tras 0096.
-- ============================================================

-- SELECT: además del buscador general, el Buscador NNA y el Enlace (con 2ª verif).
drop policy if exists "fuentes_select" on public.fuentes_verificacion;
create policy "fuentes_select" on public.fuentes_verificacion for select to authenticated
  using (
    public.es_admin()
    or (public.es_busqueda() and public.identidad_aprobada())
    or (public.es_buscador_nna() and public.identidad_aprobada())
    or (public.es_enlace() and public.identidad_aprobada())
  );

-- Anexar LocalizaPacientes como fuente (adultos y NNA), si aún no existe.
insert into public.fuentes_verificacion (nombre, descripcion, url, categoria, para_nna, orden)
select 'LocalizaPacientes',
       'Localización de pacientes en hospitales y centros de salud (adultos y NNA).',
       'https://localizapacientes.com/', 'hospital', false, 8
where not exists (
  select 1 from public.fuentes_verificacion where lower(btrim(nombre)) = 'localizapacientes'
);
