-- ============================================================
-- 0149 — Logística fiel al flujograma del equipo (MO-CRGI-LOG-01)
-- ------------------------------------------------------------
-- Alinea la plataforma al flujo real de «Logística y Distribución»:
--
--  (A) 1A · Al CONFIRMARSE una solicitud de ayuda con ubicación (no «Desaparecidos»),
--      entra SOLA al panel de Logística (crea la solicitud de insumo enlazada): Logística
--      es la primera parada. El botón manual «Derivar a Logística» (0113) queda como
--      respaldo para casos confirmados sin coordenadas que luego se ubiquen.
--
--  (B) 2A · Nueva salida de Logística «No se pudo cubrir» (estado_insumo 'no_disponible').
--      Al marcarla, el caso queda para DIFUSIÓN (casos.requiere_difusion = true) y recién
--      AHÍ pasa a Redacción. Redacción deja de recibir todo lo confirmado: solo recibe lo
--      que Logística no pudo cubrir (su Fase 2: «¿disponible? NO → Redacción y Redes»).
--
--  (C) 3a · Categorías de material del flujograma: se agregan 'materiales' (materiales/
--      herramientas/EPP) y 'maquinaria' (maquinaria pesada / rescate) a tipo_insumo.
--
--  (D) 3c · Contacto + coordenadas del solicitante para Logística: caso_de_solicitud()
--      ahora devuelve también contacto/lat/lng (misma audiencia curada; sin abrir casos).
--
--  (E) 3b · Evidencia de entrega: solicitudes_insumo += entrega_nota / entrega_evidencia_path,
--      con bucket privado 'entregas' (RLS puede_logistica).
--
-- Enum-safety (lección 0107/0078/0114): los valores nuevos de enum se AÑADEN y NO se usan
-- de forma eager en policies/CHECK de esta misma migración; solo por comparación TEXT en
-- cuerpos plpgsql (late-bound). Idempotente. Ejecutar tras 0148.
-- ============================================================

-- ═══ (C/3a) Categorías de material del flujograma ═══
alter type public.tipo_insumo   add value if not exists 'materiales';
alter type public.tipo_insumo   add value if not exists 'maquinaria';

-- ═══ (B/2A) Estado «No se pudo cubrir» + marca de difusión en el caso ═══
alter type public.estado_insumo add value if not exists 'no_disponible';
alter table public.casos add column if not exists requiere_difusion boolean not null default false;

-- ═══ (E/3b) Evidencia de entrega ═══
alter table public.solicitudes_insumo
  add column if not exists entrega_nota           text,
  add column if not exists entrega_evidencia_path text;

-- Bucket privado para las evidencias de entrega (foto/nota). Solo Logística.
insert into storage.buckets (id, name, public) values ('entregas', 'entregas', false)
  on conflict (id) do nothing;
drop policy if exists entregas_obj_select on storage.objects;
create policy entregas_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'entregas' and public.puede_logistica());
drop policy if exists entregas_obj_insert on storage.objects;
create policy entregas_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'entregas' and public.puede_logistica());
drop policy if exists entregas_obj_delete on storage.objects;
create policy entregas_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'entregas' and public.puede_logistica());

-- ═══ (A/1A) Auto-derivar a Logística al confirmar ═══
-- SECURITY DEFINER: Logística no inserta solicitudes por RLS de otros; aquí lo hace el
-- sistema al confirmarse. Idempotente (1 solicitud por caso, índice uq_solins_caso de 0113).
create or replace function public.autoderivar_caso_confirmado()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_sol uuid;
begin
  -- Solo al ENTRAR a 'confirmado'; requerimiento ubicado; NO «Desaparecidos».
  if new.estado::text is distinct from 'confirmado' then return new; end if;
  if old.estado::text is not distinct from 'confirmado' then return new; end if;
  if not coalesce(new.es_requerimiento, false) then return new; end if;
  if new.categoria is not distinct from 'Desaparecidos' then return new; end if;
  if new.lat is null or new.lng is null then return new; end if;

  -- Idempotente: si ya tiene solicitud de insumo, no duplicar.
  if exists (select 1 from public.solicitudes_insumo where caso_id = new.id) then
    return new;
  end if;

  insert into public.solicitudes_insumo
    (titulo, tipo, descripcion, cantidad, urgencia, estado, solicitado_por, caso_id)
  values (
    new.titulo,
    coalesce(new.req_tipo, 'otro'::public.tipo_insumo),
    new.descripcion,
    new.req_cantidad,
    coalesce(new.req_urgencia, 'media'::public.prioridad),
    'solicitado'::public.estado_insumo,
    new.creado_por,
    new.id
  ) returning id into v_sol;

  insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
  values (auth.uid(), 'casos:derivado_auto', 'casos', new.id::text,
          jsonb_build_object('solicitud_id', v_sol));

  -- Aviso a Logística: hay una nueva tarea en su panel.
  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select p.id, 'insumo_nuevo', 'Nueva solicitud en Logística',
         'Una solicitud verificada entró para coordinar su entrega.',
         '/insumos/' || v_sol
  from public.perfiles p
  where p.rol in ('logistica'::public.rol_usuario, 'admin_logistica'::public.rol_usuario)
     or 'logistica'::public.rol_usuario       = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[]))
     or 'admin_logistica'::public.rol_usuario = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[]));

  return new;
