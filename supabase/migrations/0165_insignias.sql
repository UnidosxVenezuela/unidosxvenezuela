-- ============================================================
-- 0165 — Insignias del voluntariado (catálogo + otorgamiento automático)
-- ------------------------------------------------------------
-- Decidido por coordinación: estilo E (alas + cristal) para HITOS únicos y
-- estilo D (escudo heráldico) para ESCALERAS con nivel bronce/plata/oro por
-- insignia (sin nivel global). Ninguna insignia se pierde: haber sido líder,
-- coordinador o admin queda para siempre. Todo se otorga SOLO (triggers +
-- funciones SECURITY DEFINER); ningún admin las asigna a mano.
-- Idempotente y resiliente: los triggers sobre tablas que podrían no existir
-- se crean dentro de DO ... if exists. Ejecutar tras 0164.
-- ============================================================

-- ── Catálogo ──
create table if not exists public.insignias (
  id          text primary key,          -- slug estable
  nombre      text not null,
  descripcion text not null,             -- cómo se gana (visible en la vitrina)
  icono       text not null default '🏅',
  categoria   text not null default 'hito' check (categoria in ('base','hito','nivel','liderazgo')),
  estilo      text not null default 'E' check (estilo in ('E','D')),
  nivel       text check (nivel in ('bronce','plata','oro')),
  serie       text,                      -- escalera a la que pertenece (null = hito único)
  umbral      int,                       -- valor del contador que la desbloquea
  orden       int not null default 100
);
alter table public.insignias enable row level security;
drop policy if exists insig_select on public.insignias;
create policy insig_select on public.insignias for select to authenticated using (true);

-- ── Insignias ganadas ──
create table if not exists public.perfil_insignias (
  perfil_id   uuid not null references public.perfiles (id) on delete cascade,
  insignia_id text not null references public.insignias (id) on delete cascade,
  otorgada_en timestamptz not null default now(),
  primary key (perfil_id, insignia_id)
);
alter table public.perfil_insignias enable row level security;
drop policy if exists pinsig_select on public.perfil_insignias;
create policy pinsig_select on public.perfil_insignias for select to authenticated
  using (perfil_id = auth.uid() or public.es_verificado());
-- Sin INSERT/UPDATE/DELETE de cliente: otorga solo la plataforma (funciones definer).

-- ── Contadores por persona (fuente de las escaleras cuya autoría no está en tablas) ──
create table if not exists public.perfil_contadores (
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  clave     text not null,
  valor     int not null default 0,
  primary key (perfil_id, clave)
);
alter table public.perfil_contadores enable row level security;
drop policy if exists pcont_select on public.perfil_contadores;
create policy pcont_select on public.perfil_contadores for select to authenticated
  using (perfil_id = auth.uid());

-- ── Otorgar (idempotente) + aviso ──
create or replace function public.otorgar_insignia(p_perfil uuid, p_insignia text)
returns void language plpgsql security definer set search_path = public as $$
declare v_nombre text;
begin
  if p_perfil is null then return; end if;
  select nombre into v_nombre from public.insignias where id = p_insignia;
  if v_nombre is null then return; end if;
  insert into public.perfil_insignias (perfil_id, insignia_id) values (p_perfil, p_insignia)
  on conflict do nothing;
  if found then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    values (p_perfil, 'insignia', '🏅 ¡Nueva insignia!', 'Ganaste «' || v_nombre || '». Se ve en tu panel.', '/insignias');
  end if;
end $$;

-- Suma 1 al contador de la serie y otorga los escalones alcanzados.
create or replace function public.sumar_contador_y_otorgar(p_perfil uuid, p_serie text)
returns void language plpgsql security definer set search_path = public as $$
declare v int; r record;
begin
  if p_perfil is null then return; end if;
  insert into public.perfil_contadores (perfil_id, clave, valor) values (p_perfil, p_serie, 1)
  on conflict (perfil_id, clave) do update set valor = public.perfil_contadores.valor + 1
  returning valor into v;
  for r in select id from public.insignias where serie = p_serie and umbral is not null and umbral <= v loop
    perform public.otorgar_insignia(p_perfil, r.id);
  end loop;
end $$;

-- Otorga por valor absoluto (horas, backfills).
create or replace function public.otorgar_por_valor(p_perfil uuid, p_serie text, p_valor numeric)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if p_perfil is null then return; end if;
  for r in select id from public.insignias where serie = p_serie and umbral is not null and umbral <= p_valor loop
    perform public.otorgar_insignia(p_perfil, r.id);
  end loop;
