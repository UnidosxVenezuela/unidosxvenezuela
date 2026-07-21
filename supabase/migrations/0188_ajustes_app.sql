-- ============================================================
-- 0188 — Ajustes globales de la aplicación (clave/valor, editables por admin)
-- ------------------------------------------------------------
-- Hasta ahora no había ningún almacén de configuración global en la BD: todo lo
-- ajustable vivía en variables de entorno (deploy). Se necesita un valor que un
-- ADMIN pueda cambiar desde la app sin re-desplegar — el primer caso de uso es el
-- LINK DEL GRUPO DE WHATSAPP al que Envío a Redacción manda la info de un caso
-- (clave `whatsapp_grupo_difusion`).
--
-- Modelo: tabla clave/valor. Lectura para cualquier autenticado (Redacción debe leer
-- el link para abrir el grupo). Escritura SOLO por la RPC `set_ajuste` (security
-- definer), que exige admin general y audita el cambio. Idempotente. Tras 0187.
-- ============================================================

create table if not exists public.ajustes_app (
  clave           text primary key,
  valor           text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references public.perfiles (id) on delete set null
);

alter table public.ajustes_app enable row level security;

-- Lectura: cualquier autenticado (p. ej. Redacción necesita el link del grupo).
drop policy if exists "ajustes_select" on public.ajustes_app;
create policy "ajustes_select" on public.ajustes_app for select to authenticated
  using (true);

-- Sin políticas de INSERT/UPDATE/DELETE: la escritura pasa SOLO por la RPC.

create or replace function public.set_ajuste(p_clave text, p_valor text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cambiar los ajustes.' using errcode = '42501';
  end if;
  if coalesce(trim(p_clave), '') = '' then
    raise exception 'Falta la clave del ajuste.' using errcode = '22023';
  end if;
  insert into public.ajustes_app (clave, valor, actualizado_en, actualizado_por)
    values (trim(p_clave), nullif(trim(coalesce(p_valor, '')), ''), now(), auth.uid())
  on conflict (clave) do update
    set valor = excluded.valor, actualizado_en = now(), actualizado_por = auth.uid();
  perform public.registrar_auditoria('ajuste_cambiado', 'ajustes_app', trim(p_clave),
    jsonb_build_object('clave', trim(p_clave)));
end $$;

revoke all on function public.set_ajuste(text, text) from public;
grant execute on function public.set_ajuste(text, text) to authenticated;

comment on table public.ajustes_app is
  'Ajustes globales clave/valor editables por admin (0187). Lectura: autenticados; escritura: solo admin vía set_ajuste. Primer uso: whatsapp_grupo_difusion (link del grupo de WhatsApp de Redacción).';
