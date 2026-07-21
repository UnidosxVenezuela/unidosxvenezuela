-- ============================================================
-- 0187 — Fotos «aptas para difusión» (curadas por Verificación)
-- ------------------------------------------------------------
-- Problema: Redacción difunde SIN imagen. La foto es el activo #1 de alcance, pero
-- desde 0174 (política de storage) + 0180 (a Redacción se le quitó `casos_select` y
-- lee la vista curada `casos_difusion`), Redacción ya NO puede leer las filas de
-- `casos_adjuntos` (cadj_select exige VER el caso) ni descargar el objeto del bucket.
--
-- Solución (curación por Verificación, exposición mínima):
--   1) `casos_adjuntos.apto_difusion` (bool) — Verificación marca qué adjunto es
--      publicable. Aditiva. Se escribe SOLO por RPC (la tabla no tiene política UPDATE).
--   2) Vista curada `casos_adjuntos_difusion` — expone SOLO los adjuntos aptos a
--      Redacción/Redes/admin (security_invoker=false, auto-acotada por rol), análoga a
--      `casos_difusion` (0180). Sin ella, Redacción no ve la fila del adjunto.
--   3) Rama nueva de la política de storage `adjuntos` — reconcede LECTURA del OBJETO a
--      Redacción/Redes solo sobre adjuntos aptos (si no, la vista da metadatos pero
--      `createSignedUrl` falla). No toca la política 0174 (se añade una policy aparte;
--      la RLS es permisiva = OR).
-- Idempotente. Tras 0186.
-- ============================================================

-- ── (1) Columna «apto para difusión» + quién/cuándo la marcó ──
alter table public.casos_adjuntos add column if not exists apto_difusion boolean not null default false;
alter table public.casos_adjuntos add column if not exists apto_por uuid references public.perfiles (id) on delete set null;
alter table public.casos_adjuntos add column if not exists apto_en timestamptz;

comment on column public.casos_adjuntos.apto_difusion is
  'Adjunto marcado por Verificación como publicable en difusión (0187). Solo estos los ve Redacción (vista casos_adjuntos_difusion).';

-- ── RPC: Verificación marca/desmarca un adjunto como apto para difusión ──
-- Misma frontera por categoría que la verificación por campo (0172): Desaparecidos →
-- Búsqueda/admin; el resto → Verificación/admin. Escritura por RPC porque casos_adjuntos
-- no tiene política de UPDATE.
create or replace function public.marcar_adjunto_difusion(p_adjunto uuid, p_apto boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_caso uuid; v_cat text;
begin
  select a.caso_id, c.categoria into v_caso, v_cat
    from public.casos_adjuntos a
    join public.casos c on c.id = a.caso_id
   where a.id = p_adjunto;
  if v_caso is null then
    raise exception 'Adjunto no encontrado.' using errcode = 'P0002';
  end if;

  if v_cat = 'Desaparecidos' then
    if not (public.es_admin() or public.puede_atender_busqueda(v_caso)) then
      raise exception 'No tienes permiso para curar adjuntos de esta solicitud.' using errcode = '42501';
    end if;
  else
    if not (public.es_admin() or public.puede_verificar()) then
      raise exception 'No tienes permiso para curar adjuntos de esta solicitud.' using errcode = '42501';
    end if;
  end if;

  update public.casos_adjuntos
     set apto_difusion = coalesce(p_apto, false),
         apto_por = case when coalesce(p_apto, false) then auth.uid() else null end,
         apto_en  = case when coalesce(p_apto, false) then now() else null end
   where id = p_adjunto;

  perform public.registrar_auditoria('adjunto_difusion', 'casos', v_caso::text,
    jsonb_build_object('adjunto', p_adjunto::text, 'apto', coalesce(p_apto, false)));
end $$;

revoke all on function public.marcar_adjunto_difusion(uuid, boolean) from public;
grant execute on function public.marcar_adjunto_difusion(uuid, boolean) to authenticated;

-- ── (2) Vista curada: solo adjuntos APTOS, visibles a Redacción/Redes/admin ──
-- security_invoker = false → corre con permisos del dueño (bypassa cadj_select, del que
-- Redacción quedó fuera tras 0180); el WHERE la auto-acota por rol y a apto_difusion.
drop view if exists public.casos_adjuntos_difusion;
create view public.casos_adjuntos_difusion
  with (security_invoker = false) as
  select a.id, a.caso_id, a.url, a.nombre, a.mime, a.creado_en, a.apto_en
    from public.casos_adjuntos a
    join public.casos c on c.id = a.caso_id
   where a.apto_difusion = true
     and c.categoria is distinct from 'Desaparecidos'
     and public.es_verificado()
     and (public.es_admin() or public.opera_redes() or public.tiene_rol('redaccion'));

grant select on public.casos_adjuntos_difusion to authenticated;

comment on view public.casos_adjuntos_difusion is
  'Fuente curada de adjuntos para Redacción/Redes (0187): solo los marcados apto_difusion, nunca Desaparecidos. Se auto-acota por rol; corre con permisos del dueño (Redacción no tiene cadj_select tras 0180).';

-- ── (3) Storage: reconceder LECTURA del objeto a Redacción/Redes solo si es apto ──
-- Policy aparte (no toca 0174). RLS permisiva = OR, así que suma acceso de lectura sobre
-- los objetos cuyo adjunto está marcado apto. `url` en casos_adjuntos == storage.objects.name.
drop policy if exists "adjuntos_casos_difusion" on storage.objects;
create policy "adjuntos_casos_difusion" on storage.objects for select to authenticated
  using (bucket_id = 'adjuntos'
    and (storage.foldername(name))[1] = 'casos'
    and (public.opera_redes() or public.tiene_rol('redaccion'))
    and exists (select 1 from public.casos_adjuntos a
                where a.url = storage.objects.name and a.apto_difusion));
