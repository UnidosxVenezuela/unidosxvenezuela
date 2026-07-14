-- ============================================================
-- 0156 — Logística ve la solicitud completa y recibe TODAS las confirmadas
-- ------------------------------------------------------------
-- Dos ajustes que pide el equipo de Logística para gestionar bien:
--
--  (A) VER TODA LA INFORMACIÓN. Hoy Logística abre /insumos/[id] y solo ve los
--      campos curados que expone caso_de_solicitud() (número, título, contacto,
--      lat/lng). Para coordinar la entrega necesita la solicitud COMPLETA:
--      descripción, notas, fuente, requerimiento y sobre todo los ADJUNTOS/imágenes.
--      · casos_select suma una rama de Logística (lee lo confirmado/enviado/resuelto
--        que no sea «Desaparecidos») — misma frontera de privacidad que Redacción.
--      · storage: una policy SOLO de lectura para los adjuntos de casos. Se agrega
--        aparte (no se toca el `for all` de 0106) para que Logística LEA los archivos
--        pero NO pueda subirlos ni borrarlos (permissive → se suma en SELECT).
--
--  (B) RECIBIR TODAS LAS CONFIRMADAS (opción 1). El flujo de 0149 solo derivaba a
--      Logística las confirmadas que eran «requerimiento» Y tenían coordenadas. El
--      equipo quiere que TODA solicitud verificada (no «Desaparecidos») llegue a su
--      panel, con o sin ubicación. Se amplía el trigger autoderivar_caso_confirmado
--      quitando esas dos guardas, y se hace un BACKFILL idempotente de las confirmadas
--      (y enviadas a Redacción) que quedaron sin solicitud de insumo enlazada.
--
-- Idempotente. La rebase de casos_select reproduce su versión vigente (0143) verbatim
-- y solo SUMA la rama de Logística (misma lección de 0105/0106/0143). El backfill se
-- protege con `not exists` + el índice único uq_solins_caso (0113); reaplicar = no-op.
-- Sin notificaciones en el backfill (histórico, no hay que avisar caso por caso).
-- Ejecutar tras 0155.
-- ============================================================

-- ═══ (A) casos_select: Logística lee la solicitud completa ═══
-- Base 0143 (verbatim) + rama de Logística. Lectura, no edición (casos_update no cambia:
-- Logística gestiona la entrega en solicitudes_insumo, no toca el caso).
drop policy if exists "casos_select" on public.casos;
create policy "casos_select" on public.casos for select to authenticated
  using (public.es_verificado() and (
    public.es_admin()
    or public.opera_verificacion()
    or (public.opera_redes() and estado::text in ('confirmado','enviado_redaccion')
        and categoria is distinct from 'Desaparecidos')
    or (public.tiene_rol('verificador') and categoria is distinct from 'Desaparecidos')
    or (public.es_mando_recopilacion() and categoria is distinct from 'Desaparecidos')
    or (public.es_mando_busqueda() and categoria = 'Desaparecidos')
    or (public.es_busqueda() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and not public.caso_busqueda_es_nna(id))
    or (public.es_buscador_nna() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and public.caso_busqueda_es_nna(id))
    or (public.es_enlace() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and public.caso_busqueda_etapa_enlace(id))
    or (public.tiene_rol('redaccion') and estado::text in ('confirmado','enviado_redaccion')
        and categoria is distinct from 'Desaparecidos')
    or (public.puede_logistica() and estado::text in ('confirmado','enviado_redaccion','resuelto')
        and categoria is distinct from 'Desaparecidos')
    or (creado_por = auth.uid() and public.identidad_aprobada())
  ));

-- ═══ (A) Adjuntos de casos: Logística LEE (no sube ni borra) ═══
-- Policy aparte, solo SELECT. El `for all` de 0106 (que sí escribe) NO se toca; como las
-- policies permissive se SUMAN en SELECT, Logística lee los adjuntos sin ganar escritura.
drop policy if exists adjuntos_casos_logistica_sel on storage.objects;
create policy adjuntos_casos_logistica_sel on storage.objects for select to authenticated
  using (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = 'casos'
         and public.puede_logistica());

-- ═══ (B) Auto-derivar a Logística TODA confirmada no «Desaparecidos» ═══
-- Base 0149 sin las guardas de «es_requerimiento» y de «lat/lng». Ahora cualquier caso
-- que ENTRA a 'confirmado' (con o sin ubicación, sea o no requerimiento) crea su solicitud
-- de insumo y avisa a Logística. Sigue siendo idempotente (uq_solins_caso) y enum-safe.
create or replace function public.autoderivar_caso_confirmado()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_sol uuid;
begin
  -- Solo al ENTRAR a 'confirmado'; NO «Desaparecidos». (Ya no se exige requerimiento ni ubicación.)
  if new.estado::text is distinct from 'confirmado' then return new; end if;
  if old.estado::text is not distinct from 'confirmado' then return new; end if;
  if new.categoria is not distinct from 'Desaparecidos' then return new; end if;

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

-- (El trigger trg_autoderivar_caso_confirmado de 0149 ya apunta a esta función; no cambia.)

-- ═══ (B) BACKFILL idempotente: sincronizar la data desfasada de Logística ═══
-- Toda solicitud verificada (confirmada o ya enviada a Redacción) que no sea «Desaparecidos»
-- y que NO tenga aún su solicitud de insumo enlazada, entra ahora al panel de Logística.
-- Silencioso: no genera notificaciones (es histórico). `not exists` + uq_solins_caso lo hacen
-- re-ejecutable sin duplicar.
insert into public.solicitudes_insumo
  (titulo, tipo, descripcion, cantidad, urgencia, estado, solicitado_por, caso_id)
select
  c.titulo,
  coalesce(c.req_tipo, 'otro'::public.tipo_insumo),
  c.descripcion,
  c.req_cantidad,
  coalesce(c.req_urgencia, 'media'::public.prioridad),
  'solicitado'::public.estado_insumo,
  c.creado_por,
  c.id
from public.casos c
where c.estado::text in ('confirmado', 'enviado_redaccion')
  and c.categoria is distinct from 'Desaparecidos'
  and not exists (select 1 from public.solicitudes_insumo si where si.caso_id = c.id);
