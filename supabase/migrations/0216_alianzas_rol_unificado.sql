-- ============================================================
-- 0216 — Alianzas Estratégicas: UN solo rol y UN solo grupo
-- ------------------------------------------------------------
-- ANTES: el departamento (0198) trabajaba con TRES roles del enum `public.rol_usuario`
--   —'captacion' (0129), 'prospeccion' y 'afiliacion'— y TRES grupos del sistema con
--   las mismas claves. En la práctica las tres funciones son el MISMO trabajo (conseguir
--   empresas, aliados y voluntariado profesional) y la separación solo producía permisos
--   asimétricos y difíciles de mantener. El caso más claro: `bitsol_insert` (0163) exige
--   `puede_captacion()`, que `puede_alianzas()` NO implica, así que Prospección y
--   Afiliación no podían dejar notas en las solicitudes que 0200 les escala — justo lo
--   único que se les pide hacer con ellas.
--
-- AHORA: un único rol operativo y un único grupo. Se REUTILIZA el valor de enum
--   'captacion' (existe desde 0129) y la clave de grupo 'captacion', reetiquetados
--   «Alianzas Estratégicas» en toda la interfaz. Mismo precedente que 0148 (el grupo
--   pasó a llamarse «Logística» conservando clave='gestion_acopio') y 0135.
--   Reutilizar el valor elimina POR COMPLETO el riesgo de enum-safety: esta migración
--   NO añade ningún valor de enum, así que nada de lo que hace depende de un cast
--   «eager» sobre un valor recién creado.
--
--   · Los perfiles con rol 'prospeccion'/'afiliacion' pasan a 'captacion' (rol principal
--     y roles_extra).
--   · Los miembros de los grupos 'prospeccion'/'afiliacion' se mueven al grupo
--     'captacion' y esos dos grupos quedan DESACTIVADOS (activa=false, molde 0138):
--     NO se borran — es reversible y no se pierde ninguna fila ni membresía.
--   · Los valores de enum 'prospeccion'/'afiliacion' no se pueden borrar (regla del
--     repo): quedan inertes, como 'observador' (0057) y 'envio_redaccion' (0059).
--   · `puede_alianzas()`, `es_prospeccion()`, `es_afiliacion()`, `puede_prospeccion()` y
--     `puede_afiliacion()` NO se borran. `puede_alianzas()` sostiene 12 permisos (las 4
--     policies de `oportunidades` y las 3 de storage de 0199, `afiliados_todo`,
--     `oportcapverif_select` y los gates de `marcar_campo_verif_prospeccion` y
--     `resumen_alianzas`); borrarla dejaría al departamento con 0 filas y SIN error
--     visible. Quedan como alias del rol unificado.
--   · Se cierra el agujero de 0163: `bitsol_insert` pasa a
--     `puede_logistica() or puede_alianzas()`.
--   · Se amplía el gate de `crear_ofrecimiento_desde_captacion` (0192) a `puede_alianzas()`.
--
-- SINCRONIZACIÓN (el riesgo operativo más alto): el bloque de perfiles/grupos va dentro
--   de un DO con `set_config('app.sync_en_curso','1',true)` porque
--   `trg_sincronizar_grupo_por_rol` (0059, AFTER UPDATE OF rol, roles_extra ON perfiles) y
--   `trg_sincronizar_rol_grupo` (0055 → vigente 0154, AFTER INSERT OR DELETE ON
--   miembros_grupo) se RETROALIMENTAN. El flag es `is_local = true`, así que vale para la
--   transacción del propio DO. `proteger_campos_perfil` (0191) no estorba: su primera
--   línea es `if auth.uid() is null then return new; end if;` y la migración corre sin
--   sesión. `sincronizar_espacios_perfil` (0044) tampoco: ningún grupo de este
--   departamento tiene `rol_objetivo`.
--
-- BIYECCIÓN `clave_de_rol`: un rol devuelve UNA clave. Por eso los tres grupos se
--   FUSIONAN antes de tocar el mapeo; si se dejaran los tres, el trigger inverso
--   expulsaría a la gente de dos de ellos.
--
-- Idempotente. Ejecutar tras 0215.
-- ============================================================

