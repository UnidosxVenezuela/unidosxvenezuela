-- ============================================================
-- 0193 — Semáforo de vida del ofrecimiento: avisos de handoff + compromiso vencido
-- ------------------------------------------------------------
-- Faltaban avisos: al abrirse el candado (Verificación marca «Verificada») no se
-- avisaba a Logística ni a Recopilación; y un «comprometido» que no llega no
-- alertaba. Esta migración añade:
--   · `comprometida_en`: sello de cuándo el ofrecimiento entró a «comprometida»
--     (base del semáforo de compromisos vencidos, que pinta la app).
--   · Trigger de aviso al abrirse el candado (estado_verificacion → 'verificada'):
--     avisa a Logística (ya puede avanzarlo) y al creador (Recopilación).
-- El envejecimiento (pill «hace N días») y el «compromiso vencido» los calcula la
-- app a partir de creado_en/actualizado_en/comprometida_en (sin datos nuevos).
-- Idempotente. Ejecutar tras 0192.
-- ============================================================

alter table public.oportunidades_donacion
  add column if not exists comprometida_en timestamptz;

comment on column public.oportunidades_donacion.comprometida_en is
  'Cuándo el ofrecimiento entró a «comprometida» (para el semáforo de compromisos vencidos).';

-- ── 1) Sellar comprometida_en al entrar a «comprometida» ──
create or replace function public.sellar_comprometida_ofrecimiento()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.estado = 'comprometida' and old.estado is distinct from 'comprometida' then
    new.comprometida_en := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_sellar_comprometida on public.oportunidades_donacion;
create trigger trg_sellar_comprometida
  before update of estado on public.oportunidades_donacion
  for each row execute function public.sellar_comprometida_ofrecimiento();

-- ── 2) Aviso al abrirse el candado (estado_verificacion → 'verificada') ──
-- Logística puede avanzarlo; el creador (Recopilación) se entera de que pasó. Mismo
-- idioma de destinatarios por rol que notificar_oportunidad_donacion (0144).
create or replace function public.notificar_candado_ofrecimiento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado_verificacion = 'verificada'
     and coalesce(old.estado_verificacion, '') is distinct from 'verificada' then
    -- Logística / admin de Logística (quien avanza el ofrecimiento).
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select p.id, 'ofrecimiento_verificado', 'Ofrecimiento verificado · listo para avanzar',
           'El ofrecimiento de «' || coalesce(new.organizacion, '') || '» ya está verificado; Logística puede avanzarlo.',
           '/insumos/oportunidades/' || new.id
    from public.perfiles p
    where p.verificado and p.id is distinct from auth.uid()
      and (p.rol in ('logistica'::public.rol_usuario, 'admin_logistica'::public.rol_usuario)
           or 'logistica'::public.rol_usuario       = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[]))
           or 'admin_logistica'::public.rol_usuario = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[])));
    -- El creador (Recopilación), si no fue quien verificó.
    if new.creado_por is not null and new.creado_por is distinct from auth.uid() then
      insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
      values (new.creado_por, 'ofrecimiento_verificado', 'Tu ofrecimiento fue verificado',
              'El ofrecimiento de «' || coalesce(new.organizacion, '') || '» pasó la verificación.',
              '/insumos/oportunidades/' || new.id);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_notificar_candado_ofrecimiento on public.oportunidades_donacion;
create trigger trg_notificar_candado_ofrecimiento
  after update of estado_verificacion on public.oportunidades_donacion
  for each row execute function public.notificar_candado_ofrecimiento();
