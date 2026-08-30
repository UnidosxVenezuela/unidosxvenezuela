-- ============================================================
-- 0242 — La Ficha de Alianzas la verifica el eje, no Alianzas
-- ------------------------------------------------------------
-- ENCARGO: «ahora las alianzas estratégicas las verifican ellos» (Verificación y Gestión
--   de Casos). Análisis completo en docs/PLAN-EJE-VERIFICACION-Y-GESTION.md.
--
-- LO PRIMERO, PORQUE CAMBIA EL ALCANCE: los OFRECIMIENTOS de donación YA los verifica
--   Verificación, y desde hace tiempo — `verificar_oportunidad_donacion` (0144:143) y el
--   semáforo campo por campo (0194:69) tienen gate `puede_verificar() or
--   opera_verificacion()`. Ahí no había nada que arreglar.
--
--   Lo que SÍ se autocertifica es la FICHA DE PROSPECCIÓN del CRM (`public.oportunidades`,
--   0199): `marcar_campo_verif_prospeccion` (0199:103) tiene gate `puede_alianzas()`, o sea
--   que la misma gente que crea y edita la ficha es la que le pone los verdes. Y ese
--   semáforo es el que abre el candado de «Enviar a Logística» (0199:131-137). Ahí es donde
--   el encargo tiene efecto real, y es lo único que toca esta migración.
--
--   Los `afiliados` (0198:155) no tienen ni un campo de verificación ni ningún candado que
--   abrir; la capacidad del proveedor (0224) es un contador vivo, no un hecho verificable.
--   Ninguno de los dos entra: construirles un mecanismo desde cero no bloquearía nada.
--
-- DECISIÓN DE LA ORGANIZACIÓN: SUSTITUCIÓN, no dos firmas. Alianzas deja de marcar el
--   semáforo de su propia ficha; pasa entero al área eje.
--
-- EL OBSTÁCULO NO ERA EL GATE, ERA LA LECTURA. Cambiar 0199:103 es una línea, pero
--   Verificación no podía leer hoy ni la ficha ni su semáforo (las cuatro policies de
--   `oportunidades` y la de `oportunidad_captacion_verif_campo` son `puede_alianzas()`).
--   Sin lectura, verificaría a ciegas. Se resuelve con VISTA CURADA (molde 0226), nunca
--   ampliando `oportunidades_select`: `puede_alianzas()` sostiene 12 permisos y 0216:28-33
--   avisa de que romperla deja al departamento con cero filas y sin error visible.
--
-- LOS CONTACTOS SÍ ENTRAN EN LA VISTA, y es una decisión explícita de la organización.
--   `alianzas_panel` (0226:37) excluye a propósito `responsable_telefono`,
--   `contactos_operativos` y `contactos_alternos` — pero el campo 'responsable' del semáforo
--   es literalmente «Responsable de la alianza y su contacto» (constantes.ts:1212). Sin el
--   teléfono no se verifica: se firma en blanco. La vista de Verificación los incluye, y
--   SOLO la de Verificación; `alianzas_panel` se queda como está, con su criterio intacto.
--
-- VALIDADO RANCIO: la ficha no tenía el equivalente de 0183 (que devuelve un campo a «sin
--   revisar» cuando se edita el dato que verificaba). Sin eso, Alianzas podía cambiar el
--   teléfono después del verde y el verde no se caía. Con la firma en manos de otra área,
--   eso pasa de ser un descuido a ser un agujero: se añade el trigger.
--
-- Idempotente. Ejecutar tras 0241.
-- ============================================================

