-- ============================================================
-- 0114 — Cerrar el ciclo: entrega → caso resuelto + centro cercano (Propuesta Fase 3)
-- ------------------------------------------------------------
-- Fase 3 de «De la información a la acción»: el ciclo se cierra y queda trazado.
--  (1) Al ENTREGAR la solicitud de insumo derivada de un caso (0113), el caso de
--      ayuda se marca RESUELTO (estado nuevo, distinto de «falso»). Así el punto
--      desaparece de la capa «Solicitudes de ayuda» del mapa (ya se atendió).
--  (2) Se sugiere el CENTRO DE ACOPIO más cercano CON EXISTENCIAS del insumo pedido
--      (haversine en SQL; no hay PostGIS), leyendo la ubicación del caso de origen.
--
-- Enum-safety: 'resuelto' se AÑADE a estado_caso y solo se usa en cuerpos plpgsql
-- (late-bound) o por comparación TEXT — nunca con cast eager en una policy/CHECK de
-- esta misma migración (lección 0107/0078).
-- Idempotente. Ejecutar tras 0113.
-- ============================================================

-- ── Estado nuevo: caso «Resuelto» ──
alter type public.estado_caso add value if not exists 'resuelto';

-- ── (1) Entrega → caso resuelto (trigger SECURITY DEFINER: Logística no edita casos) ──
create or replace function public.cerrar_caso_al_entregar()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.caso_id is not null and new.estado = 'entregado'
     and old.estado is distinct from 'entregado' then
    update public.casos set estado = 'resuelto', actualizado_en = now()
      where id = new.caso_id and estado::text in ('confirmado', 'enviado_redaccion');
    get diagnostics n = row_count;
    if n > 0 then
      insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
      values (auth.uid(), 'casos:resuelto', 'casos', new.caso_id::text,
              jsonb_build_object('solicitud_id', new.id));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_cerrar_caso_al_entregar on public.solicitudes_insumo;
create trigger trg_cerrar_caso_al_entregar
  after update of estado on public.solicitudes_insumo
  for each row execute function public.cerrar_caso_al_entregar();

-- ── (2) Centro de acopio más cercano con existencias del insumo pedido ──
-- Lee la ubicación del caso de origen (Logística no lee casos por RLS → DEFINER).
-- Distancia por haversine (km). «con_stock» = el centro tiene inventario de esa
-- categoría con cantidad > 0. Ordena stock primero, luego cercanía.
create or replace function public.centros_cercanos_para_solicitud(p_solicitud uuid, p_limite int default 5)
returns table (
  punto_id uuid, nombre text, direccion text, telefono text,
  distancia_km double precision, con_stock boolean
)
language sql stable security definer set search_path = public as $$
  with s as (
    select si.tipo, c.lat, c.lng
    from public.solicitudes_insumo si
    join public.casos c on c.id = si.caso_id
    where si.id = p_solicitud
      and c.lat is not null and c.lng is not null
      and (public.es_admin() or public.puede_logistica())
  )
  select p.id, p.nombre, p.direccion, p.telefono,
    6371 * acos(least(1, greatest(-1,
      sin(radians(s.lat)) * sin(radians(p.lat)) +
      cos(radians(s.lat)) * cos(radians(p.lat)) * cos(radians(p.lng - s.lng))
    ))) as distancia_km,
    exists (
      select 1 from public.inventario_acopio ia
      where ia.punto_id = p.id and ia.categoria = s.tipo::text and ia.cantidad > 0
    ) as con_stock
  from public.puntos_acopio p, s
  where p.activo
  order by con_stock desc, distancia_km asc
  limit greatest(1, least(coalesce(p_limite, 5), 20));
$$;
grant execute on function public.centros_cercanos_para_solicitud(uuid, int) to authenticated;
