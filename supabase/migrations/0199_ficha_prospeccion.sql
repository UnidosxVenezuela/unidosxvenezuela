-- ============================================================
-- 0199 — Ficha de Prospección: extiende el CRM de Captación (`oportunidades`) al
--        registro de empresas del departamento + 2ª verificación campo por campo +
--        sello del tiempo Pendiente→Verificado.
-- ------------------------------------------------------------
-- Alianzas Estratégicas · Fase 2. El CRM de Captación (0129) ya tiene el flujo
-- investigación → verificado → enviado (≈ Pendiente/Verificado/Enviado a Logística).
-- Aquí se le añade la FICHA (rubro, responsable, contactos, capacidades, restricciones,
-- score de confiabilidad), se abre el registro a TODO el departamento (Prospección y
-- Captación alimentan el mismo «Captado»), se replica el molde de verificación por
-- campo de 0172/0194, y se sella el tiempo a verificado + un candado que impide
-- «Enviar a Logística» una ficha sin verificar. Idempotente. Ejecutar tras 0198.
-- ============================================================

-- 1) Campos de la Ficha (todos opcionales; el CRM simple sigue funcionando igual).
alter table public.oportunidades
  add column if not exists rubro                text,
  add column if not exists direccion            text,
  add column if not exists responsable_nombre   text,
  add column if not exists responsable_telefono text,
  add column if not exists responsable_cargo    text,
  add column if not exists contactos_operativos text,
  add column if not exists contactos_alternos   text,
  add column if not exists capacidades          text,   -- capacidades y recursos (texto)
  add column if not exists volumen              text,   -- cantidad que puede manejar
  add column if not exists transporte           boolean not null default false,
  add column if not exists logistica_entrega    text,
  add column if not exists restricciones        text,
  add column if not exists score_confiabilidad  int  check (score_confiabilidad is null or score_confiabilidad between 1 and 5),
  add column if not exists origen               text check (origen is null or origen in ('prospeccion','captacion')),
  add column if not exists verificado_en        timestamptz,
  add column if not exists verificado_por       uuid references public.perfiles (id) on delete set null;

-- 2) Abrir el registro a TODO el departamento. puede_alianzas() ⊇ puede_captacion()
--    → ampliación pura (admin + Captación conservan acceso; Prospección/Afiliación lo ganan).
drop policy if exists oportunidades_select on public.oportunidades;
create policy oportunidades_select on public.oportunidades for select to authenticated
  using (public.puede_alianzas());
drop policy if exists oportunidades_insert on public.oportunidades;
create policy oportunidades_insert on public.oportunidades for insert to authenticated
  with check (public.puede_alianzas() and creado_por = auth.uid());
drop policy if exists oportunidades_update on public.oportunidades;
create policy oportunidades_update on public.oportunidades for update to authenticated
  using (public.puede_alianzas()) with check (public.puede_alianzas());
drop policy if exists oportunidades_delete on public.oportunidades;
create policy oportunidades_delete on public.oportunidades for delete to authenticated
  using (public.puede_alianzas());

drop policy if exists oportunidades_obj_select on storage.objects;
create policy oportunidades_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'oportunidades' and public.puede_alianzas());
drop policy if exists oportunidades_obj_insert on storage.objects;
create policy oportunidades_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'oportunidades' and public.puede_alianzas());
drop policy if exists oportunidades_obj_delete on storage.objects;
create policy oportunidades_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'oportunidades' and public.puede_alianzas());

-- 3) Verificación por campo de la Ficha (molde de 0172/0194).
create table if not exists public.oportunidad_captacion_verif_campo (
  id             uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null references public.oportunidades (id) on delete cascade,
  campo          text not null,
  estado         text not null default 'sin_revisar'
                 check (estado in ('sin_revisar', 'verificado', 'requiere_info', 'falso')),
  nota           text,
  verificado_por uuid references public.perfiles (id) on delete set null,
  verificado_en  timestamptz,
  unique (oportunidad_id, campo)
);
create index if not exists idx_oportcapverif_oport on public.oportunidad_captacion_verif_campo (oportunidad_id);