end $$;

-- ── SEED del catálogo (upsert: se puede re-ejecutar y ajustar textos) ──
insert into public.insignias (id, nombre, descripcion, icono, categoria, estilo, nivel, serie, umbral, orden) values
  ('voluntario',        'Voluntario/a',            'Cuenta activada y verificada en Apoyo por Venezuela — la primera de todas.', '💛', 'base', 'E', null, null, null, 1),
  ('identidad',         'Identidad confirmada',    'Segunda verificación de identidad aprobada.', '🪪', 'base', 'E', null, null, null, 2),
  ('nota_1',            'Primera nota',            'Tu primera nota en la bitácora de una solicitud u ofrecimiento.', '🗒️', 'hito', 'E', null, 'notas', 1, 10),
  ('nota_25',           'Colaborador/a constante', '25 notas de bitácora acumuladas.', '💬', 'nivel', 'D', 'oro', 'notas', 25, 11),
  ('tarea_1',           'Primera tarea',           'Completaste tu primera tarea de grupo.', '✅', 'hito', 'E', null, 'tareas_completadas', 1, 12),
  ('tarea_10',          'Manos a la obra',         '10 tareas de grupo completadas.', '🧰', 'nivel', 'D', 'oro', 'tareas_completadas', 10, 13),
  ('horas_5',           '5 horas de servicio',     '5 horas automáticas con la plataforma.', '⏱️', 'nivel', 'D', 'bronce', 'horas', 5, 20),
  ('horas_10',          '10 horas de servicio',    '10 horas de servicio.', '⏱️', 'nivel', 'D', 'bronce', 'horas', 10, 21),
  ('horas_25',          '25 horas de servicio',    '25 horas de servicio.', '⏳', 'nivel', 'D', 'plata', 'horas', 25, 22),
  ('horas_50',          '50 horas de servicio',    '50 horas de servicio.', '⏳', 'nivel', 'D', 'plata', 'horas', 50, 23),
  ('horas_100',         '100 horas de servicio',   '100 horas de servicio.', '🌟', 'nivel', 'D', 'oro', 'horas', 100, 24),
  ('horas_250',         '250 horas de servicio',   '250 horas de servicio. Gracias infinitas.', '🏆', 'nivel', 'D', 'oro', 'horas', 250, 25),
  ('solicitud_1',       'Primera solicitud',       'Registraste tu primera solicitud de ayuda.', '📝', 'hito', 'E', null, 'solicitudes', 1, 30),
  ('solicitud_10',      'Reportero/a 10',          '10 solicitudes registradas.', '📚', 'nivel', 'D', 'bronce', 'solicitudes', 10, 31),
  ('solicitud_20',      'Reportero/a 20',          '20 solicitudes registradas.', '📚', 'nivel', 'D', 'plata', 'solicitudes', 20, 32),
  ('solicitud_30',      'Reportero/a 30',          '30 solicitudes registradas.', '📚', 'nivel', 'D', 'plata', 'solicitudes', 30, 33),
  ('solicitud_40',      'Reportero/a 40',          '40 solicitudes registradas.', '📚', 'nivel', 'D', 'oro', 'solicitudes', 40, 34),
  ('solicitud_50',      'Corresponsal',            '50 solicitudes registradas.', '🗞️', 'nivel', 'D', 'oro', 'solicitudes', 50, 35),
  ('reporte_confirmado','Reporte confirmado',      'Tu primera solicitud confirmada por Verificación.', '✔️', 'hito', 'E', null, null, null, 36),
  ('ofrec_1',           'Primer ofrecimiento',     'Registraste tu primer Donación-Ofrecimiento.', '💚', 'hito', 'E', null, 'ofrecimientos', 1, 40),
  ('ofrec_5',           'Captador/a 5',            '5 ofrecimientos registrados.', '💐', 'nivel', 'D', 'bronce', 'ofrecimientos', 5, 41),
  ('ofrec_10',          'Captador/a 10',           '10 ofrecimientos registrados.', '💐', 'nivel', 'D', 'plata', 'ofrecimientos', 10, 42),
  ('ofrec_20',          'Captador/a 20',           '20 ofrecimientos registrados.', '💐', 'nivel', 'D', 'oro', 'ofrecimientos', 20, 43),
  ('cartografo',        'Cartógrafo/a',            'Tu primer punto del mapa (albergue/hospital/acopio) confirmado y publicado.', '🗺️', 'hito', 'E', null, null, null, 44),
  ('verif_1',           'Primera verificación',    'Confirmaste o descartaste tu primera solicitud.', '🔎', 'hito', 'E', null, 'verificaciones', 1, 50),
  ('verif_10',          'Verificador/a 10',        '10 verificaciones completadas.', '🧐', 'nivel', 'D', 'bronce', 'verificaciones', 10, 51),
  ('verif_25',          'Ojo experto',             '25 verificaciones completadas.', '🦉', 'nivel', 'D', 'plata', 'verificaciones', 25, 52),
  ('verif_100',         'Halcón',                  '100 verificaciones completadas.', '🦅', 'nivel', 'D', 'oro', 'verificaciones', 100, 53),
  ('overif_1',          'Oferta al día',           'Tu primer ofrecimiento verificado u observado.', '🛰️', 'hito', 'E', null, 'ofertas_verif', 1, 54),
  ('overif_10',         'Radar de ofertas 10',     '10 ofrecimientos verificados.', '📡', 'nivel', 'D', 'bronce', 'ofertas_verif', 10, 55),
  ('overif_20',         'Radar de ofertas 20',     '20 ofrecimientos verificados.', '📡', 'nivel', 'D', 'plata', 'ofertas_verif', 20, 56),
  ('overif_50',         'Radar de ofertas 50',     '50 ofrecimientos verificados.', '📡', 'nivel', 'D', 'oro', 'ofertas_verif', 50, 57),
  ('buen_criterio',     'Buen criterio',           'Tu primera devolución a Recopilación pidiendo información (cuida la calidad).', '↩️', 'hito', 'E', null, null, null, 58),
  ('entrega_1',         'Primera entrega',         'Completaste tu primera solicitud de insumos (entregada).', '🚚', 'hito', 'E', null, 'entregas', 1, 60),
  ('entrega_5',         'Repartidor/a 5',          '5 entregas completadas.', '📦', 'nivel', 'D', 'bronce', 'entregas', 5, 61),
  ('entrega_10',        'Repartidor/a 10',         '10 entregas completadas.', '📦', 'nivel', 'D', 'plata', 'entregas', 10, 62),
  ('entrega_25',        'Ruta experta',            '25 entregas completadas.', '🛣️', 'nivel', 'D', 'plata', 'entregas', 25, 63),
  ('entrega_50',        'Ruta maestra',            '50 entregas completadas.', '🏁', 'nivel', 'D', 'oro', 'entregas', 50, 64),
  ('conexion_1',        'Conector/a',              'Tu primera donación conectada con una solicitud.', '🤝', 'hito', 'E', null, 'conexiones', 1, 65),
  ('conexion_5',        'Conector/a 5',            '5 donaciones conectadas.', '🤝', 'nivel', 'D', 'plata', 'conexiones', 5, 66),
  ('conexion_15',       'Conector/a 15',           '15 donaciones conectadas.', '🤝', 'nivel', 'D', 'oro', 'conexiones', 15, 67),
  ('envio_1',           'Primer envío',            'Registraste tu primer envío con conductor.', '🚐', 'hito', 'E', null, 'envios', 1, 68),
  ('envio_10',          'Despachador/a',           '10 envíos registrados.', '🚐', 'nivel', 'D', 'oro', 'envios', 10, 69),
  ('transp_1',          'Flota lista',             'Registraste tu primer transportista.', '🧭', 'hito', 'E', null, 'transportistas', 1, 70),
  ('transp_5',          'Flota completa',          '5 transportistas registrados.', '🧭', 'nivel', 'D', 'oro', 'transportistas', 5, 71),
  ('capta_1',           'Primera entidad enviada', 'Tu primera empresa/organización/alianza trabajada y enviada.', '🏢', 'hito', 'E', null, 'capta_enviadas', 1, 80),
  ('capta_5',           'Tejedor/a de alianzas 5', '5 entidades enviadas.', '🌐', 'nivel', 'D', 'bronce', 'capta_enviadas', 5, 81),
  ('capta_10',          'Tejedor/a de alianzas 10','10 entidades enviadas.', '🌐', 'nivel', 'D', 'plata', 'capta_enviadas', 10, 82),
  ('capta_25',          'Tejedor/a de alianzas 25','25 entidades enviadas.', '🌐', 'nivel', 'D', 'oro', 'capta_enviadas', 25, 83),
  ('refer_1',           'Referencia útil',         'Tu primera nota-referencia en la bitácora de una solicitud de Logística.', '💼', 'hito', 'E', null, 'referencias', 1, 84),
  ('refer_10',          'Referencias 10',          '10 referencias dejadas a Logística.', '💼', 'nivel', 'D', 'plata', 'referencias', 10, 85),
  ('refer_25',          'Referencias 25',          '25 referencias dejadas a Logística.', '💼', 'nivel', 'D', 'oro', 'referencias', 25, 86),
  ('psico_1',           'Primer acompañamiento',   'Registraste tu primera atención (solo el hecho; nunca el contenido).', '🫂', 'hito', 'E', null, 'psico', 1, 90),
  ('psico_10',          'Presencia que sana',      '10 acompañamientos registrados.', '🌱', 'nivel', 'D', 'oro', 'psico', 10, 91),
  ('lider_grupo',       'Líder de grupo',          'Asumiste el liderazgo de un grupo. Se conserva para siempre.', '🎖️', 'liderazgo', 'E', null, null, null, 100),
  ('coordinador',       'Coordinador/a',           'Asumiste la coordinación. Se conserva para siempre.', '🧭', 'liderazgo', 'E', null, null, null, 101),
  ('administrador',     'Administrador/a',         'Serviste en la administración de la plataforma. Se conserva para siempre.', '🛠️', 'liderazgo', 'E', null, null, null, 102),
  ('tasig_1',           'Primera tarea asignada',  'Creaste y asignaste tu primera tarea al equipo.', '📋', 'hito', 'E', null, 'tareas_asignadas', 1, 103),
  ('tasig_10',          'Organizador/a 10',        '10 tareas asignadas a tu equipo.', '📋', 'nivel', 'D', 'plata', 'tareas_asignadas', 10, 104),
  ('tasig_25',          'Organizador/a 25',        '25 tareas asignadas a tu equipo.', '📋', 'nivel', 'D', 'oro', 'tareas_asignadas', 25, 105),
  ('guardian_1',        'Guardián de identidades', 'Revisaste tu primera verificación de identidad.', '🪪', 'hito', 'E', null, 'guardian', 1, 106),
  ('guardian_25',       'Guardián 25',             '25 verificaciones de identidad revisadas.', '🪪', 'nivel', 'D', 'oro', 'guardian', 25, 107)
