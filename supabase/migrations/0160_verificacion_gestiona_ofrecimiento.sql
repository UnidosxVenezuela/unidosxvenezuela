-- ============================================================
-- 0160 — Verificación gestiona el Donación-Ofrecimiento (paridad con las solicitudes)
-- ------------------------------------------------------------
-- Verificación ya VE toda la información del ofrecimiento y su bitácora (oportdon_select /
-- bitac_oport_select = es_verificado), y puede verificarlo/observarlo (RPC 0144). Faltaba
-- que —como con las solicitudes (casos)— pudiera:
--   (c) EDITAR el ofrecimiento (hoy oportdon_update es solo de Logística),
--   (d) DEVOLVERLO a Recopilación cuando falte información (con aviso a quien lo registró),
--   (e) AGREGAR imágenes/adjuntos (no existían para ofrecimientos).
-- (Dejar notas en la bitácora ya lo permite la RLS; se desbloquea en la app.)
--
-- Se replican los patrones probados de casos: `info_requerida` + trigger de aviso (0142),
-- rama de edición en la policy de update, y una tabla de adjuntos molde `casos_adjuntos`
-- (0055/0151) sobre el bucket privado 'adjuntos' (0015), carpeta 'oportunidades'.
-- Como abrir el UPDATE es por FILA, se añade un blindaje de columnas (molde
-- proteger_campos_perfil, 0140) para que solo Logística mueva el pipeline (estado/
-- asignación) y solo Verificación fije el veredicto (nadie se auto-verifica).
-- Idempotente. Ejecutar tras los anteriores.
-- ============================================================

-- ── (d) Devolver a Recopilación: «info requerida» + aviso a quien lo registró ──
alter table public.oportunidades_donacion add column if not exists info_requerida text;  -- NULL = no requiere