alter table public.oportunidad_captacion_verif_campo enable row level security;
drop policy if exists "oportcapverif_select" on public.oportunidad_captacion_verif_campo;
create policy "oportcapverif_select" on public.oportunidad_captacion_verif_campo for select to authenticated
  using (public.puede_alianzas());

-- Campos requeridos de la ficha (coincide con CAMPOS_VERIF_FICHA en la app).
create or replace function public.campos_requeridos_prospeccion()
returns text[] language sql immutable as $$
  select array['identidad', 'responsable', 'capacidad', 'condiciones', 'confiabilidad'];
$$;

-- ¿Ficha verificada? Todos los campos requeridos en verde.
create or replace function public.prospeccion_esta_verificada(p_oportunidad uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from unnest(public.campos_requeridos_prospeccion()) as req(campo)
    where not exists (
      select 1 from public.oportunidad_captacion_verif_campo v
      where v.oportunidad_id = p_oportunidad and v.campo = req.campo and v.estado = 'verificado'
    )
  );
$$;
grant execute on function public.prospeccion_esta_verificada(uuid) to authenticated;

-- RPC: marcar un campo (gate del departamento).
create or replace function public.marcar_campo_verif_prospeccion(
  p_oportunidad uuid, p_campo text, p_estado text, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado.' using errcode = '42501'; end if;
  if not public.puede_alianzas() then
    raise exception 'Solo el departamento de Alianzas puede verificar la ficha.' using errcode = '42501';
  end if;
  if coalesce(trim(p_campo), '') = '' then raise exception 'Campo vacío.' using errcode = '22023'; end if;
  if p_estado not in ('sin_revisar', 'verificado', 'requiere_info', 'falso') then
    raise exception 'Estado de verificación no válido.' using errcode = '22023';
  end if;

  insert into public.oportunidad_captacion_verif_campo (oportunidad_id, campo, estado, nota, verificado_por, verificado_en)
  values (p_oportunidad, p_campo, p_estado, nullif(trim(coalesce(p_nota, '')), ''), auth.uid(), now())
  on conflict (oportunidad_id, campo) do update
    set estado = excluded.estado, nota = excluded.nota,
        verificado_por = excluded.verificado_por, verificado_en = excluded.verificado_en;

  perform public.registrar_auditoria('verificacion_campo_prospeccion', 'oportunidades',
    p_oportunidad::text, jsonb_build_object('campo', p_campo, 'estado', p_estado));
end $$;
revoke all on function public.marcar_campo_verif_prospeccion(uuid, text, text, text) from public;
grant execute on function public.marcar_campo_verif_prospeccion(uuid, text, text, text) to authenticated;

-- 4) Sello del tiempo a verificado + candado «no enviar a Logística sin verificar».
create or replace function public.guardar_prospeccion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;  -- sistema / migraciones: sin candado
  -- Candado: no pasar a 'enviado' (Enviado a Logística) sin la 2ª verificación completa.
  -- Solo se exige si la FICHA se está usando (rubro/capacidades cargados, origen
  -- prospección, o verificación iniciada); una entrada simple de Captación no se toca.
  if new.estado = 'enviado' and old.estado is distinct from 'enviado' then
    if (new.rubro is not null or new.capacidades is not null or new.origen = 'prospeccion'
        or exists (select 1 from public.oportunidad_captacion_verif_campo v where v.oportunidad_id = new.id))
       and not public.prospeccion_esta_verificada(new.id) then
      raise exception 'Completa la 2ª verificación de la ficha antes de enviar a Logística.' using errcode = '42501';
    end if;
  end if;
  -- Sello: el primer paso a 'verificado'/'enviado' marca el tiempo (mide Pendiente→Verificado).
  if new.estado in ('verificado', 'enviado') and new.verificado_en is null then
    new.verificado_en  := now();
    new.verificado_por := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_guardar_prospeccion on public.oportunidades;
create trigger trg_guardar_prospeccion before update of estado on public.oportunidades
  for each row execute function public.guardar_prospeccion();

-- Backfill best-effort del sello para las ya verificadas/enviadas (usa actualizado_en).
update public.oportunidades set verificado_en = actualizado_en
  where estado in ('verificado', 'enviado') and verificado_en is null;
