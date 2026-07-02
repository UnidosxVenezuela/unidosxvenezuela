-- ============================================================
-- 0064 — Contenido producido por los grupos + autoría + marca
-- ------------------------------------------------------------
-- · El pipeline de contenido deja de depender de los casos: los grupos de
--   contenido (Redacción, Diseño Gráfico, Edición de Videos, Redes Sociales) e
--   Influencers pueden CREAR y subir piezas. Los influencers actúan en cualquier
--   etapa.
-- · Cada pieza guarda su AUTORÍA: `colaboradores` acumula a todos los que la
--   crearon o modificaron (pie de "hecho por / editado por").
-- · Lineamientos de marca (logo, colores, tipografía) para alinear a todos.
-- Idempotente. 'influencers' ya existe en el enum (0062).
-- ============================================================

-- ── 1) Columnas nuevas de la pieza ──
alter table public.piezas_contenido add column if not exists colaboradores  uuid[] not null default '{}';
alter table public.piezas_contenido add column if not exists publicado_en   timestamptz;
alter table public.piezas_contenido add column if not exists adjunto_url    text;
alter table public.piezas_contenido add column if not exists adjunto_nombre text;

-- ── 2) Autoría: suma al autor/editor actual a `colaboradores` ──
create or replace function public.piezas_sumar_colaborador()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not (auth.uid() = any(coalesce(new.colaboradores, '{}'::uuid[]))) then
    new.colaboradores := coalesce(new.colaboradores, '{}'::uuid[]) || auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists trg_piezas_colaborador on public.piezas_contenido;
create trigger trg_piezas_colaborador before insert or update on public.piezas_contenido
  for each row execute function public.piezas_sumar_colaborador();

-- Historial (línea de tiempo) reutilizando la auditoría global.
drop trigger if exists aud_piezas_contenido on public.piezas_contenido;
create trigger aud_piezas_contenido after insert or update or delete on public.piezas_contenido
  for each row execute function public.auditar_cambio();

-- ── 3) Acceso al pipeline: roles de contenido (por conjunto de roles) + influencers ──
create or replace function public.puede_pipeline()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_verificado() and (public.mis_roles() && array[
    'admin','coordinador','redaccion','diseno_grafico','edicion_video','redes_sociales','influencers'
  ]::public.rol_usuario[]);
$$;

-- El influencer puede actuar en CUALQUIER etapa; el resto, en la suya.
create or replace function public.puede_editar_etapa(p_etapa public.etapa_contenido)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_coordinacion()
     or public.tiene_rol('influencers')
     or case p_etapa
          when 'redaccion' then public.tiene_rol('redaccion')
          when 'diseno'    then public.tiene_rol('diseno_grafico')
          when 'video'     then public.tiene_rol('edicion_video')
          when 'redes'     then public.tiene_rol('redes_sociales')
          else false
        end;
$$;

-- Crear pieza: cualquiera del pipeline (antes solo coordinación).
drop policy if exists "piezas_insert" on public.piezas_contenido;
create policy "piezas_insert" on public.piezas_contenido for insert to authenticated
  with check (public.puede_pipeline() and creado_por = auth.uid());

-- ── 4) Lineamientos de marca (una sola fila; la edita el admin, la ve el pipeline) ──
create table if not exists public.lineamientos_marca (
  id              int primary key default 1,
  logo_url        text,
  paleta          text,       -- colores (p.ej. "#0033A0, #FFCC00, #CE1126")
  tipografia      text,
  notas           text,
  actualizado_por uuid references public.perfiles (id),
  actualizado_en  timestamptz not null default now(),
  constraint lineamientos_una_fila check (id = 1)
);
insert into public.lineamientos_marca (id) values (1) on conflict (id) do nothing;

alter table public.lineamientos_marca enable row level security;
drop policy if exists lm_select on public.lineamientos_marca;
create policy lm_select on public.lineamientos_marca for select to authenticated
  using (public.puede_pipeline() or public.es_admin());
drop policy if exists lm_update on public.lineamientos_marca;
create policy lm_update on public.lineamientos_marca for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
