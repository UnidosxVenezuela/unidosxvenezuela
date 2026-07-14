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
-- Idempotente. Ejecutar tras 0159.
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
