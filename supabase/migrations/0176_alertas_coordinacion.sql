-- ============================================================
-- 0176 — Aviso a Coordinación por dudas + alertas por tiempo (Pasos 7 y 11)
-- ------------------------------------------------------------
-- (Paso 7) Cuando Verificación marca un dato como 🟡 «requiere información», el sistema
--   avisa AUTOMÁTICAMENTE a Coordinación (los administradores). Se agrega ese aviso a la
--   RPC `marcar_campo_verificacion` (0172), con un anti-spam de 6 h por caso.
--
-- (Paso 11) Alertas automáticas por TIEMPO en Verificación: una solicitud (no
--   «Desaparecidos») en `pendiente`/`en_proceso` que lleva más de 48 h sin actualizarse
--   genera un aviso — al responsable que la tomó, o a Verificación si nadie la tomó.
--   Corre por pg_cron (best-effort, como 0091); anti-spam de 24 h por caso.
--
-- Ambas SOLO insertan en `notificaciones`; el Database Webhook (0060) manda el push. Los
-- avisos usan `titulo`/`cuerpo` propios, así que no dependen de un catálogo de tipos.
-- Idempotente. Ejecutar tras 0175.
-- ============================================================

-- ── (Paso 7) marcar_campo_verificacion + aviso a Coordinación en 🟡 ──
-- Reproduce 0172 verbatim y SUMA el bloque de aviso a administradores cuando el estado
-- es 'requiere_info'. El resto de la lógica (frontera por categoría, upsert, auditoría)
-- no cambia.
create or replace function public.marcar_campo_verificacion(
  p_caso uuid, p_campo text, p_estado text, p_nota text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_cat text;
  v_existe boolean;
begin
  if p_estado not in ('sin_revisar', 'verificado', 'requiere_info', 'falso') then
    raise exception 'Estado de campo no válido: %', p_estado using errcode = '22023';
  end if;
  if coalesce(trim(p_campo), '') = '' then
    raise exception 'Falta el campo a verificar' using errcode = '22023';
  end if;

  select true, categoria into v_existe, v_cat from public.casos where id = p_caso;
  if not coalesce(v_existe, false) then
    raise exception 'Solicitud no encontrada' using errcode = 'P0002';
  end if;

  -- Frontera por categoría: Desaparecidos → Búsqueda/admin; el resto → Verificación/admin.
  if v_cat = 'Desaparecidos' then
    if not (public.es_admin() or public.puede_atender_busqueda(p_caso)) then
      raise exception 'No tienes permiso para verificar esta solicitud' using errcode = '42501';
    end if;
  else
    if not (public.es_admin() or public.puede_verificar()) then
      raise exception 'No tienes permiso para verificar esta solicitud' using errcode = '42501';
    end if;
  end if;

  insert into public.casos_verificacion_campo (caso_id, campo, estado, nota, verificado_por, verificado_en)
  values (p_caso, trim(p_campo), p_estado, nullif(trim(coalesce(p_nota, '')), ''), auth.uid(), now())
  on conflict (caso_id, campo) do update
    set estado = excluded.estado,
        nota = excluded.nota,
        verificado_por = excluded.verificado_por,
        verificado_en = excluded.verificado_en;

  perform public.registrar_auditoria('verificacion_campo', 'casos', p_caso::text,
    jsonb_build_object('campo', trim(p_campo), 'estado', p_estado));

  -- (Paso 7) 🟡 requiere info → avisa a Coordinación (admins). Anti-spam de 6 h por caso.
  if p_estado = 'requiere_info' then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select p.id, 'caso_duda', 'Duda en la verificación de una solicitud',
           'Verificación marcó «' || trim(p_campo) || '» como que requiere información. Revísalo en Coordinación.',
           '/casos?caso=' || p_caso
    from public.perfiles p
    where (p.rol = 'admin'::public.rol_usuario
           or 'admin'::public.rol_usuario = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[])))
      and not exists (
        select 1 from public.notificaciones n
        where n.destinatario_id = p.id and n.tipo = 'caso_duda'
          and n.enlace = '/casos?caso=' || p_caso
          and n.creado_en > now() - interval '6 hours'
      );
  end if;
end $$;

revoke all on function public.marcar_campo_verificacion(uuid, text, text, text) from public;
grant execute on function public.marcar_campo_verificacion(uuid, text, text, text) to authenticated;

-- ── (Paso 11) Alertas por tiempo: solicitudes estancadas (+48 h) en Verificación ──
create or replace function public.alertar_casos_estancados()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int := 0; r record;
begin
  for r in
    select c.id, c.titulo, c.asignado_a
    from public.casos c
    where c.estado::text in ('pendiente', 'en_proceso')
      and c.categoria is distinct from 'Desaparecidos'
      and c.actualizado_en < now() - interval '48 hours'
      and not exists (
        select 1 from public.notificaciones n
        where n.tipo = 'caso_estancado'
          and n.enlace = '/casos?caso=' || c.id
          and n.creado_en > now() - interval '24 hours'
      )
  loop
    if r.asignado_a is not null then
      -- Al responsable que la tomó.
      insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
      values (r.asignado_a, 'caso_estancado', 'Solicitud sin avance (+48 h)',
              'La solicitud «' || coalesce(r.titulo, '') || '» que trabajas lleva más de 48 h sin actualización. Confirma su vigencia y registra el avance.',
              '/casos?caso=' || r.id);
      v_n := v_n + 1;
    else
      -- Nadie la tomó: a todo el equipo de Verificación.
      insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
      select p.id, 'caso_estancado', 'Solicitud sin tomar (+48 h)',
             'Una solicitud lleva más de 48 h pendiente sin que nadie la tome en Verificación. Ábrela y tómala.',
             '/casos?caso=' || r.id
      from public.perfiles p
      where p.rol = 'verificador'::public.rol_usuario
         or 'verificador'::public.rol_usuario = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[]));
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
grant execute on function public.alertar_casos_estancados() to authenticated;
comment on function public.alertar_casos_estancados() is
  'Paso 11: avisa por solicitudes en pendiente/en_proceso sin actualización >48 h. Anti-spam de 24 h por caso. El webhook de notificaciones manda el push.';

-- ── Agendado con pg_cron (best-effort, como 0091) ──
do $$
begin
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'casos-estancados') then
    perform cron.unschedule('casos-estancados');
  end if;
  perform cron.schedule('casos-estancados', '17 */6 * * *', 'select public.alertar_casos_estancados();');
exception when others then
  raise notice 'pg_cron no disponible o no se pudo agendar (%). Agenda manualmente: select cron.schedule(''casos-estancados'', ''17 */6 * * *'', ''select public.alertar_casos_estancados();'');', sqlerrm;
end $$;