on conflict (id) do update set nombre = excluded.nombre, descripcion = excluded.descripcion,
  icono = excluded.icono, categoria = excluded.categoria, estilo = excluded.estilo,
  nivel = excluded.nivel, serie = excluded.serie, umbral = excluded.umbral, orden = excluded.orden;

-- ── Triggers de otorgamiento (tablas SEGURAS del esquema base) ──
-- Voluntario/a al quedar verificado.
create or replace function public.insig_perfil_verificado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.verificado then perform public.otorgar_insignia(new.id, 'voluntario'); end if;
  -- Liderazgo permanente por rol (coordinador / administración, incl. áreas).
  if new.rol::text = 'coordinador' or 'coordinador' = any(coalesce(new.roles_extra,'{}'::public.rol_usuario[])) then
    perform public.otorgar_insignia(new.id, 'coordinador');
  end if;
  if new.rol::text in ('admin','admin_verificacion','admin_redes','admin_logistica','admin_digitalizacion')
     or exists (select 1 from unnest(coalesce(new.roles_extra,'{}'::public.rol_usuario[])) rr
                where rr::text in ('admin','admin_verificacion','admin_redes','admin_logistica','admin_digitalizacion')) then
    perform public.otorgar_insignia(new.id, 'administrador');
  end if;
  return new;