-- ── 1) Área operativa del departamento (0198 ya la siembra; se asegura por si falta) ──
insert into public.areas (clave, nombre, descripcion) values
  ('alianzas_estrategicas', 'Alianzas Estratégicas',
   'Consecución de recursos y aliados: empresas, organizaciones, fundaciones e iglesias; captación y afiliación de profesionales y voluntarios.')
on conflict (clave) do nothing;

-- ── 2) Perfiles y grupos, con la sincronización bidireccional APAGADA ──
do $$
declare v_capt uuid;
begin
  perform set_config('app.sync_en_curso', '1', true);

  -- 2.1 Rol principal (comparación TEXT: enum-safe, molde 0059 §1).
  update public.perfiles set rol = 'captacion'
   where rol::text in ('prospeccion', 'afiliacion');

  -- 2.2 Roles adicionales. Subselect literal de 0059 §1: mapea, deduplica con
  --     `array_agg(distinct)` y descarta el que ya sea el rol principal. Se acota a los
  --     perfiles realmente afectados para no reescribir `roles_extra` de todo el mundo.
  update public.perfiles set roles_extra = (
    select coalesce(array_agg(distinct r2), '{}'::public.rol_usuario[]) from (
      select (case when x::text in ('prospeccion','afiliacion') then 'captacion'
                   else x::text end)::public.rol_usuario as r2
      from unnest(coalesce(roles_extra, '{}'::public.rol_usuario[])) x
    ) s where r2::text <> rol::text
  )
  where roles_extra is not null
    and roles_extra <> '{}'::public.rol_usuario[]
    and coalesce(roles_extra::text[], '{}') && array['prospeccion', 'afiliacion'];

  select id into v_capt from public.grupos where clave = 'captacion';

  if v_capt is not null then
    -- 2.3 Fusión de grupos (molde 0072): los miembros de Prospección y Afiliación pasan
    --     al grupo unificado. `distinct` porque alguien puede estar en los dos.
    --     VETADOS: `trg_bloquear_baneado` (0028) es un BEFORE INSERT que LANZA 42501 si la
    --     persona figura en `miembros_baneados` para ese grupo. Sin este filtro, un solo
    --     veto histórico sobre el grupo 'captacion' aborta el DO entero y la migración
    --     falla en producción (en una base limpia pasa desapercibido). El repo ya conoce
    --     la trampa: `sincronizar_espacios_perfil` (0044) envuelve su insert en un
    --     `exception when others then null` «tolerante a triggers de veto». Aquí se filtra
    --     en vez de tragarse la excepción, para no perder también el resto de la fusión.
    insert into public.miembros_grupo (grupo_id, perfil_id)
      select distinct v_capt, m.perfil_id
        from public.miembros_grupo m
        join public.grupos g on g.id = m.grupo_id
       where g.clave in ('prospeccion', 'afiliacion')
         and not exists (select 1 from public.miembros_baneados b
                          where b.grupo_id = v_capt and b.perfil_id = m.perfil_id)
    on conflict do nothing;

    -- 2.4 Backfill (molde 0133 §3): quien tenga el rol unificado y no esté en el grupo.
    --     Cubre a los que tenían el rol sin membresía (o la perdieron por 0154).
    --     Mismo filtro de vetados que en 2.3, por el mismo motivo.
    insert into public.miembros_grupo (grupo_id, perfil_id)
      select v_capt, p.id from public.perfiles p
       where (p.rol::text = 'captacion'
              or exists (select 1 from unnest(coalesce(p.roles_extra, '{}'::public.rol_usuario[])) r
                         where r::text = 'captacion'))
         and not exists (select 1 from public.miembros_grupo m
                          where m.grupo_id = v_capt and m.perfil_id = p.id)
         and not exists (select 1 from public.miembros_baneados b
                          where b.grupo_id = v_capt and b.perfil_id = p.id);

    -- 2.5 Reetiquetado del grupo unificado (molde 0148: la CLAVE de sistema NO cambia,
    --     porque el código, la RLS y el mapeo rol↔grupo siguen usándola).
    update public.grupos
       set nombre = 'Alianzas Estratégicas',
           area = 'alianzas_estrategicas',
           descripcion = 'Departamento de Alianzas Estratégicas: empresas, organizaciones, fundaciones e iglesias; captación de recursos y afiliación de profesionales y voluntarios.'
     where clave = 'captacion';
  end if;

  -- 2.6 Los dos grupos absorbidos se DESACTIVAN (molde 0138). Reversible: `activa = true`
  --     los vuelve a mostrar y no se ha perdido nada.
  update public.grupos set activa = false where clave in ('prospeccion', 'afiliacion');

  perform set_config('app.sync_en_curso', '', true);
