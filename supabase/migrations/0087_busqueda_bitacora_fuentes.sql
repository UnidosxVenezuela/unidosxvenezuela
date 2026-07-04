-- ============================================================
-- 0087 — Grupo de Búsqueda (Fase 2: bitácora confidencial + catálogo de fuentes)
-- ------------------------------------------------------------
-- · bitacora_busqueda: registro confidencial de gestiones y verificación cruzada
--   de cada caso (fuente consultada, resultado, tipo de contacto). Paridad REAL
--   con Psicosocial: solo la ve/anota el buscador ASIGNADO al caso o el MANDO —
--   NO todo el equipo (hallazgo 7 de la revisión adversarial). Protege el teléfono
--   del reportante, las fuentes/resultados y los datos de custodia NNA.
-- · fuentes_verificacion: catálogo (no confidencial) de las plataformas externas
--   contra las que se verifica (≥3 según el manual). Lo consulta el equipo con 2ª
--   verificación; lo gestiona (crea/edita) el mando.
-- Idempotente. Ejecutar tras 0086.
-- ============================================================

-- ── 1) ¿Puede ATENDER este caso? (ver bitácora / anotar) ──
-- Análogo per-caso de puede_atender_acompanamiento (Psicosocial 0052): el mando,
-- o el buscador asignado al caso. SECURITY DEFINER para leer casos sin recursión.
create or replace function public.puede_atender_busqueda(p_caso uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_mando_busqueda()
      or exists (select 1 from public.casos c where c.id = p_caso and c.asignado_a = auth.uid());
$$;
grant execute on function public.puede_atender_busqueda(uuid) to authenticated;

-- ── 2) Bitácora confidencial de la búsqueda ──
create table if not exists public.bitacora_busqueda (
  id        uuid primary key default gen_random_uuid(),
  caso_id   uuid not null references public.casos (id) on delete cascade,
  autor_id  uuid references public.perfiles (id) on delete set null,
  contenido text not null,
  fuente    text,                      -- fuente consultada (nombre de fuentes_verificacion o libre)
  resultado text,                      -- encontrado / no_encontrado / dudoso
  tipo      text,                      -- llamada / consulta / otro
  creado_en timestamptz not null default now()
);
create index if not exists idx_bitacora_busqueda_caso on public.bitacora_busqueda (caso_id, creado_en desc);

alter table public.bitacora_busqueda enable row level security;

-- SELECT / INSERT: solo el asignado del caso o el mando (confidencial per-caso).
drop policy if exists "bitacora_busqueda_select" on public.bitacora_busqueda;
create policy "bitacora_busqueda_select" on public.bitacora_busqueda for select to authenticated
  using (public.es_admin() or public.puede_atender_busqueda(caso_id));

drop policy if exists "bitacora_busqueda_insert" on public.bitacora_busqueda;
create policy "bitacora_busqueda_insert" on public.bitacora_busqueda for insert to authenticated
  with check (autor_id = auth.uid()
              and public.identidad_aprobada()
              and public.puede_atender_busqueda(caso_id));

-- DELETE: el autor de la nota o el mando.
drop policy if exists "bitacora_busqueda_delete" on public.bitacora_busqueda;
create policy "bitacora_busqueda_delete" on public.bitacora_busqueda for delete to authenticated
  using (autor_id = auth.uid() or public.es_mando_busqueda());

-- ── 3) Catálogo de fuentes de verificación ──
create table if not exists public.fuentes_verificacion (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  descripcion text,
  url         text,
  categoria   text,                    -- nodo/hospital/fe_de_vida/facial/fallecimiento/nna/contencion
  para_nna    boolean not null default false,
  orden       int not null default 0,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

alter table public.fuentes_verificacion enable row level security;

-- SELECT: el equipo de Búsqueda con 2ª verificación (o admin).
drop policy if exists "fuentes_select" on public.fuentes_verificacion;
create policy "fuentes_select" on public.fuentes_verificacion for select to authenticated
  using (public.es_admin() or (public.es_busqueda() and public.identidad_aprobada()));

-- Gestión (crear/editar/borrar): solo el mando de Búsqueda.
drop policy if exists "fuentes_gestion" on public.fuentes_verificacion;
create policy "fuentes_gestion" on public.fuentes_verificacion for all to authenticated
  using (public.es_mando_busqueda()) with check (public.es_mando_busqueda());

-- ── 4) Semilla de fuentes del manual (solo si la tabla está vacía) ──
insert into public.fuentes_verificacion (nombre, descripcion, categoria, para_nna, orden)
select * from (values
  ('Buscador NODO', 'Buscador central de personas reportadas (NODO).', 'nodo', false, 0),
  ('Hospitales en Venezuela', 'Listados de personas ingresadas en centros de salud.', 'hospital', false, 1),
  ('Red de Ayuda Venezuela', 'Red de reportes y fe de vida.', 'fe_de_vida', false, 2),
  ('Red Solidaria Venezuela', 'Red colaborativa de búsqueda y reportes.', 'nodo', false, 3),
  ('Reencuentro (reconocimiento facial)', 'Cotejo por reconocimiento facial.', 'facial', false, 4),
  ('AID VE', 'Registro de fallecimientos.', 'fallecimiento', false, 5),
  ('Reencuentro Seguro VE', 'Búsqueda especializada de niños, niñas y adolescentes (NNA).', 'nna', true, 6),
  ('Iniciativa Calma', 'Apoyo y contención emocional (farove.org).', 'contencion', false, 7)
) as v(nombre, descripcion, categoria, para_nna, orden)
where not exists (select 1 from public.fuentes_verificacion);

-- ── 5) Auditoría + realtime ──
drop trigger if exists aud_bitacora_busqueda on public.bitacora_busqueda;
create trigger aud_bitacora_busqueda after insert or update or delete on public.bitacora_busqueda
  for each row execute function public.auditar_cambio();

do $$ begin alter publication supabase_realtime add table public.bitacora_busqueda; exception when duplicate_object then null; end $$;
