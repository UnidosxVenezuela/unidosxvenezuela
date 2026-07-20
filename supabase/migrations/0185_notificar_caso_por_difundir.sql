-- ============================================================
-- 0185 — Bandeja proactiva de Redacción: avisar cuando entra trabajo «por difundir»
-- ------------------------------------------------------------
-- Hoy la bandeja de Envío a Redacción (/envio-redaccion) es REACTIVA: una solicitud
-- confirmada entra a «Por difundir» y se refresca en vivo (señal 0181), pero nadie
-- recibe un aviso — depende de que alguien esté mirando la pantalla.
--
-- Este trigger cierra el hueco: cuando una solicitud DIFUNDIBLE se CONFIRMA
-- (transición de estado → 'confirmado'), avisa a Redacción/Redes por `notificaciones`
-- (0001), cuyo webhook per-row (0060) emite el push web y el Telegram y alimenta la
-- campana. Así el trabajo «llega solo» al equipo, en paralelo a Logística.
--
-- Guardas (idénticas en espíritu a la señal de difusión 0181):
--   · Solo → 'confirmado' y SOLO en la transición (new.estado is distinct from old) → no
--     re-avisa en cada edición posterior.
--   · NUNCA los 'Desaparecidos' (no se difunden en redes; su flujo es Búsqueda).
--   · No si ya estaba publicada (publicado_en) — no reabrir difusión cerrada.
--   · No auto-avisar a quien confirmó (auth.uid()).
-- Destinatarios: rol 'redaccion' (0036) o 'admin_redes' (0103), verificados. Ambos son
-- valores de enum PREEXISTENTES, así que el cast es seguro (no son de esta migración).
-- SECURITY DEFINER (escribe notificaciones del sistema). Idempotente. Tras 0184.
-- ============================================================

create or replace function public.notificar_caso_por_difundir()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado::text = 'confirmado'
     and new.estado is distinct from old.estado
     and new.categoria is distinct from 'Desaparecidos'
     and new.publicado_en is null then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select p.id, 'caso_por_difundir', 'Nueva solicitud por difundir',
           coalesce(new.titulo, 'Una solicitud') || ' se confirmó y está lista para difundir en redes.',
           '/envio-redaccion?caso=' || new.id
    from public.perfiles p
    where p.verificado
      and p.id is distinct from auth.uid()
      and (p.rol in ('redaccion'::public.rol_usuario, 'admin_redes'::public.rol_usuario)
           or coalesce(p.roles_extra, '{}'::public.rol_usuario[]) && array['redaccion', 'admin_redes']::public.rol_usuario[]);
  end if;
  return new;
end $$;

drop trigger if exists trg_notificar_caso_por_difundir on public.casos;
create trigger trg_notificar_caso_por_difundir
  after update of estado on public.casos
  for each row execute function public.notificar_caso_por_difundir();
