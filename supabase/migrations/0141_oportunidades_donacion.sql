-- ============================================================
-- 0141 — Donaciones e Insumos: oportunidades de donación (oferta) + emparejamiento
-- ------------------------------------------------------------
-- La sección Insumos solo tenía el lado de la DEMANDA (solicitudes_insumo) y el
-- compromiso concreto (donaciones). Este módulo añade el lado de la OFERTA: un
-- mini-CRM de «oportunidades de donación» — empresas/proyectos/personas que
-- ofrecen ayudar — con pipeline de contacto (bitácora) y emparejamiento con las
-- solicitudes que encajan. Al concretar una coincidencia se crea una `donaciones`
-- (registro ya existente) enlazada por el nuevo `oportunidad_id`.
--
-- Acceso: lectura para cualquier verificado; ALTA para cualquier verificado (así
-- el equipo de Recopilación capta ofertas, no solo solicitudes); la GESTIÓN
-- (avanzar estado, asignar, borrar) es de puede_logistica(). Reutiliza los helpers
-- es_verificado() (0009) y puede_logistica() (0050/0119) y el enum tipo_insumo
-- (0050). Estados/tipos como text check(...) (sin enums nuevos → sin cast eager).
-- Idempotente. Ejecutar tras 0140.
-- ============================================================

-- ── Oportunidades de donación (la oferta / lead con pipeline de contacto) ──
create table if not exists public.oportunidades_donacion (
  id             uuid primary key default gen_random_uuid(),
  organizacion   text not null,                    -- empresa / proyecto / persona que ofrece
  contacto       text,                             -- libre: «nombre · teléfono · correo»
  tipo_oferta    text not null default 'especie'
                   check (tipo_oferta in ('especie','dinero','servicio','transporte','otro')),
  cubre_tipos    public.tipo_insumo[] not null default '{}',  -- tipos de insumo que puede cubrir (para sugerencias)
  descripcion    text,
  monto_estimado numeric,
  ubicacion      text,
  enlace         text,
  estado         text not null default 'nueva'
                   check (estado in ('nueva','contactada','en_conversacion','comprometida','cumplida','descartada')),
  asignado_a     uuid references public.perfiles (id) on delete set null,
  creado_por     uuid references public.perfiles (id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_oportdon_estado on public.oportunidades_donacion (estado, creado_en desc);

-- ── Bitácora de contacto de cada oportunidad (molde bitacora_busqueda 0087) ──
create table if not exists public.bitacora_oportunidad (
  id             uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null references public.oportunidades_donacion (id) on delete cascade,
  autor_id       uuid references public.perfiles (id) on delete set null,
  contenido      text not null,
  canal          text check (canal in ('llamada','whatsapp','correo','reunion','otro')),
  resultado      text check (resultado in ('positivo','pendiente','sin_respuesta','negativo')),
  creado_en      timestamptz not null default now()
);
create index if not exists idx_bitac_oport on public.bitacora_oportunidad (oportunidad_id, creado_en desc);

-- ── Traza: qué donación concreta nació de qué oferta ──
alter table public.donaciones
  add column if not exists oportunidad_id uuid references public.oportunidades_donacion (id) on delete set null;

-- ── RLS ──
alter table public.oportunidades_donacion enable row level security;
alter table public.bitacora_oportunidad   enable row level security;

-- Oportunidades: lectura amplia (verificado); ALTA propia (incluye Recopilación);
-- gestión (update/delete) de Logística.
drop policy if exists oportdon_select on public.oportunidades_donacion;
create policy oportdon_select on public.oportunidades_donacion for select to authenticated
  using (public.es_verificado());
drop policy if exists oportdon_insert on public.oportunidades_donacion;
create policy oportdon_insert on public.oportunidades_donacion for insert to authenticated
  with check (public.es_verificado() and creado_por = auth.uid());
drop policy if exists oportdon_update on public.oportunidades_donacion;
create policy oportdon_update on public.oportunidades_donacion for update to authenticated
  using (public.puede_logistica()) with check (public.puede_logistica());
drop policy if exists oportdon_delete on public.oportunidades_donacion;
create policy oportdon_delete on public.oportunidades_donacion for delete to authenticated
  using (public.puede_logistica());

-- Bitácora: lectura de verificados; ALTA propia (autor = uid); borra el autor o Logística.
drop policy if exists bitac_oport_select on public.bitacora_oportunidad;
create policy bitac_oport_select on public.bitacora_oportunidad for select to authenticated
  using (public.es_verificado());
drop policy if exists bitac_oport_insert on public.bitacora_oportunidad;
create policy bitac_oport_insert on public.bitacora_oportunidad for insert to authenticated
  with check (public.es_verificado() and autor_id = auth.uid());
drop policy if exists bitac_oport_delete on public.bitacora_oportunidad;
create policy bitac_oport_delete on public.bitacora_oportunidad for delete to authenticated
  using (autor_id = auth.uid() or public.puede_logistica());

-- ── Notificación: al registrar una oferta, avisa al equipo de Logística (molde 0116) ──
-- `logistica` es un valor de enum PRE-existente (0050) → el cast eager es seguro.
-- `tipo` es texto libre; el webhook per-row (0060) emite el push. No se avisa a
-- quien la registró (si además fuera de Logística).
create or replace function public.notificar_oportunidad_donacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select p.id, 'oportunidad_donacion', 'Nueva oportunidad de donación',
         coalesce(new.organizacion, 'Alguien') || ' ofrece ayudar. 💛',
         '/insumos/oportunidades/' || new.id
  from public.perfiles p
  where p.verificado
    and p.id is distinct from new.creado_por
    and (p.rol = 'logistica'::public.rol_usuario
         or 'logistica'::public.rol_usuario = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[])));
  return new;
end $$;

drop trigger if exists trg_notificar_oportunidad_donacion on public.oportunidades_donacion;
create trigger trg_notificar_oportunidad_donacion
  after insert on public.oportunidades_donacion
  for each row execute function public.notificar_oportunidad_donacion();

-- ── Realtime (idempotente) ──
do $$ begin alter publication supabase_realtime add table public.oportunidades_donacion; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.bitacora_oportunidad;   exception when duplicate_object then null; end $$;