create or replace function public.notificar_oportunidad_info_requerida()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.info_requerida is not null
     and new.info_requerida is distinct from old.info_requerida
     and new.creado_por is not null then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    values (new.creado_por, 'oportunidad_requiere_info', 'Un ofrecimiento necesita más información',
            'Verificación pidió completar: ' || left(new.info_requerida, 160),
            '/insumos/oportunidades/' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_notificar_oport_info_requerida on public.oportunidades_donacion;
create trigger trg_notificar_oport_info_requerida
  after update of info_requerida on public.oportunidades_donacion
  for each row execute function public.notificar_oportunidad_info_requerida();

-- ── (c) Editar: Verificación (y el creador de Recopilación) también actualizan ──
-- Base 0141 (solo Logística) + ramas de Verificación y del creador de Recopilación (para
-- que pueda completar lo que le devolvieron). La app acota qué campos expone a cada quien.
drop policy if exists oportdon_update on public.oportunidades_donacion;
create policy oportdon_update on public.oportunidades_donacion for update to authenticated
  using (
    public.puede_logistica() or public.puede_verificar() or public.opera_verificacion()
    or (creado_por = auth.uid() and public.tiene_rol('recopilacion'))
  )
  with check (
    public.puede_logistica() or public.puede_verificar() or public.opera_verificacion()
    or (creado_por = auth.uid() and public.tiene_rol('recopilacion'))
  );

-- ── (c-blindaje) Abrir el UPDATE es por FILA, no por columna: hay que blindar ──
-- oportdon_update ahora deja escribir la fila a Verificación y al creador de Recopilación
-- (para editar datos y devolver a Recopilación). Pero la RLS no distingue columnas: sin
-- esto, quien pueda editar podría también mover el PIPELINE de Logística (estado /
-- asignado_a) o AUTO-VERIFICARSE escribiendo el veredicto (estado_verificacion, nota…).
-- Se espeja proteger_campos_perfil (0140): un BEFORE UPDATE que solo deja cambiar cada
-- grupo de columnas a su dueño. Pasan sin fricción: el service_role / las migraciones
-- (auth.uid() null → return) y la RPC verificar_oportunidad_donacion (0144), que corre
-- como el propio verificador (auth.uid() intacto → puede_verificar()).
create or replace function public.proteger_campos_oportunidad()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;

  -- Pipeline de Logística: el estado y la asignación son suyos (o de un admin).
  if (new.estado is distinct from old.estado
      or new.asignado_a is distinct from old.asignado_a)
     and not (public.puede_logistica() or public.es_admin()) then
    raise exception 'Solo Logística puede cambiar el estado o la asignación del ofrecimiento.'
      using errcode = '42501';
  end if;

  -- Veredicto de Verificación: lo fija solo Verificación (en la práctica, vía la RPC 0144).
  if (new.estado_verificacion is distinct from old.estado_verificacion
      or new.nota_verificacion is distinct from old.nota_verificacion
      or new.verificada_por    is distinct from old.verificada_por
      or new.verificada_en     is distinct from old.verificada_en)
     and not (public.puede_verificar() or public.opera_verificacion() or public.es_admin()) then
    raise exception 'Solo Verificación puede fijar el resultado de verificación del ofrecimiento.'
      using errcode = '42501';
  end if;

  -- El correlativo (0155) y la autoría los fija el alta: inmutables salvo para un admin.
  if new.numero is distinct from old.numero and not public.es_admin() then
    raise exception 'El número del ofrecimiento no se puede cambiar.' using errcode = '42501';
  end if;
  if new.creado_por is distinct from old.creado_por and not public.es_admin() then
    raise exception 'No se puede cambiar quién registró el ofrecimiento.' using errcode = '42501';
  end if;

  return new;
end $$;
drop trigger if exists trg_proteger_campos_oportunidad on public.oportunidades_donacion;
create trigger trg_proteger_campos_oportunidad
  before update on public.oportunidades_donacion
  for each row execute function public.proteger_campos_oportunidad();

-- ── (e) Adjuntos del ofrecimiento (imágenes/archivos), molde casos_adjuntos ──
create table if not exists public.oportunidad_adjuntos (
  id             uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null references public.oportunidades_donacion (id) on delete cascade,
  url            text not null,           -- ruta en el bucket 'adjuntos', carpeta 'oportunidades'
  nombre         text not null,
  mime           text,
  creado_por     uuid references public.perfiles (id) on delete set null,
  creado_en      timestamptz not null default now()
);
create index if not exists idx_oport_adj on public.oportunidad_adjuntos (oportunidad_id);
alter table public.oportunidad_adjuntos enable row level security;

-- La visibilidad del adjunto SIGUE a la del ofrecimiento (todos los verificados lo ven).
drop policy if exists oadj_select on public.oportunidad_adjuntos;
create policy oadj_select on public.oportunidad_adjuntos for select to authenticated
  using (exists (select 1 from public.oportunidades_donacion o where o.id = oportunidad_id));
-- Suben quienes gestionan el ofrecimiento: Recopilación (creador), Verificación y Logística.
drop policy if exists oadj_insert on public.oportunidad_adjuntos;
create policy oadj_insert on public.oportunidad_adjuntos for insert to authenticated
  with check (creado_por = auth.uid()
    and (public.puede_verificar() or public.puede_logistica() or public.opera_verificacion()
         or public.tiene_rol('recopilacion'))
    and exists (select 1 from public.oportunidades_donacion o where o.id = oportunidad_id));
drop policy if exists oadj_delete on public.oportunidad_adjuntos;
create policy oadj_delete on public.oportunidad_adjuntos for delete to authenticated
  using (creado_por = auth.uid() or public.es_admin() or public.puede_logistica());

-- Almacenamiento: carpeta 'oportunidades' del bucket privado 'adjuntos' (0015). `for all`
-- para los roles que gestionan ofrecimientos (leen/suben/borran su carpeta).
drop policy if exists adjuntos_oportunidades on storage.objects;
create policy adjuntos_oportunidades on storage.objects for all to authenticated
  using (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = 'oportunidades'
         and (public.tiene_rol('admin') or public.tiene_rol('verificador') or public.tiene_rol('recopilacion')
              or public.puede_logistica() or public.opera_verificacion()))
  with check (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = 'oportunidades'
         and (public.tiene_rol('admin') or public.tiene_rol('verificador') or public.tiene_rol('recopilacion')
              or public.puede_logistica() or public.opera_verificacion()));
