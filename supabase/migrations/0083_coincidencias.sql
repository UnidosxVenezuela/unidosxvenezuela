-- ============================================================
-- 0083 — Cruce de personas digitalizadas con desaparecidos (coincidencias)
-- ------------------------------------------------------------
-- Cuando se digitaliza una persona (hallada en un hospital/albergue/acopio), se
-- busca automáticamente si coincide con un caso de DESAPARECIDOS. El cruce lo
-- hace una función SECURITY DEFINER porque ningún rol ve ambos lados:
--   · el digitalizador ve las personas pero NO los casos de desaparecidos;
--   · Búsqueda ve los desaparecidos pero NO las personas digitalizadas;
--   · solo admin ve ambos.
-- Las coincidencias se surfacian a Búsqueda (+admin) — que gestiona la
-- reunificación — vía listar_coincidencias(). Menores (edad < 18) van marcados,
-- porque el CNE no los cubre y estas listas son su principal vía de localización.
-- Idempotente. Ejecutar tras 0082.
-- ============================================================

create table if not exists public.coincidencias (
  id                 uuid primary key default gen_random_uuid(),
  persona_listado_id uuid not null references public.personas_listado (id) on delete cascade,
  caso_id            uuid not null references public.casos (id) on delete cascade,
  motivo             text not null default 'nombre' check (motivo in ('cedula','nombre')),
  estado             text not null default 'nueva' check (estado in ('nueva','confirmada','descartada')),
  revisado_por       uuid references public.perfiles (id),
  revisado_en        timestamptz,
  creado_en          timestamptz not null default now(),
  unique (persona_listado_id, caso_id)
);
create index if not exists idx_coincidencias_estado on public.coincidencias (estado, creado_en desc);

alter table public.coincidencias enable row level security;

-- Ver/gestionar coincidencias: admin o Búsqueda (con 2ª verificación).
drop policy if exists coincidencias_select on public.coincidencias;
create policy coincidencias_select on public.coincidencias for select to authenticated
  using (public.es_admin() or (public.es_busqueda() and public.identidad_aprobada()));
drop policy if exists coincidencias_update on public.coincidencias;
create policy coincidencias_update on public.coincidencias for update to authenticated
  using (public.es_admin() or (public.es_busqueda() and public.identidad_aprobada()))
  with check (public.es_admin() or (public.es_busqueda() and public.identidad_aprobada()));

-- Detecta coincidencias de una persona contra los casos de desaparecidos.
-- Devuelve cuántas coincidencias nuevas encontró.
create or replace function public.detectar_coincidencias_persona(p_persona uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_nombre_raw text; v_ced text; v_tokens text[]; v_tok text;
  v_caso record; v_txt text; v_hits int; v_n int := 0;
begin
  select nombre_completo, nullif(regexp_replace(coalesce(cedula, ''), '\D', '', 'g'), '')
    into v_nombre_raw, v_ced
    from public.personas_listado where id = p_persona;
  if v_nombre_raw is null then return 0; end if;

  -- Tokens del nombre (>= 3 letras, sin acentos).
  select array_agg(t) into v_tokens from (
    select regexp_replace(t, '[^a-z0-9]', '', 'g') as t
    from unnest(regexp_split_to_array(translate(lower(v_nombre_raw), 'áéíóúüñ', 'aeiouun'), '\s+')) t
  ) s where length(regexp_replace(t, '[^a-z0-9]', '', 'g')) >= 3;

  for v_caso in select id, titulo, descripcion, notas from public.casos where categoria = 'Desaparecidos' loop
    v_txt := public.normalizar_nombre(coalesce(v_caso.titulo, '') || ' ' || coalesce(v_caso.descripcion, '') || ' ' || coalesce(v_caso.notas, ''));
    -- 1) Coincidencia fuerte por cédula.
    if v_ced is not null and v_ced <> '' and position(v_ced in v_txt) > 0 then
      insert into public.coincidencias (persona_listado_id, caso_id, motivo)
        values (p_persona, v_caso.id, 'cedula') on conflict do nothing;
      if found then v_n := v_n + 1; end if;
      continue;
    end if;
    -- 2) Coincidencia por nombre: al menos 2 tokens presentes en el texto del caso.
    if coalesce(array_length(v_tokens, 1), 0) >= 2 then
      v_hits := 0;
      foreach v_tok in array v_tokens loop
        if v_tok <> '' and position(v_tok in v_txt) > 0 then v_hits := v_hits + 1; end if;
      end loop;
      if v_hits >= 2 then
        insert into public.coincidencias (persona_listado_id, caso_id, motivo)
          values (p_persona, v_caso.id, 'nombre') on conflict do nothing;
        if found then v_n := v_n + 1; end if;
      end if;
    end if;
  end loop;

  -- Avisar al equipo de Búsqueda si hubo coincidencias nuevas.
  if v_n > 0 then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select pf.id, 'coincidencia', 'Posible coincidencia con un desaparecido',
           'Una persona digitalizada podría corresponder a un caso de desaparecidos. Revísalo en Coincidencias.', '/coincidencias'
    from public.perfiles pf
    where pf.rol::text = 'busqueda'
       or exists (select 1 from unnest(coalesce(pf.roles_extra, '{}'::public.rol_usuario[])) r where r::text = 'busqueda');
  end if;
  return v_n;
end $$;

-- Trigger: al insertar una persona, buscar coincidencias.
create or replace function public.trg_coincidencias_persona()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.detectar_coincidencias_persona(new.id);
  return new;
end $$;
drop trigger if exists trg_personas_coincidencias on public.personas_listado;
create trigger trg_personas_coincidencias after insert on public.personas_listado
  for each row execute function public.trg_coincidencias_persona();

-- Lista las coincidencias con el detalle de ambos lados (SECURITY DEFINER):
-- solo devuelve filas si quien llama es admin o Búsqueda con 2ª verificación.
create or replace function public.listar_coincidencias()
returns table (
  id uuid, estado text, motivo text, creado_en timestamptz,
  persona_nombre text, persona_cedula text, persona_edad int, persona_condicion text, es_menor boolean,
  lugar_nombre text, lugar_tipo text,
  caso_id uuid, caso_numero bigint, caso_titulo text
) language sql stable security definer set search_path = public as $$
  select c.id, c.estado, c.motivo, c.creado_en,
         p.nombre_completo, p.cedula, p.edad, p.condicion,
         (p.edad is not null and p.edad < 18),
         l.nombre, l.tipo,
         ca.id, ca.numero, ca.titulo
  from public.coincidencias c
  join public.personas_listado p on p.id = c.persona_listado_id
  left join public.listados_digitalizados ld on ld.id = p.listado_id
  left join public.lugares l on l.id = ld.lugar_id
  join public.casos ca on ca.id = c.caso_id
  where public.es_admin() or (public.es_busqueda() and public.identidad_aprobada())
  order by (c.estado = 'nueva') desc, c.creado_en desc
  limit 300;
$$;
grant execute on function public.listar_coincidencias() to authenticated;