end $$;

drop trigger if exists trg_autoderivar_caso_confirmado on public.casos;
create trigger trg_autoderivar_caso_confirmado
  after update of estado on public.casos
  for each row execute function public.autoderivar_caso_confirmado();

-- ═══ (B/2A) «No se pudo cubrir» → el caso queda para difusión (Redacción) ═══
-- SECURITY DEFINER: Logística no edita casos por RLS; el trigger marca la difusión.
create or replace function public.marcar_difusion_al_no_cubrir()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.caso_id is null then return new; end if;

  -- Entra a «no disponible» → el caso pasa a difusión (Redacción) y se avisa.
  if new.estado::text = 'no_disponible' and old.estado::text is distinct from 'no_disponible' then
    update public.casos set requiere_difusion = true, actualizado_en = now()
      where id = new.caso_id and estado::text in ('confirmado', 'enviado_redaccion');
    get diagnostics n = row_count;
    if n > 0 then
      insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
      values (auth.uid(), 'casos:requiere_difusion', 'casos', new.caso_id::text,
              jsonb_build_object('solicitud_id', new.id));
      insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
      select p.id, 'difusion_requerida', 'Caso para difundir',
             'Logística no pudo cubrir una solicitud; pasa a Redacción para difundir.',
             '/envio-redaccion'
      from public.perfiles p
      where p.rol in ('redaccion'::public.rol_usuario, 'admin_redes'::public.rol_usuario)
         or 'redaccion'::public.rol_usuario  = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[]))
         or 'admin_redes'::public.rol_usuario = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[]));
    end if;

  -- Sale de «no disponible» hacia un estado activo → se retira de la cola de Redacción
  -- (Logística sí encontró cómo cubrirla), salvo que ya se haya enviado a Redacción.
  elsif old.estado::text = 'no_disponible' and new.estado::text is distinct from 'no_disponible' then
    update public.casos set requiere_difusion = false, actualizado_en = now()
      where id = new.caso_id and estado::text = 'confirmado';
  end if;

  return new;
end $$;

drop trigger if exists trg_marcar_difusion_al_no_cubrir on public.solicitudes_insumo;
create trigger trg_marcar_difusion_al_no_cubrir
  after update of estado on public.solicitudes_insumo
  for each row execute function public.marcar_difusion_al_no_cubrir();

-- ═══ (D/3c) Contacto + coordenadas del solicitante para Logística ═══
-- Amplía caso_de_solicitud (0113) para exponer contacto/lat/lng a la audiencia curada
-- (admin/logística/verificación), SIN abrir la RLS de casos. Cambia el tipo de retorno,
-- por eso hay que DROP + recreate.
drop function if exists public.caso_de_solicitud(uuid);
create function public.caso_de_solicitud(p_caso uuid)
returns table (numero bigint, titulo text, contacto text, lat double precision, lng double precision)
language sql stable security definer set search_path = public as $$
  select c.numero, c.titulo, c.contacto, c.lat, c.lng
  from public.casos c
  where c.id = p_caso
    and (public.es_admin() or public.puede_logistica() or public.puede_verificar());
$$;
grant execute on function public.caso_de_solicitud(uuid) to authenticated;
