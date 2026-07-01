-- ============================================================
-- 0052 — Apoyo Psicosocial (área confidencial de salud mental)
-- ============================================================
-- Área dedicada al acompañamiento en salud mental. La información es MUY
-- sensible: por decisión de diseño, SOLO el profesional asignado y la
-- coordinación psicosocial ven cada caso y su bitácora — NO el admin ni la
-- coordinación general. Quien registra la solicitud ve su propio pedido y el
-- estado (para dar seguimiento), pero NUNCA la bitácora clínica.
--
-- Roles nuevos:
--   apoyo_psicosocial       — profesional/voluntario que acompaña.
--   coordinador_psicosocial — coordina el área (ve todo, asigna, gestiona).
--
-- Flujo de estados: solicitado → asignado → en_acompanamiento → seguimiento →
-- cerrado (+ cancelado). Idempotente.
-- ============================================================

alter type public.rol_usuario add value if not exists 'apoyo_psicosocial';
alter type public.rol_usuario add value if not exists 'coordinador_psicosocial';

do $$ begin create type public.estado_acompanamiento as enum ('solicitado','asignado','en_acompanamiento','seguimiento','cerrado','cancelado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.tipo_apoyo as enum ('duelo','ansiedad','estres_agudo','crisis','familiar','infantil','otro'); exception when duplicate_object then null; end $$;

-- ── Helpers de permiso (plpgsql: no chocan con el enum recién ampliado) ──
-- ¿Pertenece al equipo psicosocial? (accede al módulo).
create or replace function public.es_psicosocial()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return public.tiene_rol('apoyo_psicosocial') or public.tiene_rol('coordinador_psicosocial');
end $$;
grant execute on function public.es_psicosocial() to authenticated;

-- ¿Coordina el área psicosocial? (ve TODOS los casos, asigna, gestiona recursos).
create or replace function public.es_coord_psicosocial()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return public.tiene_rol('coordinador_psicosocial');
end $$;
grant execute on function public.es_coord_psicosocial() to authenticated;

-- Secuencia para el número visible del caso (PS-1, PS-2, …).
create sequence if not exists public.acompanamiento_numero_seq;

-- ── Tabla: acompañamientos (caso confidencial; nunca se publica) ──
create table if not exists public.acompanamientos (
  id             uuid primary key default gen_random_uuid(),
  numero         bigint not null default nextval('public.acompanamiento_numero_seq'),
  persona        text not null,                 -- nombre o alias de quien recibe apoyo
  contacto       text,                          -- teléfono / whatsapp (opcional)
  tipo           public.tipo_apoyo not null default 'otro',
  motivo         text,                          -- motivo del acompañamiento
  riesgo         public.prioridad not null default 'media',  -- nivel de riesgo
  estado         public.estado_acompanamiento not null default 'solicitado',
  asignado_a     uuid references public.perfiles (id) on delete set null,
  notas_cierre   text,
  creado_por     uuid references public.perfiles (id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  cerrado_en     timestamptz
);
create index if not exists idx_acomp_estado    on public.acompanamientos (estado);
create index if not exists idx_acomp_asignado  on public.acompanamientos (asignado_a);

-- ¿Puede ATENDER (ver bitácora / anotar) este caso? profesional asignado o
-- coordinación psicosocial. SECURITY DEFINER para leer el caso sin recursión de RLS.
create or replace function public.puede_atender_acompanamiento(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_coord_psicosocial()
      or exists (select 1 from public.acompanamientos a where a.id = p_id and a.asignado_a = auth.uid());
$$;
grant execute on function public.puede_atender_acompanamiento(uuid) to authenticated;

-- ── Tabla: bitácora confidencial (notas de cada contacto/sesión) ──
create table if not exists public.bitacora_psicosocial (
  id                uuid primary key default gen_random_uuid(),
  acompanamiento_id uuid not null references public.acompanamientos (id) on delete cascade,
  autor_id          uuid references public.perfiles (id) on delete set null,
  contenido         text not null,
  tipo_contacto     text,                        -- llamada, presencial, mensaje, otro
  creado_en         timestamptz not null default now()
);
create index if not exists idx_bitacora_acomp on public.bitacora_psicosocial (acompanamiento_id);

-- ── Tabla: recursos / líneas de crisis (editable por coordinación psicosocial) ──
create table if not exists public.recursos_psicosocial (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  descripcion text,
  telefono    text,
  url         text,
  orden       int not null default 0,
  creado_en   timestamptz not null default now()
);

-- ── RLS ──
alter table public.acompanamientos      enable row level security;
alter table public.bitacora_psicosocial enable row level security;
alter table public.recursos_psicosocial enable row level security;

-- Acompañamientos: lo ve el profesional asignado, quien lo registró (seguimiento
-- del pedido) o la coordinación psicosocial. NO el admin ni la coord. general.
drop policy if exists "acomp_lectura" on public.acompanamientos;
create policy "acomp_lectura" on public.acompanamientos for select to authenticated
  using (asignado_a = auth.uid() or creado_por = auth.uid() or public.es_coord_psicosocial());

-- Registrar una solicitud: cualquier persona verificada (detección en campo).
drop policy if exists "acomp_insert" on public.acompanamientos;
create policy "acomp_insert" on public.acompanamientos for insert to authenticated
  with check (public.es_verificado() and creado_por = auth.uid()
              and estado = 'solicitado' and asignado_a is null);

-- Actualizar: coordinación psicosocial (todo), el profesional asignado (su caso),
-- o un profesional del equipo que toma un caso sin asignar.
drop policy if exists "acomp_update" on public.acompanamientos;
create policy "acomp_update" on public.acompanamientos for update to authenticated
  using (public.es_coord_psicosocial() or asignado_a = auth.uid()
         or (asignado_a is null and public.es_psicosocial()))
  with check (public.es_coord_psicosocial() or asignado_a = auth.uid());

-- Eliminar un caso confidencial: solo coordinación psicosocial.
drop policy if exists "acomp_delete" on public.acompanamientos;
create policy "acomp_delete" on public.acompanamientos for delete to authenticated
  using (public.es_coord_psicosocial());

-- Bitácora: SOLO profesional asignado o coordinación psicosocial (ni el creador).
drop policy if exists "bitacora_lectura" on public.bitacora_psicosocial;
create policy "bitacora_lectura" on public.bitacora_psicosocial for select to authenticated
  using (public.puede_atender_acompanamiento(acompanamiento_id));
drop policy if exists "bitacora_insert" on public.bitacora_psicosocial;
create policy "bitacora_insert" on public.bitacora_psicosocial for insert to authenticated
  with check (autor_id = auth.uid() and public.puede_atender_acompanamiento(acompanamiento_id));
drop policy if exists "bitacora_delete" on public.bitacora_psicosocial;
create policy "bitacora_delete" on public.bitacora_psicosocial for delete to authenticated
  using (autor_id = auth.uid() or public.es_coord_psicosocial());

-- Recursos: los ve todo el equipo psicosocial; los gestiona la coordinación.
drop policy if exists "recursos_lectura" on public.recursos_psicosocial;
create policy "recursos_lectura" on public.recursos_psicosocial for select to authenticated
  using (public.es_psicosocial());
drop policy if exists "recursos_gestion" on public.recursos_psicosocial;
create policy "recursos_gestion" on public.recursos_psicosocial for all to authenticated
  using (public.es_coord_psicosocial()) with check (public.es_coord_psicosocial());

-- ── Notificaciones ──
-- Al registrar un caso: avisa a la coordinación psicosocial. Al asignar: avisa
-- al profesional. Sin exponer datos sensibles en el aviso (solo el número).
create or replace function public.notificar_psicosocial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select p.id, 'psicosocial', 'Nueva solicitud de apoyo',
           'Hay un nuevo caso de apoyo psicosocial (PS-' || new.numero || ') por asignar.',
           '/psicosocial/' || new.id
    from public.perfiles p
    where 'coordinador_psicosocial' = any(array[p.rol] || coalesce(p.roles_extra, '{}'::public.rol_usuario[]));
  elsif tg_op = 'UPDATE' and new.asignado_a is not null
        and new.asignado_a is distinct from old.asignado_a then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    values (new.asignado_a, 'psicosocial', 'Caso de apoyo asignado',
            'Se te asignó el acompañamiento PS-' || new.numero || '.',
            '/psicosocial/' || new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_notificar_psicosocial on public.acompanamientos;
create trigger trg_notificar_psicosocial
  after insert or update on public.acompanamientos
  for each row execute function public.notificar_psicosocial();

-- Lista del equipo psicosocial (para el desplegable de asignación). Solo la
-- coordinación psicosocial obtiene resultados; el resto recibe vacío. Se comparan
-- los roles como texto para no referenciar valores de enum recién agregados.
create or replace function public.profesionales_psicosocial()
returns table (id uuid, nombre text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre_completo
  from public.perfiles p
  where public.es_coord_psicosocial()
    and (
      p.rol::text in ('apoyo_psicosocial', 'coordinador_psicosocial')
      or exists (
        select 1 from unnest(coalesce(p.roles_extra, '{}'::public.rol_usuario[])) as r
        where r::text in ('apoyo_psicosocial', 'coordinador_psicosocial')
      )
    )
  order by p.nombre_completo;
$$;
grant execute on function public.profesionales_psicosocial() to authenticated;

-- ── Semilla mínima de recursos (solo si la tabla está vacía) ──
insert into public.recursos_psicosocial (titulo, descripcion, telefono, orden)
select * from (values
  ('Emergencias (Venezuela)', 'Emergencias médicas, bomberos y policía.', '911', 0),
  ('Primeros Auxilios Psicológicos (PAP)',
   'Escucha sin juzgar, valida las emociones, no minimices, acompaña y deriva a un profesional. Si hay riesgo vital, activa emergencias y no dejes sola a la persona.',
   null, 1)
) as v(titulo, descripcion, telefono, orden)
where not exists (select 1 from public.recursos_psicosocial);

-- ── Realtime (idempotente) ──
do $$ begin alter publication supabase_realtime add table public.acompanamientos;      exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.bitacora_psicosocial; exception when duplicate_object then null; end $$;
