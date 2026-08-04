-- ============================================================
-- 0226 — Alianzas y Logística se ven mutuamente, en SOLO LECTURA
-- ------------------------------------------------------------
-- ANTES el acceso cruzado entre las dos áreas era asimétrico:
--  · Alianzas → Logística ya funcionaba (la RLS de `solicitudes_insumo` es
--    `es_verificado()` desde 0050, y 0216 arregló el gate de la app), y entra en
--    modo consulta a /insumos.
--  · Logística → Alianzas NO: `oportunidades_select_logistica` (0162) solo deja
--    ver las marcadas `'enviado'`, `afiliados` es exclusiva del departamento
--    (0198), y `resumen_alianzas()` (0200) rechaza a Logística con 42501.
--
-- AHORA Logística ve el panel de Alianzas completo pero SIN PODER ESCRIBIR NADA, y
-- sin los datos personales de la Ficha de Prospección.
--
-- POR QUÉ UNA VISTA Y NO UNA POLICY MÁS ANCHA. Ampliar la policy de
-- `oportunidades` habría entregado a Logística la Ficha de Prospección entera de
-- 0199, que incluye `responsable_telefono`, `contactos_operativos` y
-- `contactos_alternos`: teléfonos y contactos personales de gente de empresas que
-- confió esos datos a Alianzas. La vista `alianzas_panel` (molde `casos_difusion`,
-- `security_invoker = false`) proyecta solo lo que Logística necesita para decidir
-- —quién es, de qué rubro, qué capacidad declara, si tiene transporte, qué
-- confiabilidad se le puso— y deja fuera las tres columnas sensibles.
-- `contacto` (el canal general de la organización, 0129) se proyecta ÚNICAMENTE en
-- las ya marcadas `'enviado'`, que es exactamente lo que 0162 ya permitía ver: la
-- vista amplía el alcance de la consulta, no el de los datos de contacto.
--
-- CUIDADO CON 0162. `oportunidades_select_logistica` y
-- `oportunidades_storage_logistica` sobrevivieron al rebase de 0199 y son fáciles
-- de perder al tocar policies de `oportunidades`; se RE-EMITEN aquí tal cual para
-- que un replay en cualquier orden las deje vivas. Sin ellas Logística pierde
-- /insumos/captacion, su exportación y su impresión.
-- Idempotente. Ejecutar tras 0225.
-- ============================================================

-- ── 1) El panel de Alianzas, curado, para Logística ──
drop view if exists public.alianzas_panel;
create view public.alianzas_panel
  with (security_invoker = false) as
  select
    o.id,
    o.categoria,
    o.estado,
    o.titulo,
    o.enlace,
    o.ubicacion,
    o.descripcion,
    o.rubro,
    o.capacidades,
    o.volumen,
    o.transporte,
    o.logistica_entrega,
    o.restricciones,
    o.score_confiabilidad,
    o.origen,
    o.responsable_cargo,          -- el CARGO sí (es contexto), el TELÉFONO no
    o.verificado_en,
    o.creado_en,
    o.actualizado_en,
    -- El canal general solo en las ya enviadas a Logística (paridad con 0162).
    case when o.estado = 'enviado' then o.contacto else null end as contacto,
    -- Si ya se convirtió en proveedor con capacidades declaradas (0224), el enlace.
    (select pr.id from public.proveedores pr where pr.oportunidad_id = o.id limit 1) as proveedor_id
  from public.oportunidades o
  where public.puede_alianzas() or public.puede_logistica();

grant select on public.alianzas_panel to authenticated;

comment on view public.alianzas_panel is
  'Panel de Alianzas curado para consulta cruzada. Excluye responsable_telefono, '
  'contactos_operativos y contactos_alternos (Ficha de Prospección, 0199). Solo lectura.';

-- ── 2) Logística lee los afiliados, en policy APARTE ──
-- No se toca `afiliados_todo` (el `for all` de 0198): doctrina de 0156/0213 —una
-- policy nueva y acotada, nunca reescribir la del área dueña, que es la que le da
-- la escritura—. Las policies de SELECT se suman (OR), así que Alianzas conserva
-- exactamente lo que tenía y Logística gana solo lectura.
drop policy if exists afiliados_select_logistica on public.afiliados;
create policy afiliados_select_logistica on public.afiliados for select to authenticated
  using (public.puede_logistica());

-- ── 3) La reportería de Alianzas se abre a Logística ──
-- `create or replace` CONSERVANDO la firma sin argumentos: cambiarla obligaría a
-- `drop function` + reemitir `revoke`/`grant` + tocar `lib/export/alianzas.ts`.
-- Se reescribe el cuerpo COMPLETO desde 0200; 0228 lo amplía después.
create or replace function public.resumen_alianzas()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not (public.puede_alianzas() or public.puede_logistica()) then
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
    'por_estado', coalesce((
      select jsonb_object_agg(estado, n) from (
        select estado, count(*)::bigint as n from public.oportunidades group by estado
      ) s), '{}'::jsonb),
    'por_rubro', coalesce((
      select jsonb_object_agg(rubro, n) from (
        select coalesce(nullif(trim(rubro), ''), 'Sin especificar') as rubro, count(*)::bigint as n
        from public.oportunidades group by coalesce(nullif(trim(rubro), ''), 'Sin especificar')
      ) r), '{}'::jsonb),
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

-- ── 4) RE-EMISIÓN de las policies de 0162 ──
-- Van al final a propósito: si una migración futura reescribe las policies de
-- `oportunidades`, este bloque es el que las devuelve. No dependen de nada de esta
-- migración y son idénticas a 0162.
drop policy if exists oportunidades_select_logistica on public.oportunidades;
create policy oportunidades_select_logistica on public.oportunidades for select to authenticated
  using (public.puede_logistica() and estado = 'enviado');

drop policy if exists oportunidades_storage_logistica on storage.objects;
create policy oportunidades_storage_logistica on storage.objects for select to authenticated
  using (bucket_id = 'oportunidades' and public.puede_logistica());
