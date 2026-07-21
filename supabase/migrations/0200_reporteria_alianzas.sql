-- ============================================================
-- 0200 — Reportería de Alianzas Estratégicas + escalado de solicitudes de Logística
-- ------------------------------------------------------------
-- Alianzas Estratégicas · Fase 3. Dos piezas:
--  1) RPC `resumen_alianzas()`: la FOTO agregada del registro «Captado» (cuántas
--     empresas, por estado/rubro/score, y el tiempo Pendiente→Verificado), lista para
--     el respaldo descargable que se presenta a las empresas. Gate `puede_alianzas()`.
--  2) Escalado: una solicitud de insumo de Logística puede enviarse a Alianzas
--     Estratégicas y/o marcarse como «Voluntariado Profesional», con aviso al
--     departamento. Columnas + RPC de escalado (audita y notifica).
-- Idempotente. Ejecutar tras 0199.
-- ============================================================

-- ── 1) RPC de reportería (patrón resumen_sitrep 0196, gate del departamento) ──
create or replace function public.resumen_alianzas()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.puede_alianzas() then
    raise exception 'Sin permiso para el reporte de Alianzas.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'total_empresas',      (select count(*) from public.oportunidades),
      'verificadas',         (select count(*) from public.oportunidades where estado in ('verificado', 'enviado')),
      'enviadas_logistica',  (select count(*) from public.oportunidades where estado = 'enviado'),
      'en_investigacion',    (select count(*) from public.oportunidades where estado = 'investigacion'),
      'con_capacidad',       (select count(*) from public.oportunidades where volumen is not null or capacidades is not null),
      'prom_dias_verificado', (
        select round(avg(extract(epoch from (verificado_en - creado_en)) / 86400.0)::numeric, 1)
        from public.oportunidades where verificado_en is not null
      )
    ),
    -- Cuántas empresas por estado (Pendiente / Verificado / Enviado a Logística).
    'por_estado', coalesce((
      select jsonb_object_agg(estado, n) from (
        select estado, count(*)::bigint as n from public.oportunidades group by estado
      ) s), '{}'::jsonb),
    -- Por rubro (para saber qué sectores se han captado).
    'por_rubro', coalesce((
      select jsonb_object_agg(rubro, n) from (
        select coalesce(nullif(trim(rubro), ''), 'Sin especificar') as rubro, count(*)::bigint as n
        from public.oportunidades group by coalesce(nullif(trim(rubro), ''), 'Sin especificar')
      ) r), '{}'::jsonb),
    -- Distribución del score de confiabilidad (1-5 o sin evaluar).
    'por_score', coalesce((
      select jsonb_object_agg(score, n) from (
        select coalesce(score_confiabilidad::text, 'sin') as score, count(*)::bigint as n
        from public.oportunidades group by coalesce(score_confiabilidad::text, 'sin')
      ) sc), '{}'::jsonb)
  ) into v;

  return v;
end $$;
revoke all on function public.resumen_alianzas() from public;
grant execute on function public.resumen_alianzas() to authenticated;

-- ── 2) Escalado de una solicitud de Logística a Alianzas Estratégicas ──
-- Cuando Logística no puede cubrir una solicitud con inventario/proveedores, puede
-- «Enviarla a Alianzas Estratégicas» (que busque una empresa/aliado) y/o pedir
-- «Voluntariado Profesional». Se marca en la propia solicitud (la RLS solins_update ya
-- exige puede_logistica) y un trigger avisa al departamento. La lectura ya está abierta
-- a todo verificado (solins_lectura = es_verificado), así que Alianzas puede abrirlas.
alter table public.solicitudes_insumo
  add column if not exists escalado_alianzas             boolean not null default false,
  add column if not exists escalado_alianzas_en          timestamptz,
  add column if not exists escalado_alianzas_por         uuid references public.perfiles (id) on delete set null,
  add column if not exists voluntariado_profesional      boolean not null default false,
  add column if not exists voluntariado_profesional_en   timestamptz,
  add column if not exists voluntariado_profesional_por  uuid references public.perfiles (id) on delete set null;

create index if not exists idx_solins_escalado_alianzas on public.solicitudes_insumo (escalado_alianzas) where escalado_alianzas;
create index if not exists idx_solins_voluntariado on public.solicitudes_insumo (voluntariado_profesional) where voluntariado_profesional;

-- Aviso al departamento de Alianzas / Afiliación cuando se escala (primera vez).
-- Filtro por rol en TEXTO (regla enum-safe: 'prospeccion'/'afiliacion' se comparan como
-- texto, nunca por cast eager a rol_usuario en esta migración).
create or replace function public.notificar_escalado_alianzas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.escalado_alianzas and coalesce(old.escalado_alianzas, false) = false then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select p.id, 'escalado_alianzas', 'Solicitud enviada a Alianzas Estratégicas',
           coalesce(new.titulo, 'Una solicitud de Logística') || ' busca una empresa o aliado que la cubra.',
           '/insumos/' || new.id
    from public.perfiles p
    where p.rol::text = any (array['captacion', 'prospeccion', 'afiliacion'])
       or coalesce(p.roles_extra::text[], '{}') && array['captacion', 'prospeccion', 'afiliacion'];
  end if;

  if new.voluntariado_profesional and coalesce(old.voluntariado_profesional, false) = false then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select p.id, 'voluntariado_profesional', 'Voluntariado Profesional solicitado',
           coalesce(new.titulo, 'Una solicitud') || ' requiere un profesional voluntario.',
           '/insumos/' || new.id
    from public.perfiles p
    where p.rol::text = any (array['afiliacion', 'captacion', 'prospeccion'])
       or coalesce(p.roles_extra::text[], '{}') && array['afiliacion', 'captacion', 'prospeccion'];
  end if;

  return new;
end $$;

drop trigger if exists trg_notificar_escalado_alianzas on public.solicitudes_insumo;
create trigger trg_notificar_escalado_alianzas
  after update of escalado_alianzas, voluntariado_profesional on public.solicitudes_insumo
  for each row execute function public.notificar_escalado_alianzas();