end $$;

-- ── 3) Funciones-catálogo, reescritas COMPLETAS desde 0198 ──
-- Regla del repo: `rol_de_grupo`, `clave_de_rol` y `roles_area_derivacion` siguen siendo
-- `language plpgsql` (cuerpo late-bound). Convertir cualquiera a `language sql` rompería
-- la enum-safety de las migraciones futuras — es exactamente el motivo por el que 0198
-- convirtió `roles_area_derivacion` de `sql` a `plpgsql`.

create or replace function public.rol_de_grupo(p_clave text)
returns public.rol_usuario language plpgsql immutable as $$
begin
  return (case p_clave
    when 'gestion_casos'               then 'recopilacion'
    when 'verificacion'                then 'verificador'
    when 'busqueda'                    then 'busqueda'
    when 'busqueda_nna'                then 'buscador_nna'
    when 'enlace_contacto'             then 'enlace_contacto'
    when 'digitalizacion'              then 'digitalizador'
    when 'verificacion_digitalizacion' then 'verificador_digitalizacion'
    -- Grupo unificado «Alianzas Estratégicas» (clave histórica 'captacion').
    when 'captacion'                   then 'captacion'
    -- 'prospeccion' y 'afiliacion' ya NO mapean a ningún rol: sus grupos quedaron
    -- absorbidos y desactivados en §2. Devolver null evita que una membresía residual
    -- vuelva a otorgar un rol retirado.
    when 'redaccion'                   then 'redaccion'
    when 'redes_sociales'              then 'redes_sociales'
    when 'diseno_grafico'              then 'diseno_grafico'
    when 'edicion_video'               then 'edicion_video'
    when 'influencers'                 then 'influencers'
    when 'apoyo_psicosocial'           then 'apoyo_psicosocial'
    when 'gestion_acopio'              then 'logistica'
    else null end)::public.rol_usuario;
end $$;

create or replace function public.clave_de_rol(p_rol public.rol_usuario)
returns text language plpgsql immutable as $$
begin
  return case p_rol::text
    when 'recopilacion'               then 'gestion_casos'
    when 'verificador'                then 'verificacion'
    when 'busqueda'                   then 'busqueda'
    when 'buscador_nna'               then 'busqueda_nna'
    when 'enlace_contacto'            then 'enlace_contacto'
    when 'digitalizador'              then 'digitalizacion'
    when 'verificador_digitalizacion' then 'verificacion_digitalizacion'
    when 'captacion'                  then 'captacion'
    -- 'prospeccion'/'afiliacion' → null: son valores inertes del enum y ya no tienen
    -- grupo propio. Sin esto, el trigger inverso expulsaría del grupo unificado.
    when 'redaccion'                  then 'redaccion'
    when 'redes_sociales'             then 'redes_sociales'
    when 'diseno_grafico'             then 'diseno_grafico'
    when 'edicion_video'              then 'edicion_video'
    when 'influencers'                then 'influencers'
    when 'apoyo_psicosocial'          then 'apoyo_psicosocial'
    when 'logistica'                  then 'gestion_acopio'
    else null end;
end $$;