-- ═══ (1) La vista curada para el área eje ═══
-- Molde 0226 (`security_invoker = false` y gate en el WHERE), con dos diferencias
-- deliberadas: incluye los contactos (ver cabecera) y se acota SOLO al área eje — Logística
-- sigue con `alianzas_panel`, que no los trae.
drop view if exists public.ficha_alianza_verificacion;
create view public.ficha_alianza_verificacion
  with (security_invoker = false) as
  select
    o.id, o.categoria, o.estado, o.titulo, o.enlace, o.ubicacion, o.descripcion,
    o.origen, o.rubro, o.capacidades, o.volumen, o.transporte, o.logistica_entrega,
    o.restricciones, o.score_confiabilidad,
    -- Los tres que `alianzas_panel` excluye. Sin ellos no se puede verificar el campo
    -- «responsable», que es exactamente «el responsable y su contacto».
    o.responsable_nombre, o.responsable_cargo, o.responsable_telefono,
    o.contactos_operativos, o.contactos_alternos,
    o.contacto,
    o.verificado_en, o.creado_en, o.actualizado_en,
    public.prospeccion_esta_verificada(o.id) as ficha_verificada
  from public.oportunidades o
  where public.puede_gestion_casos();

grant select on public.ficha_alianza_verificacion to authenticated;

comment on view public.ficha_alianza_verificacion is
  'La Ficha de Prospección (0199) para quien la verifica desde 0242: Verificación y Gestión de Casos. A diferencia de alianzas_panel (0226) SÍ incluye responsable_telefono, contactos_operativos y contactos_alternos, porque sin ellos el campo «responsable» se firmaría en blanco. Decisión explícita de la organización, no un descuido del criterio de 0226 — que se conserva intacto para Logística.';

-- ═══ (2) El semáforo, legible para quien lo firma ═══
-- Las policies de SELECT se suman (OR), así que se AÑADE una en vez de reescribir la de
-- Alianzas: el departamento conserva exactamente lo que tenía.
drop policy if exists oportcapverif_select_gestion on public.oportunidad_captacion_verif_campo;
create policy oportcapverif_select_gestion on public.oportunidad_captacion_verif_campo
  for select to authenticated using (public.puede_gestion_casos());