end $$;
drop trigger if exists trg_insig_perfil on public.perfiles;
create trigger trg_insig_perfil after insert or update of verificado, rol, roles_extra on public.perfiles
  for each row execute function public.insig_perfil_verificado();

-- Identidad aprobada + contador del revisor (guardián).
create or replace function public.insig_identidad() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'aprobada' and new.estado is distinct from old.estado then
    perform public.otorgar_insignia(new.perfil_id, 'identidad');
  end if;
  if new.estado in ('aprobada','rechazada') and new.estado is distinct from old.estado and auth.uid() is not null then
    perform public.sumar_contador_y_otorgar(auth.uid(), 'guardian');
  end if;
  return new;
end $$;
drop trigger if exists trg_insig_identidad on public.verificaciones_identidad;
create trigger trg_insig_identidad after update on public.verificaciones_identidad
  for each row execute function public.insig_identidad();

-- Horas automáticas → escalera por SUMA total.
create or replace function public.insig_horas() returns trigger
language plpgsql security definer set search_path = public as $$
declare v numeric;
begin
  select coalesce(sum(horas),0) into v from public.registro_horas where perfil_id = new.perfil_id;
  perform public.otorgar_por_valor(new.perfil_id, 'horas', v);
  return new;
end $$;
drop trigger if exists trg_insig_horas on public.registro_horas;
create trigger trg_insig_horas after insert or update on public.registro_horas
  for each row execute function public.insig_horas();