-- Destino de derivación 'alianzas' (0177/0198): ahora es el rol unificado.
-- Espejo exacto en la app: ROLES_POR_AREA_DESTINO de apps/web/lib/constantes.ts.
create or replace function public.puede_operar_area_derivacion(p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_area
    when 'logistica'    then public.es_admin() or public.tiene_rol('logistica') or public.tiene_rol('admin_logistica')
    when 'redes'        then public.es_admin() or public.tiene_rol('redaccion') or public.tiene_rol('redes_sociales')
                             or public.tiene_rol('diseno_grafico') or public.tiene_rol('edicion_video')
                             or public.tiene_rol('influencers') or public.tiene_rol('admin_redes')
    when 'donaciones'   then public.es_admin() or public.tiene_rol('logistica') or public.tiene_rol('admin_logistica')
                             or public.tiene_rol('captacion')
    when 'alianzas'     then public.es_admin() or public.es_captacion()
    when 'coordinacion' then public.es_admin()
    else public.es_admin()  -- 'otra' → Coordinación
  end;
$$;
grant execute on function public.puede_operar_area_derivacion(text) to authenticated;

-- roles_area_derivacion: se reescribe COMPLETA y sigue en plpgsql. En 'alianzas' se
-- CONSERVAN los tres literales una release más: esta función solo se usa para ENRUTAR
-- avisos, así que un valor de más no autoriza nada y cubre cualquier residuo.
create or replace function public.roles_area_derivacion(p_area text)
returns public.rol_usuario[] language plpgsql immutable as $$
begin
  return case p_area
    when 'logistica'    then array['logistica','admin_logistica']::public.rol_usuario[]
    when 'redes'        then array['redaccion','redes_sociales','diseno_grafico','edicion_video','influencers','admin_redes']::public.rol_usuario[]
    when 'donaciones'   then array['logistica','admin_logistica','captacion']::public.rol_usuario[]
    when 'alianzas'     then array['captacion','prospeccion','afiliacion']::public.rol_usuario[]
    when 'coordinacion' then array['admin']::public.rol_usuario[]
    else array['admin']::public.rol_usuario[]  -- 'otra'
  end;
end $$;

-- ── 4) Helpers del departamento: alias inertes del rol unificado ──
-- `es_prospeccion()` y `es_afiliacion()` se conservan TAL CUAL 0198 (no se tocan): tras
-- la unificación nadie tiene esos roles, así que devuelven false y `puede_alianzas()`
-- queda, de hecho, en `es_admin() or es_captacion()`. Se mantienen porque
-- `puede_alianzas()` las invoca y porque el enum no se poda.
-- `puede_prospeccion()`/`puede_afiliacion()` SÍ se redirigen al departamento, para que
-- cualquier llamada superviviente siga autorizando al rol unificado (es el mismo cambio
-- que en apps/web/lib/auth.ts::puedeAfiliacion, sin el cual /afiliacion quedaría
-- inaccesible para TODO el mundo). No hay recursión: `puede_alianzas()` llama a
-- `es_prospeccion()`/`es_afiliacion()`, nunca a estas dos.
create or replace function public.puede_prospeccion()
returns boolean language sql stable security definer set search_path = public as $$
  select public.puede_alianzas();
$$;
grant execute on function public.puede_prospeccion() to authenticated;

create or replace function public.puede_afiliacion()
returns boolean language sql stable security definer set search_path = public as $$
  select public.puede_alianzas();
$$;
grant execute on function public.puede_afiliacion() to authenticated;

-- ── 5) Bitácora de solicitudes de Logística: el agujero de 0163 ──
-- `bitsol_insert` era el ÚNICO permiso que `puede_captacion()` daba y `puede_alianzas()`
-- no. Con el rol unificado el efecto ya sería el mismo, pero se deja escrito con el
-- helper del departamento para que no vuelva a divergir. Las policies SELECT y DELETE de
-- 0163 se re-emiten sin cambios (la tabla no tiene ni debe tener policy de UPDATE: las
-- notas son inmutables).
drop policy if exists bitsol_select on public.bitacora_solicitud;
create policy bitsol_select on public.bitacora_solicitud for select to authenticated
  using (public.es_verificado());

drop policy if exists bitsol_insert on public.bitacora_solicitud;
create policy bitsol_insert on public.bitacora_solicitud for insert to authenticated
  with check (autor_id = auth.uid()
    and (public.puede_logistica() or public.puede_alianzas()));