-- ═══ (3) El gate del semáforo cambia de área ═══
-- SUSTITUCIÓN: `puede_alianzas()` → `puede_gestion_casos()`. Es el único cambio de la
-- función; el resto es 0199:100-121 verbatim.
create or replace function public.marcar_campo_verif_prospeccion(
  p_oportunidad uuid, p_campo text, p_estado text, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado.' using errcode = '42501'; end if;
  -- 0242: la ficha ya no la firma quien la escribe.
  if not public.puede_gestion_casos() then
    raise exception 'La ficha la verifica Verificación y Gestión de Casos.' using errcode = '42501';
  end if;
  if coalesce(trim(p_campo), '') = '' then raise exception 'Campo vacío.' using errcode = '22023'; end if;
  if p_estado not in ('sin_revisar', 'verificado', 'requiere_info', 'falso') then
    raise exception 'Estado de verificación no válido.' using errcode = '22023';
  end if;

  insert into public.oportunidad_captacion_verif_campo (oportunidad_id, campo, estado, nota, verificado_por, verificado_en)
  values (p_oportunidad, p_campo, p_estado, nullif(trim(coalesce(p_nota, '')), ''), auth.uid(), now())
  on conflict (oportunidad_id, campo) do update
    set estado = excluded.estado, nota = excluded.nota,
        verificado_por = excluded.verificado_por, verificado_en = excluded.verificado_en;

  perform public.registrar_auditoria('verificacion_campo_prospeccion', 'oportunidades',
    p_oportunidad::text, jsonb_build_object('campo', p_campo, 'estado', p_estado));
end $$;

revoke all on function public.marcar_campo_verif_prospeccion(uuid, text, text, text) from public;
grant execute on function public.marcar_campo_verif_prospeccion(uuid, text, text, text) to authenticated;

-- ═══ (4) Validado rancio: editar el dato tumba su verde ═══
-- Molde 0183, que existía solo para `casos`. Cada campo del semáforo se mapea a las
-- columnas que verifica; si alguna cambia, el campo vuelve a «sin revisar» y hay que
-- volver a firmarlo. Sin esto, la firma del área eje se puede vaciar por detrás.
create or replace function public.reset_verif_ficha_al_editar()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tocados text[] := '{}';
begin
  if new.titulo             is distinct from old.titulo
     or new.rubro           is distinct from old.rubro
     or new.ubicacion       is distinct from old.ubicacion then
    v_tocados := v_tocados || 'identidad';
  end if;
  if new.responsable_nombre   is distinct from old.responsable_nombre
     or new.responsable_cargo    is distinct from old.responsable_cargo
     or new.responsable_telefono is distinct from old.responsable_telefono
     or new.contactos_operativos is distinct from old.contactos_operativos
     or new.contactos_alternos   is distinct from old.contactos_alternos then
    v_tocados := v_tocados || 'responsable';
  end if;
  if new.capacidades is distinct from old.capacidades
     or new.volumen   is distinct from old.volumen
     or new.transporte is distinct from old.transporte then
    v_tocados := v_tocados || 'capacidad';
  end if;
  if new.logistica_entrega is distinct from old.logistica_entrega
     or new.restricciones   is distinct from old.restricciones then
    v_tocados := v_tocados || 'condiciones';
  end if;
  if new.score_confiabilidad is distinct from old.score_confiabilidad then
    v_tocados := v_tocados || 'confiabilidad';
  end if;

  if array_length(v_tocados, 1) is null then
    return new;
  end if;

  update public.oportunidad_captacion_verif_campo v
     set estado = 'sin_revisar', nota = null, verificado_por = null, verificado_en = null
   where v.oportunidad_id = new.id
     and v.campo = any(v_tocados)
     and v.estado <> 'sin_revisar';

  return new;
end $$;

drop trigger if exists trg_reset_verif_ficha on public.oportunidades;
create trigger trg_reset_verif_ficha
  after update on public.oportunidades
  for each row execute function public.reset_verif_ficha_al_editar();

comment on function public.reset_verif_ficha_al_editar() is
  'Validado rancio de la Ficha de Prospección (0242, molde 0183). Editar el dato tumba el verde del campo que lo verificaba. Existe porque desde 0242 la firma es de otra área: sin esto, Alianzas podría cambiar el teléfono después de la firma y el verde no se caería.';

-- ═══ (5) Los avisos del traspaso ═══
-- El ofrecimiento ya los tiene (0144:162 avisa a Verificación al darse de alta; 0193:118
-- avisa a Logística al quedar verificado). La ficha no tenía ninguno: con la firma en otra
-- área, sin avisos nadie se entera de que hay algo que verificar ni de que ya se puede
-- enviar.
create or replace function public.notificar_ficha_por_verificar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Solo cuando la ficha empieza a usarse de verdad (mismo criterio que el candado de
  -- 0199:132): sin rubro ni capacidades no hay nada que verificar todavía.
  if new.rubro is null and new.capacidades is null and coalesce(new.origen, '') <> 'prospeccion' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.rubro is not distinct from new.rubro
     and old.capacidades is not distinct from new.capacidades then
    return new;   -- no cambió lo que dispara la verificación
  end if;

  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select p.id, 'ficha_por_verificar', 'Una ficha de Alianzas espera verificación',
         left(coalesce(new.titulo, 'Ficha de aliado'), 140), '/captacion/' || new.id
    from public.perfiles p
   where p.verificado
     and p.id is distinct from auth.uid()
     and (p.rol::text in ('verificador','gestor_casos')
          or exists (select 1 from unnest(coalesce(p.roles_extra, '{}'::public.rol_usuario[])) r
                      where r::text in ('verificador','gestor_casos')));
  return new;
end $$;

drop trigger if exists trg_notificar_ficha_por_verificar on public.oportunidades;
create trigger trg_notificar_ficha_por_verificar
  after insert or update of rubro, capacidades on public.oportunidades
  for each row execute function public.notificar_ficha_por_verificar();