-- Solicitudes registradas (autor) + confirmadas (hito autor / escalera del verificador).
create or replace function public.insig_caso_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.sumar_contador_y_otorgar(new.creado_por, 'solicitudes');
  return new;
end $$;
drop trigger if exists trg_insig_caso_ins on public.casos;
create trigger trg_insig_caso_ins after insert on public.casos
  for each row execute function public.insig_caso_insert();

create or replace function public.insig_caso_estado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado is distinct from old.estado then
    if new.estado::text = 'confirmado' then
      perform public.otorgar_insignia(new.creado_por, 'reporte_confirmado');
    end if;
    if new.estado::text in ('confirmado','falso') and auth.uid() is not null and public.puede_verificar() then
      perform public.sumar_contador_y_otorgar(auth.uid(), 'verificaciones');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_insig_caso_est on public.casos;
create trigger trg_insig_caso_est after update of estado on public.casos
  for each row execute function public.insig_caso_estado();

-- «Requiere info» del verificador (buen criterio).
create or replace function public.insig_caso_info() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.info_requerida is not null and new.info_requerida is distinct from old.info_requerida
     and auth.uid() is not null and public.puede_verificar() then
    perform public.otorgar_insignia(auth.uid(), 'buen_criterio');
  end if;
  return new;
end $$;
drop trigger if exists trg_insig_caso_info on public.casos;
create trigger trg_insig_caso_info after update of info_requerida on public.casos
  for each row execute function public.insig_caso_info();

-- Punto del mapa nacido de una solicitud → cartógrafo (autor del caso).
create or replace function public.insig_punto() returns trigger
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if new.caso_id is not null then
    select creado_por into v from public.casos where id = new.caso_id;
    perform public.otorgar_insignia(v, 'cartografo');
  end if;
  return new;
end $$;
drop trigger if exists trg_insig_punto on public.puntos_acopio;
create trigger trg_insig_punto after insert on public.puntos_acopio
  for each row execute function public.insig_punto();

-- Ofrecimientos: registrados (autor) + verificados (actor Verificación).
create or replace function public.insig_oferta_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.sumar_contador_y_otorgar(new.creado_por, 'ofrecimientos');
  return new;
end $$;
drop trigger if exists trg_insig_oferta_ins on public.oportunidades_donacion;
create trigger trg_insig_oferta_ins after insert on public.oportunidades_donacion
  for each row execute function public.insig_oferta_insert();

create or replace function public.insig_oferta_verif() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado_verificacion is distinct from old.estado_verificacion
     and new.estado_verificacion in ('verificada','observada')
     and auth.uid() is not null and public.puede_verificar() then
    perform public.sumar_contador_y_otorgar(auth.uid(), 'ofertas_verif');
  end if;
  return new;
end $$;
drop trigger if exists trg_insig_oferta_ver on public.oportunidades_donacion;
create trigger trg_insig_oferta_ver after update of estado_verificacion on public.oportunidades_donacion
  for each row execute function public.insig_oferta_verif();

-- Logística: entregas (actor), conexiones (autor), envíos (actor), transportistas (autor).
create or replace function public.insig_entrega() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado is distinct from old.estado and new.estado::text = 'entregado' and auth.uid() is not null then
    perform public.sumar_contador_y_otorgar(auth.uid(), 'entregas');
  end if;
  return new;
end $$;
drop trigger if exists trg_insig_entrega on public.solicitudes_insumo;
create trigger trg_insig_entrega after update of estado on public.solicitudes_insumo
  for each row execute function public.insig_entrega();