drop policy if exists bitsol_delete on public.bitacora_solicitud;
create policy bitsol_delete on public.bitacora_solicitud for delete to authenticated
  using (autor_id = auth.uid() or public.es_admin() or public.puede_logistica());

-- ── 6) Insignia «referencias» (0165): el filtro por rol se amplía a los tres literales ──
-- Tras la unificación basta 'captacion', pero se dejan los tres por si queda algún
-- residuo. Comparación en TEXTO (molde 0200), no por cast del literal al enum.
-- Se replica la envoltura defensiva de 0165 (la tabla podría no existir en bases viejas).
do $$
begin
  if to_regclass('public.bitacora_solicitud') is not null then
    create or replace function public.insig_nota_sol() returns trigger
    language plpgsql security definer set search_path = public as $tt$
    begin
      perform public.sumar_contador_y_otorgar(new.autor_id, 'notas');
      if exists (
        select 1 from public.perfiles p
         where p.id = new.autor_id
           and (p.rol::text = any (array['captacion','prospeccion','afiliacion'])
                or coalesce(p.roles_extra::text[], '{}') && array['captacion','prospeccion','afiliacion'])
      ) then
        perform public.sumar_contador_y_otorgar(new.autor_id, 'referencias');
      end if;
      return new;
    end $tt$;
    execute 'drop trigger if exists trg_insig_nota_sol on public.bitacora_solicitud';
    execute 'create trigger trg_insig_nota_sol after insert on public.bitacora_solicitud for each row execute function public.insig_nota_sol()';
  end if;
end $$;

-- ── 7) Puente Captación → Donación-Ofrecimiento (0192): gate al departamento ──
-- Se reescribe COMPLETA desde 0192 cambiando solo el gate: `puede_captacion()` →
-- `puede_alianzas()`. La firma (uuid) NO cambia: la llama
-- apps/web/app/(app)/captacion/actions.ts::crearOfrecimientoDesdeCaptacion.
create or replace function public.crear_ofrecimiento_desde_captacion(p_oportunidad uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_o record; v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado.' using errcode = '42501'; end if;
  if not (public.es_admin() or public.puede_alianzas() or public.puede_logistica()) then
    raise exception 'Solo Alianzas Estratégicas, Logística o administración pueden crear el ofrecimiento.' using errcode = '42501';
  end if;

  select * into v_o from public.oportunidades where id = p_oportunidad;
  if v_o.id is null then
    raise exception 'No existe esa entidad de Alianzas Estratégicas.' using errcode = '42501';
  end if;

  -- Idempotente: si ya hay un ofrecimiento para esta entidad, devolverlo (no duplicar).
  select id into v_id from public.oportunidades_donacion
    where captacion_oportunidad_id = p_oportunidad limit 1;
  if v_id is not null then return v_id; end if;

  -- Las entidades del registro «Captado» son organizaciones/fundaciones/empresas → origen
  -- 'organizacion', clase 'donacion', tipo por defecto 'especie' (editable luego).
  insert into public.oportunidades_donacion
    (organizacion, contacto, descripcion, ubicacion, enlace,
     tipo_oferta, clase, origen, captacion_oportunidad_id, creado_por)
  values
    (v_o.titulo, v_o.contacto, v_o.descripcion, v_o.ubicacion, v_o.enlace,
     'especie', 'donacion', 'organizacion', p_oportunidad, auth.uid())
  returning id into v_id;

  -- Traza de procedencia en la bitácora del ofrecimiento.
  insert into public.bitacora_oportunidad (oportunidad_id, autor_id, contenido, canal, resultado)
  values (v_id, auth.uid(),
          'Ofrecimiento creado desde el registro de Alianzas Estratégicas: «' || coalesce(v_o.titulo, '') ||
          '» (' || coalesce(v_o.categoria, '—') || ').', 'otro', 'positivo');

  return v_id;
end $$;

revoke all on function public.crear_ofrecimiento_desde_captacion(uuid) from public;
grant execute on function public.crear_ofrecimiento_desde_captacion(uuid) to authenticated;
