-- ============================================================
-- 0026 — Cupo de personas por tarea (participación múltiple)
-- ============================================================
-- Una tarea puede aceptar varias personas hasta un 'cupo' opcional.
-- cupo NULL = sin límite explícito → se trata como 1 (comportamiento actual).
-- Los participantes viven en tarea_personas (fuente de verdad del conteo);
-- asignado_a se mantiene como "responsable principal" (compat. móvil/UI).
-- ============================================================

alter table public.tareas
  add column if not exists cupo int check (cupo is null or cupo >= 1);

create table if not exists public.tarea_personas (
  tarea_id  uuid not null references public.tareas (id) on delete cascade,
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  unido_en  timestamptz not null default now(),
  primary key (tarea_id, perfil_id)
);
create index if not exists idx_tarea_personas_perfil on public.tarea_personas (perfil_id);

-- Backfill: los asignados actuales pasan a ser participantes.
insert into public.tarea_personas (tarea_id, perfil_id)
  select id, asignado_a from public.tareas where asignado_a is not null
  on conflict do nothing;

alter table public.tarea_personas enable row level security;

drop policy if exists "tp_lectura" on public.tarea_personas;
create policy "tp_lectura" on public.tarea_personas for select to authenticated
  using (public.puede_ver_tarea(tarea_id));

-- Alta directa: solo quien gestiona la tarea (coordinación / creador / líder del grupo).
-- Los voluntarios se suman con tomar_tarea (que respeta el cupo).
drop policy if exists "tp_insert" on public.tarea_personas;
create policy "tp_insert" on public.tarea_personas for insert to authenticated
  with check (
    public.es_coordinacion()
    or exists (select 1 from public.tareas t where t.id = tarea_id
         and (t.creado_por = auth.uid()
              or exists (select 1 from public.grupos g where g.id = t.grupo_id and g.lider_id = auth.uid())))
  );

-- Baja: uno mismo, o quien gestiona la tarea.
drop policy if exists "tp_delete" on public.tarea_personas;
create policy "tp_delete" on public.tarea_personas for delete to authenticated
  using (
    perfil_id = auth.uid()
    or public.es_coordinacion()
    or exists (select 1 from public.tareas t where t.id = tarea_id
         and (t.creado_por = auth.uid()
              or exists (select 1 from public.grupos g where g.id = t.grupo_id and g.lider_id = auth.uid())))
  );

-- Conteo de ocupados (SECURITY DEFINER → no expone quiénes; sirve en RLS y listas).
create or replace function public.ocupados_tarea(p_tarea uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.tarea_personas where tarea_id = p_tarea;
$$;

create or replace function public.conteo_personas_tarea()
returns table (tarea_id uuid, total bigint)
language sql stable security definer set search_path = public as $$
  select tarea_id, count(*)::bigint from public.tarea_personas group by tarea_id;
$$;

grant execute on function public.ocupados_tarea(uuid) to authenticated;
grant execute on function public.conteo_personas_tarea() to authenticated;

-- puede_ver / puede_editar: incluir a los participantes.
create or replace function public.puede_ver_tarea(p_tarea uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tareas t
    where t.id = p_tarea and (
      public.es_coordinacion()
      or t.asignado_a = auth.uid()
      or t.creado_por = auth.uid()
      or (t.grupo_id is not null and public.es_miembro_de(t.grupo_id))
      or exists (select 1 from public.tarea_personas tp where tp.tarea_id = t.id and tp.perfil_id = auth.uid())
    )
  );
$$;

create or replace function public.puede_editar_tarea(p_tarea uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tareas t
    where t.id = p_tarea and (
      public.es_coordinacion()
      or t.asignado_a = auth.uid()
      or t.creado_por = auth.uid()
      or exists (select 1 from public.grupos g where g.id = t.grupo_id and g.lider_id = auth.uid())
      or exists (select 1 from public.tarea_personas tp where tp.tarea_id = t.id and tp.perfil_id = auth.uid())
    )
  );
$$;

-- Una tarea "abierta" (visible a verificados) = no cerrada y con cupo disponible.
drop policy if exists "tareas_lectura_abiertas" on public.tareas;
create policy "tareas_lectura_abiertas" on public.tareas for select to authenticated
  using (
    public.es_verificado()
    and estado in ('pendiente'::estado_tarea, 'asignada'::estado_tarea)
    and public.ocupados_tarea(id) < coalesce(cupo, 1)
  );

-- tomar_tarea: respeta el cupo (NULL = 1).
create or replace function public.tomar_tarea(p_tarea uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_cupo int; v_estado estado_tarea; v_ocupados int; v_ya boolean;
begin
  if not public.es_verificado() then
    raise exception 'Tu cuenta aún no fue verificada por la coordinación.' using errcode = '42501';
  end if;
  if public.mi_rol() = 'observador' then
    raise exception 'Los observadores no pueden tomar tareas.' using errcode = '42501';
  end if;

  select cupo, estado into v_cupo, v_estado from public.tareas where id = p_tarea for update;
  if not found then raise exception 'La tarea no existe.'; end if;
  if v_estado in ('completada', 'cancelada') then
    raise exception 'La tarea ya está cerrada.';
  end if;

  select exists (select 1 from public.tarea_personas where tarea_id = p_tarea and perfil_id = auth.uid()) into v_ya;
  if not v_ya then
    select count(*) into v_ocupados from public.tarea_personas where tarea_id = p_tarea;
    if v_ocupados >= coalesce(v_cupo, 1) then
      raise exception 'La tarea ya alcanzó su cupo de personas.';
    end if;
    insert into public.tarea_personas (tarea_id, perfil_id) values (p_tarea, auth.uid());
  end if;

  update public.tareas
     set asignado_a = coalesce(asignado_a, auth.uid()),
         estado = case when estado = 'pendiente' then 'asignada'::estado_tarea else estado end
   where id = p_tarea;
end; $$;

-- liberar_tarea: salir; recomputa responsable y estado.
create or replace function public.liberar_tarea(p_tarea uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  delete from public.tarea_personas where tarea_id = p_tarea and perfil_id = auth.uid();
  select count(*) into v_n from public.tarea_personas where tarea_id = p_tarea;
  update public.tareas
     set asignado_a = (select perfil_id from public.tarea_personas where tarea_id = p_tarea order by unido_en limit 1),
         estado = case when v_n = 0 and estado = 'asignada' then 'pendiente'::estado_tarea else estado end
   where id = p_tarea;
end; $$;