create or replace function public.insig_conexion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.oportunidad_id is not null then
    perform public.sumar_contador_y_otorgar(coalesce(new.creado_por, auth.uid()), 'conexiones');
  end if;
  return new;
end $$;
drop trigger if exists trg_insig_conexion on public.donaciones;
create trigger trg_insig_conexion after insert on public.donaciones
  for each row execute function public.insig_conexion();

create or replace function public.insig_envio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.sumar_contador_y_otorgar(coalesce(new.creado_por, auth.uid()), 'envios');
  return new;
end $$;
drop trigger if exists trg_insig_envio on public.envios;
create trigger trg_insig_envio after insert on public.envios
  for each row execute function public.insig_envio();

-- ── Triggers sobre tablas OPCIONALES (solo si existen; no rompe en bases viejas) ──
do $$
begin
  if to_regclass('public.transportistas_logistica') is not null then
    create or replace function public.insig_transp() returns trigger
    language plpgsql security definer set search_path = public as $tt$
    begin
      perform public.sumar_contador_y_otorgar(coalesce(new.creado_por, auth.uid()), 'transportistas');
      return new;
    end $tt$;
    execute 'drop trigger if exists trg_insig_transp on public.transportistas_logistica';
    execute 'create trigger trg_insig_transp after insert on public.transportistas_logistica for each row execute function public.insig_transp()';
  end if;

  if to_regclass('public.oportunidades') is not null then
    create or replace function public.insig_capta() returns trigger
    language plpgsql security definer set search_path = public as $tt$
    begin
      if new.estado is distinct from old.estado and new.estado = 'enviado' and auth.uid() is not null then
        perform public.sumar_contador_y_otorgar(auth.uid(), 'capta_enviadas');
      end if;
      return new;
    end $tt$;
    execute 'drop trigger if exists trg_insig_capta on public.oportunidades';
    execute 'create trigger trg_insig_capta after update of estado on public.oportunidades for each row execute function public.insig_capta()';
  end if;

  if to_regclass('public.bitacora_solicitud') is not null then
    create or replace function public.insig_nota_sol() returns trigger
    language plpgsql security definer set search_path = public as $tt$
    begin
      perform public.sumar_contador_y_otorgar(new.autor_id, 'notas');
      if exists (select 1 from public.perfiles p where p.id = new.autor_id
                 and (p.rol::text = 'captacion' or 'captacion' = any(coalesce(p.roles_extra,'{}'::public.rol_usuario[])))) then
        perform public.sumar_contador_y_otorgar(new.autor_id, 'referencias');
      end if;
      return new;
    end $tt$;
    execute 'drop trigger if exists trg_insig_nota_sol on public.bitacora_solicitud';
    execute 'create trigger trg_insig_nota_sol after insert on public.bitacora_solicitud for each row execute function public.insig_nota_sol()';
  end if;

  if to_regclass('public.bitacora_oportunidad') is not null then
    create or replace function public.insig_nota_of() returns trigger
    language plpgsql security definer set search_path = public as $tt$
    begin
      perform public.sumar_contador_y_otorgar(new.autor_id, 'notas');
      return new;
    end $tt$;
    execute 'drop trigger if exists trg_insig_nota_of on public.bitacora_oportunidad';
    execute 'create trigger trg_insig_nota_of after insert on public.bitacora_oportunidad for each row execute function public.insig_nota_of()';
  end if;

  if to_regclass('public.bitacora_psicosocial') is not null then
    create or replace function public.insig_psico() returns trigger
    language plpgsql security definer set search_path = public as $tt$
    begin
      perform public.sumar_contador_y_otorgar(coalesce(new.autor_id, auth.uid()), 'psico');
      return new;
    end $tt$;
    execute 'drop trigger if exists trg_insig_psico on public.bitacora_psicosocial';
    execute 'create trigger trg_insig_psico after insert on public.bitacora_psicosocial for each row execute function public.insig_psico()';
  end if;

  -- Tareas: completadas (asignados o asignado_a) + asignadas (creador que asigna a otro).
  if to_regclass('public.tareas') is not null then
    create or replace function public.insig_tarea_estado() returns trigger
    language plpgsql security definer set search_path = public as $tt$
    declare r record;
    begin
      if new.estado is distinct from old.estado and new.estado::text = 'completada' then
        if to_regclass('public.tareas_asignados') is not null then
          for r in execute 'select perfil_id from public.tareas_asignados where tarea_id = $1' using new.id loop
            perform public.sumar_contador_y_otorgar(r.perfil_id, 'tareas_completadas');
          end loop;
        end if;
        begin
          perform public.sumar_contador_y_otorgar(new.asignado_a, 'tareas_completadas');
        exception when undefined_column then null; end;
      end if;
      return new;
    end $tt$;
    execute 'drop trigger if exists trg_insig_tarea_est on public.tareas';
    execute 'create trigger trg_insig_tarea_est after update of estado on public.tareas for each row execute function public.insig_tarea_estado()';

    create or replace function public.insig_tarea_insert() returns trigger
    language plpgsql security definer set search_path = public as $tt$
    begin
      if new.asignado_a is not null then
        perform public.sumar_contador_y_otorgar(new.creado_por, 'tareas_asignadas');
      end if;
      return new;
    end $tt$;
    execute 'drop trigger if exists trg_insig_tarea_ins on public.tareas';
    execute 'create trigger trg_insig_tarea_ins after insert on public.tareas for each row execute function public.insig_tarea_insert()';
  end if;

  -- Líder de grupo: permanente al asumir (columna lider_id si existe).
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'grupos' and column_name = 'lider_id') then
    create or replace function public.insig_lider() returns trigger
    language plpgsql security definer set search_path = public as $tt$
    begin
      if new.lider_id is not null then perform public.otorgar_insignia(new.lider_id, 'lider_grupo'); end if;
      return new;
    end $tt$;
    execute 'drop trigger if exists trg_insig_lider on public.grupos';
    execute 'create trigger trg_insig_lider after insert or update of lider_id on public.grupos for each row execute function public.insig_lider()';
  end if;
