-- ============================================================
-- 0194 — Verificación estructurada del ofrecimiento (campo por campo)
-- ------------------------------------------------------------
-- «Verificada» era un solo clic + nota libre; el checklist solo se mostraba, no se
-- registraba. Esto replica el molde de los casos (0172/0173) sobre el ofrecimiento:
--   · Tabla `oportunidad_verificacion_campo` (una fila por campo, con semáforo).
--   · RPC `marcar_campo_verif_ofrecimiento` (gate de Verificación) que, tras marcar
--     un campo, RECALCULA el veredicto global `estado_verificacion` — así el candado
--     que ya bloquea el avance (0161/0168) pasa a ser «real»: exige todos los campos
--     verificados, no un clic. Al quedar «verificada» dispara el aviso de handoff
--     (0193). El clic único `verificar_oportunidad_donacion` (0144) sigue disponible.
--   · `oportunidad_esta_verificada()` — todos los campos requeridos en verde.
-- Los campos requeridos dependen de la clase (donacion/servicio) y deben coincidir
-- con CAMPOS_VERIF_OFERTA en la app. Idempotente. Ejecutar tras 0193.
-- ============================================================

-- ── 1) Tabla de verificación por campo ──
create table if not exists public.oportunidad_verificacion_campo (
  id             uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null references public.oportunidades_donacion (id) on delete cascade,
  campo          text not null,
  estado         text not null default 'sin_revisar'
                 check (estado in ('sin_revisar', 'verificado', 'requiere_info', 'falso')),
  nota           text,
  verificado_por uuid references public.perfiles (id) on delete set null,
  verificado_en  timestamptz,
  unique (oportunidad_id, campo)
);
create index if not exists idx_oportverif_oportunidad on public.oportunidad_verificacion_campo (oportunidad_id);

alter table public.oportunidad_verificacion_campo enable row level security;
-- SELECT: quien puede ver el ofrecimiento (mismo criterio que oportdon_select). Las
-- escrituras van SOLO por la RPC (no hay policy de insert/update/delete).
drop policy if exists "oportverif_select" on public.oportunidad_verificacion_campo;
create policy "oportverif_select" on public.oportunidad_verificacion_campo for select to authenticated
  using (public.es_verificado());

-- ── 2) Campos requeridos por clase (coincide con CAMPOS_VERIF_OFERTA en la app) ──
create or replace function public.campos_requeridos_ofrecimiento(p_clase text)
returns text[] language sql immutable as $$
  select case coalesce(p_clase, 'donacion')
    when 'servicio' then array['quien_presta','que_atencion','dirigido','donde','horarios',
                               'activo','gratuito','turno','capacidad','responsable']
    else array['quien_dona','que_dona','cantidad','disponibilidad','entrega','coordina','condiciones']
  end;
$$;

-- ── 3) ¿Está verificado el ofrecimiento? Todos los campos requeridos en verde ──
create or replace function public.oportunidad_esta_verificada(p_oportunidad uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1
    from unnest(public.campos_requeridos_ofrecimiento(
           (select clase from public.oportunidades_donacion where id = p_oportunidad))) as req(campo)
    where not exists (
      select 1 from public.oportunidad_verificacion_campo v
      where v.oportunidad_id = p_oportunidad and v.campo = req.campo and v.estado = 'verificado'
    )
  );
$$;

-- ── 4) RPC: marcar un campo + recalcular el veredicto global ──
create or replace function public.marcar_campo_verif_ofrecimiento(
  p_oportunidad uuid, p_campo text, p_estado text, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_clase text; v_hay_neg boolean; v_todos boolean; v_nuevo text;
begin
  if auth.uid() is null then raise exception 'No autenticado.' using errcode = '42501'; end if;
  if not (public.es_admin() or public.puede_verificar() or public.opera_verificacion()) then
    raise exception 'Solo Verificación puede verificar el ofrecimiento.' using errcode = '42501';
  end if;
  if coalesce(trim(p_campo), '') = '' then raise exception 'Campo vacío.' using errcode = '22023'; end if;
  if p_estado not in ('sin_revisar','verificado','requiere_info','falso') then
    raise exception 'Estado de verificación no válido.' using errcode = '22023';
  end if;

  insert into public.oportunidad_verificacion_campo (oportunidad_id, campo, estado, nota, verificado_por, verificado_en)
  values (p_oportunidad, p_campo, p_estado, nullif(trim(coalesce(p_nota, '')), ''), auth.uid(), now())
  on conflict (oportunidad_id, campo) do update
    set estado = excluded.estado, nota = excluded.nota,
        verificado_por = excluded.verificado_por, verificado_en = excluded.verificado_en;

  -- Recalcular el veredicto global (feed del candado 0161/0168).
  select clase into v_clase from public.oportunidades_donacion where id = p_oportunidad;
  v_todos := public.oportunidad_esta_verificada(p_oportunidad);
  select exists (
    select 1 from public.oportunidad_verificacion_campo v
    where v.oportunidad_id = p_oportunidad
      and v.campo = any(public.campos_requeridos_ofrecimiento(v_clase))
      and v.estado in ('requiere_info','falso')
  ) into v_hay_neg;
  v_nuevo := case when v_todos then 'verificada' when v_hay_neg then 'observada' else 'pendiente' end;

  update public.oportunidades_donacion
     set estado_verificacion = v_nuevo,
         verificada_por = case when v_nuevo = 'verificada' then auth.uid() else verificada_por end,
         verificada_en  = case when v_nuevo = 'verificada' then now() else verificada_en end,
         actualizado_en = now()
   where id = p_oportunidad;

  perform public.registrar_auditoria('verificacion_campo_ofrecimiento', 'oportunidades_donacion',
    p_oportunidad::text, jsonb_build_object('campo', p_campo, 'estado', p_estado, 'global', v_nuevo));
end $$;

revoke all on function public.marcar_campo_verif_ofrecimiento(uuid, text, text, text) from public;
grant execute on function public.marcar_campo_verif_ofrecimiento(uuid, text, text, text) to authenticated;
grant execute on function public.oportunidad_esta_verificada(uuid) to authenticated;
