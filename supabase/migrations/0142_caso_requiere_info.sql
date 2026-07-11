-- ============================================================
-- 0142 — Verificación: «Requiere información adicional» → devolver a Recopilación
-- ------------------------------------------------------------
-- El procedimiento del equipo de Verificación define un resultado intermedio que
-- la plataforma no tenía: cuando a un caso le falta un dato (contacto, ubicación,
-- fuente, vigencia…) o hay contradicciones, la verificadora NO lo descarta: lo
-- marca «Requiere información adicional» con el motivo y lo DEVUELVE al área que lo
-- reportó (Recopilación) para que lo complete.
--
-- Se modela SIN tocar el enum estado_caso (enum-safety): el caso vuelve a
-- `en_proceso` y se guarda el motivo en la nueva columna `info_requerida`. Cuando
-- está puesta, la app muestra el distintivo 🟡 «Requiere información adicional». Al
-- confirmarse, descartarse o corregirse el caso, la columna se limpia.
--
-- Un trigger avisa a quien reportó el caso (creado_por) con el motivo, reutilizando
-- la tabla `notificaciones` (su webhook per-row 0060 emite el push). `tipo` es texto
-- libre. Idempotente. (Se numera 0142; 0141 queda reservada a otra rama.)
-- ============================================================

-- Motivo de la devolución (qué información falta). NULL = no requiere info.
alter table public.casos add column if not exists info_requerida text;

-- Aviso a quien reportó el caso cuando se marca «Requiere información adicional».
create or replace function public.notificar_info_requerida()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.info_requerida is not null
     and new.info_requerida is distinct from old.info_requerida
     and new.creado_por is not null then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    values (new.creado_por, 'caso_requiere_info', 'Tu solicitud necesita más información',
            'Verificación pidió completar: ' || left(new.info_requerida, 160),
            '/casos?caso=' || new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_notificar_info_requerida on public.casos;
create trigger trg_notificar_info_requerida
  after update of info_requerida on public.casos
  for each row execute function public.notificar_info_requerida();