end $$;

-- ── Backfill (lo atribuible con datos existentes) ──
do $$
declare r record;
begin
  for r in select id from public.perfiles where verificado loop
    perform public.otorgar_insignia(r.id, 'voluntario');
  end loop;
  for r in select id, rol, roles_extra from public.perfiles loop
    if r.rol::text = 'coordinador' or 'coordinador' = any(coalesce(r.roles_extra,'{}'::public.rol_usuario[])) then
      perform public.otorgar_insignia(r.id, 'coordinador');
    end if;
    if r.rol::text in ('admin','admin_verificacion','admin_redes','admin_logistica','admin_digitalizacion')
       or exists (select 1 from unnest(coalesce(r.roles_extra,'{}'::public.rol_usuario[])) rr
                  where rr::text in ('admin','admin_verificacion','admin_redes','admin_logistica','admin_digitalizacion')) then
      perform public.otorgar_insignia(r.id, 'administrador');
    end if;
  end loop;
  if to_regclass('public.verificaciones_identidad') is not null then
    for r in select perfil_id from public.verificaciones_identidad where estado = 'aprobada' loop
      perform public.otorgar_insignia(r.perfil_id, 'identidad');
    end loop;
  end if;
  for r in select perfil_id, sum(horas) as h from public.registro_horas group by perfil_id loop
    perform public.otorgar_por_valor(r.perfil_id, 'horas', r.h);
  end loop;
  for r in select creado_por, count(*) as n from public.casos where creado_por is not null group by creado_por loop
    insert into public.perfil_contadores (perfil_id, clave, valor) values (r.creado_por, 'solicitudes', r.n)
      on conflict (perfil_id, clave) do update set valor = greatest(public.perfil_contadores.valor, excluded.valor);
    perform public.otorgar_por_valor(r.creado_por, 'solicitudes', r.n);
  end loop;
  for r in select creado_por, count(*) as n from public.oportunidades_donacion where creado_por is not null group by creado_por loop
    insert into public.perfil_contadores (perfil_id, clave, valor) values (r.creado_por, 'ofrecimientos', r.n)
      on conflict (perfil_id, clave) do update set valor = greatest(public.perfil_contadores.valor, excluded.valor);
    perform public.otorgar_por_valor(r.creado_por, 'ofrecimientos', r.n);
  end loop;
  for r in select creado_por from public.casos where estado::text = 'confirmado' and creado_por is not null group by creado_por loop
    perform public.otorgar_insignia(r.creado_por, 'reporte_confirmado');
  end loop;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'grupos' and column_name = 'lider_id') then
    for r in execute 'select distinct lider_id as lid from public.grupos where lider_id is not null' loop
      perform public.otorgar_insignia(r.lid, 'lider_grupo');
    end loop;
  end if;
end $$;
