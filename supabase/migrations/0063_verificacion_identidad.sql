-- ============================================================
-- 0063 — Segunda verificación de identidad
-- ------------------------------------------------------------
-- Proceso (tipo wizard) en el que la persona sube:
--   · una FOTO EN VIVO (cámara) con su rostro + su documento sostenido, y
--   · una FOTO del documento de identidad.
-- Los administradores aprueban o rechazan. Por ahora es OPERATIVA (no
-- obligatoria para ningún rol). Las imágenes van a un bucket PRIVADO
-- 'identidad'; solo la persona dueña y los admin pueden verlas.
-- Idempotente.
-- ============================================================

create table if not exists public.verificaciones_identidad (
  id              uuid primary key default gen_random_uuid(),
  perfil_id       uuid not null unique references public.perfiles (id) on delete cascade,
  estado          text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  selfie_path     text not null,   -- foto rostro + documento (cámara en vivo)
  documento_path  text not null,   -- foto del documento de identidad
  consentimiento  boolean not null default false,  -- aceptó el uso de datos del proyecto
  nota_revision   text,
  revisado_por    uuid references public.perfiles (id),
  revisado_en     timestamptz,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists idx_verif_estado on public.verificaciones_identidad (estado, creado_en desc);

alter table public.verificaciones_identidad enable row level security;

-- La persona ve su propia solicitud; el admin ve todas.
drop policy if exists vi_select on public.verificaciones_identidad;
create policy vi_select on public.verificaciones_identidad for select to authenticated
  using (perfil_id = auth.uid() or public.es_admin());

-- La persona crea su solicitud (siempre para sí misma).
drop policy if exists vi_insert on public.verificaciones_identidad;
create policy vi_insert on public.verificaciones_identidad for insert to authenticated
  with check (perfil_id = auth.uid());

-- La persona puede reenviar (deja su fila en 'pendiente'); NO puede auto-aprobarse.
-- El admin puede cambiar el estado (aprobar/rechazar).
drop policy if exists vi_update_propia on public.verificaciones_identidad;
create policy vi_update_propia on public.verificaciones_identidad for update to authenticated
  using (perfil_id = auth.uid())
  with check (perfil_id = auth.uid() and estado = 'pendiente');

drop policy if exists vi_update_admin on public.verificaciones_identidad;
create policy vi_update_admin on public.verificaciones_identidad for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ── Bucket privado para las imágenes de identidad ──
insert into storage.buckets (id, name, public) values ('identidad', 'identidad', false)
on conflict (id) do nothing;

-- Rutas: '<perfil_id>/selfie-*.jpg' y '<perfil_id>/doc-*.jpg' → la carpeta es el id.
drop policy if exists identidad_insert on storage.objects;
create policy identidad_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'identidad' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists identidad_select on storage.objects;
create policy identidad_select on storage.objects for select to authenticated
  using (bucket_id = 'identidad'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));

drop policy if exists identidad_update on storage.objects;
create policy identidad_update on storage.objects for update to authenticated
  using (bucket_id = 'identidad' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists identidad_delete on storage.objects;
create policy identidad_delete on storage.objects for delete to authenticated
  using (bucket_id = 'identidad'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));
