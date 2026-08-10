-- ============================================================
-- 0231 — Hilos de trabajo: la conversación de cada entidad (keystone del chat)
-- ------------------------------------------------------------
-- ANTES: la plataforma no tiene conversación. Hay `comentarios_tarea` (0001), que solo
--   sirve a tareas, y cuatro bitácoras ad-hoc de áreas concretas (`bitacora_busqueda`,
--   `bitacora_psicosocial`, `bitacora_oportunidad`, `bitacora_solicitud`). Para una
--   solicitud no hay NADA: el `casos_historial_cambios` registra cambios de campo, no
--   discusión. La coordinación real ocurre en WhatsApp, fuera de todo registro.
--   Y hay una promesa incumplida: `docs/GUIA-DATOS-SENSIBLES` le dice al equipo
--   «Cada caso tiene su bitácora: ahí sí» y «Manda el número de la solicitud: quien deba
--   verla, entra». Esa bitácora NO EXISTE. Esta migración la construye.
--
-- AHORA: hilos ANCLADOS a las entidades que ya existen. Un hilo por (ámbito, ancla):
--   la solicitud (`caso`), la solicitud de insumo que gestiona Logística (`insumo`), la
--   tarea y el grupo. Cada ámbito tiene una PÁGINA donde vive el hilo: si no hay dónde
--   ponerlo, no se crea el ámbito.
--   `derivacion` NO entra todavía a propósito: las derivaciones se pintan dentro de la
--   ficha del caso y no tienen página propia, así que su hilo no tendría sitio. Cuando lo
--   tenga, añadirlo es un `drop constraint` + `add constraint` y una rama en el
--   despachador — que es justo la razón de que `ambito` sea TEXT + CHECK.
--
-- ¿POR QUÉ ANCLADO Y NO UN MENSAJERO GENERAL (canales + mensajes directos)?
--   Decisión de diseño, documentada en `docs/PLAN-CHAT-Y-SOS.md`:
--   · La audiencia de un hilo NO se declara: se DERIVA de la RLS que ya gobierna su
--     ancla. Cero ejes de permiso nuevos, cero roster que administrar, cero deriva entre
--     «quién puede ver el caso» y «quién puede ver lo que se habla del caso».
--   · El descuido dominante que enumera la guía de datos sensibles —«lo pegué en el grupo
--     equivocado»— se vuelve estructuralmente imposible: no hay un sitio general donde
--     pegar datos de un caso fuera del caso.
--   · Un mensajero general (mensajes directos entre voluntarios) es un proyecto legítimo
--     pero NO es este: exige código de conducta, escalera de sanciones, canal de denuncia
--     y moderación de guardia, y la plataforma hoy ni siquiera sabe si tiene menores
--     dentro. `ambito` es TEXT + CHECK justamente para que ampliarlo después sea un
--     `drop constraint` + `add constraint`.
--
-- LA TRAMPA DE REDACCIÓN (la más importante de esta migración):
--   Desde `0180_redaccion_vista_curada.sql`, Redacción/Redes NO leen `public.casos`: se
--   les quitaron sus ramas de `casos_select` y leen la vista curada `casos_difusion`,
--   que además filtra `categoria is distinct from 'Desaparecidos'` y exige el caso
--   confirmado o publicado. Si el hilo de un caso se autorizara POR ROL, alguien con rol
--   `redaccion` —o `diseno_grafico`, `edicion_video`, `influencers`, que entran por
--   `puede_operar_area_derivacion('redes')`— obtendría conversación legible y escribible
--   sobre CUALQUIER caso, incluidos los de Desaparecidos y los que aún no se verifican.
--   Y como el hilo es texto libre donde por diseño se discute «¿puedo publicar esta
--   dirección?», el contacto interno acabaría pegado ahí: exactamente el dato que 0174
--   separó y 0180 blindó a nivel de columna.
--   Por eso `puede_leer_caso()` es el ESPEJO EXACTO de `casos_select` (0180) y ningún
--   ámbito se resuelve solo por rol.
--
-- ESCRITURA: solo por RPC SECURITY DEFINER. Las tablas publican ÚNICAMENTE policy de
--   SELECT (molde `casos_verificacion_campo`, 0172; aplicado en 0218, 0219, 0222). Con
--   RLS activa eso deniega INSERT/UPDATE/DELETE a todo el mundo. Y por PARTIDA DOBLE
--   (doctrina de 0177), un trigger-candado `gate_hilo_escritura` rechaza cualquier
--   escritura que no venga de una RPC de este módulo, identificada por el flag de sesión
--   `app.hilo_ok` (mismo mecanismo que `app.items_ok` 0218, `app.publicado_ok` 0166,
--   `app.devolver_ok` 0210, `app.sync_en_curso` 0216). Así, si mañana alguien escribe
--   otra función SECURITY DEFINER que toque estas tablas, falla en vez de colarse.
--
-- «LLEVAR REGISTRO» — qué significa aquí, en concreto:
--   · NADA SE BORRA. El candado prohíbe el DELETE de un mensaje bajo cualquier ruta,
--     incluida una RPC futura: no hay flag que lo habilite.
--   · Editar conserva la versión anterior en `hilo_versiones`, y el mensaje queda
--     marcado como editado.
--   · `hilo_versiones` NO la lee el hilo: la lee SOLO administración. Si alguien pega un
--     teléfono y lo borra editando, el original se conserva para el registro pero no
--     queda a la vista de los demás participantes. Sin esta asimetría, «corregir un
--     desliz» sería la puerta trasera para leer lo que se quiso retirar.
--   · `autor_id` es ON DELETE SET NULL (nunca cascade) + `autor_sello` congelado, para
--     que dar de baja una cuenta no borre el rastro de quién dijo qué. Para el derecho de
--     supresión existe `anonimizar_autoria_hilos()`, que es la vía lícita y deja asiento
--     de auditoría — en vez de que borrar la cuenta destruya el registro en silencio.
--
-- PII: `detectar_datos_sensibles()` marca (NO bloquea) cédulas, móviles VE/CO, correos y
--   coordenadas. En una emergencia, bloquear un mensaje es peor que registrarlo: el aviso
--   se da en la interfaz ANTES de enviar y la marca queda para revisión posterior.
--
-- ENUM-SAFETY: esta migración NO crea ni añade ningún valor de enum. `hilos.ambito` es
--   TEXT + CHECK (precedentes `casos_derivaciones.area` 0177, `punto_tipo` 0145,
--   `tipo_difusion` 0189, `casos_items.estado` 0218, `casos.pais` 0230).
--
-- LO QUE NO SE TOCA A PROPÓSITO:
--   · `comentarios_tarea` — sigue viva y con sus policies. Absorberla es un backfill que
--     merece su propia migración; hacerlo aquí mezclaría un módulo nuevo con una
--     migración de datos.
--   · `casos_select`, `casos_difusion` y las policies de 0180 — se LEEN, no se cambian.
--   · Los ámbitos de psicosocial y búsqueda quedan fuera: necesitan una revisión de
--     privacidad propia antes de abrirles conversación.
--
-- Idempotente. Ejecutar tras 0230.
-- ============================================================

-- ═══ (1) Las tablas ═══

create table if not exists public.hilos (
  id                uuid primary key default gen_random_uuid(),
  ambito            text not null check (ambito in ('caso','insumo','tarea','grupo')),
  ancla_id          uuid not null,
  creado_por        uuid references public.perfiles(id) on delete set null,
  creado_en         timestamptz not null default now(),
  ultimo_mensaje_en timestamptz,
  mensajes_n        integer not null default 0
);
create unique index if not exists uq_hilo_ancla on public.hilos (ambito, ancla_id);
create index if not exists idx_hilo_reciente on public.hilos (ultimo_mensaje_en desc nulls last);

comment on table public.hilos is
  'Un hilo de conversación por entidad (0231). La audiencia NO se declara: se deriva de la RLS del ancla mediante puede_leer_hilo(). `ambito` es TEXT + CHECK a propósito (nunca un enum nuevo): ampliarlo será drop/add constraint. Escritura solo por RPC.';
comment on column public.hilos.ancla_id is
  'Id de la entidad de la que cuelga: casos.id, solicitudes_insumo.id, tareas.id o grupos.id según `ambito`. Sin FK porque apunta a cuatro tablas distintas; la integridad la garantiza abrir_hilo(), que comprueba que el ancla existe antes de crear.';

create table if not exists public.hilo_mensajes (
  id         uuid primary key default gen_random_uuid(),
  hilo_id    uuid not null references public.hilos(id) on delete cascade,
  autor_id   uuid references public.perfiles(id) on delete set null,
  autor_sello text not null,
  cuerpo     text not null,
  pii_alerta text[] not null default '{}',
  editado_en timestamptz,
  creado_en  timestamptz not null default now()
);
create index if not exists idx_hilo_mensajes on public.hilo_mensajes (hilo_id, creado_en);
create index if not exists idx_hilo_mensajes_autor on public.hilo_mensajes (autor_id);

comment on table public.hilo_mensajes is
  'Mensajes de un hilo (0231). autor_id es ON DELETE SET NULL —nunca cascade— y autor_sello congela el nombre para que dar de baja una cuenta no borre el registro de quién dijo qué; para el derecho de supresión está anonimizar_autoria_hilos(). El DELETE está prohibido por trigger bajo cualquier ruta.';
comment on column public.hilo_mensajes.pii_alerta is
  'Etiquetas de posibles datos sensibles detectados al escribir (cedula_ve, movil_ve, movil_co, correo, coordenadas). Marca, NO bloquea: en una emergencia impedir un mensaje es peor que registrarlo.';

create table if not exists public.hilo_participantes (
  hilo_id     uuid not null references public.hilos(id) on delete cascade,
  perfil_id   uuid not null references public.perfiles(id) on delete cascade,
  leido_hasta timestamptz,
  primera_vez timestamptz not null default now(),
  primary key (hilo_id, perfil_id)
);

comment on table public.hilo_participantes is
  'Quién ha entrado a un hilo y hasta dónde ha leído (0231). NO es un roster de permisos: quién PUEDE leer lo decide puede_leer_hilo(). Esta tabla solo sirve para los no leídos y para saber a quién avisar.';

create table if not exists public.hilo_menciones (
  mensaje_id uuid not null references public.hilo_mensajes(id) on delete cascade,
  perfil_id  uuid not null references public.perfiles(id) on delete cascade,
  primary key (mensaje_id, perfil_id)
);

create table if not exists public.hilo_versiones (
  id              bigint generated always as identity primary key,
  mensaje_id      uuid not null references public.hilo_mensajes(id) on delete cascade,
  cuerpo_anterior text not null,
  editado_por     uuid references public.perfiles(id) on delete set null,
  editado_en      timestamptz not null default now()
);
create index if not exists idx_hilo_versiones on public.hilo_versiones (mensaje_id, editado_en);

comment on table public.hilo_versiones is
  'Historial de ediciones de un mensaje (0231). La lee SOLO administración, nunca los participantes del hilo: si alguien pega un dato sensible y lo retira editando, el original se conserva para el registro pero no queda a la vista. Sin esa asimetría, editar sería la puerta trasera para leer lo que se quiso retirar.';

-- ═══ (2) Helpers de lectura ═══

-- ESPEJO EXACTO de la policy `casos_select` (0180, sobre la base de 0156). Es SECURITY
-- DEFINER —salta la RLS de `casos`— porque no consulta la fila para mostrarla sino para
-- CALCULAR el mismo predicado. Cualquier cambio en `casos_select` debe reflejarse aquí:
-- están acopladas a propósito, y el comment de ambas lo dice.
create or replace function public.puede_leer_caso(p_caso uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.casos c
    where c.id = p_caso and public.es_verificado() and (
      public.es_admin()
      or public.opera_verificacion()
      or (public.tiene_rol('verificador') and c.categoria is distinct from 'Desaparecidos')
      or (public.es_mando_recopilacion() and c.categoria is distinct from 'Desaparecidos')
      or (public.es_mando_busqueda() and c.categoria = 'Desaparecidos')
      or (public.es_busqueda() and public.identidad_aprobada() and c.categoria = 'Desaparecidos'
          and not public.caso_busqueda_es_nna(c.id))
      or (public.es_buscador_nna() and public.identidad_aprobada() and c.categoria = 'Desaparecidos'
          and public.caso_busqueda_es_nna(c.id))
      or (public.es_enlace() and public.identidad_aprobada() and c.categoria = 'Desaparecidos'
          and public.caso_busqueda_etapa_enlace(c.id))
      or (public.puede_logistica() and c.estado::text in ('confirmado','enviado_redaccion','resuelto')
          and c.categoria is distinct from 'Desaparecidos')
      or (c.creado_por = auth.uid() and public.identidad_aprobada())
    )
  );
$$;

revoke all on function public.puede_leer_caso(uuid) from public;
grant execute on function public.puede_leer_caso(uuid) to authenticated;

comment on function public.puede_leer_caso(uuid) is
  'Espejo EXACTO del predicado de la policy casos_select (0180). Existe porque los hilos necesitan preguntar «¿puede esta persona leer este caso?» desde una función, y porque autorizar por ROL abriría a Redacción/Redes los casos que 0180 les cerró. Si casos_select cambia, esta función cambia con ella.';

-- Despachador de ámbito. Un solo punto que tocar cuando cambien los permisos, en lugar
-- de N policies — la lección que dejó 0214.
create or replace function public.puede_leer_ancla(p_ambito text, p_ancla uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_ambito is null or p_ancla is null then return false; end if;
  if not public.es_verificado() then return false; end if;

  if p_ambito = 'caso' then
    return public.puede_leer_caso(p_ancla);

  elsif p_ambito = 'insumo' then
    -- Espejo EXACTO de la compuerta de /insumos/[id]: «gestor o consulta de Alianzas».
    -- Deliberadamente MÁS ESTRECHO que `solins_lectura` (0050), que es `es_verificado()`:
    -- una lista de insumos no lleva PII, pero una conversación de texto libre sí acaba
    -- llevándola, y abrirla a toda cuenta verificada sería regalar el contenido a quien
    -- ni siquiera puede abrir la página donde se escribe.
    return exists (select 1 from public.solicitudes_insumo s where s.id = p_ancla)
       and (public.puede_logistica() or public.puede_alianzas());

  elsif p_ambito = 'tarea' then
    return public.puede_ver_tarea(p_ancla);

  elsif p_ambito = 'grupo' then
    return public.es_admin()
        or public.es_miembro_de(p_ancla)
        or exists (select 1 from public.grupos g where g.id = p_ancla and g.lider_id = auth.uid());
  end if;

  return false;   -- ámbito desconocido: se niega, no se abre
end $$;

revoke all on function public.puede_leer_ancla(text, uuid) from public;
grant execute on function public.puede_leer_ancla(text, uuid) to authenticated;

create or replace function public.puede_leer_hilo(p_hilo uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_ambito text; v_ancla uuid;
begin
  if p_hilo is null then return false; end if;
  select h.ambito, h.ancla_id into v_ambito, v_ancla from public.hilos h where h.id = p_hilo;
  if v_ambito is null then return false; end if;
  return public.puede_leer_ancla(v_ambito, v_ancla);
end $$;

revoke all on function public.puede_leer_hilo(uuid) from public;
grant execute on function public.puede_leer_hilo(uuid) to authenticated;

comment on function public.puede_leer_hilo(uuid) is
  'Despachador único de lectura de hilos (0231): resuelve el ámbito y delega en la RLS que ya gobierna el ancla. Todas las policies del módulo pasan por aquí, así que arreglar los permisos es tocar esta función y no N políticas.';

-- Escribir exige poder leer, tener identidad verificada y no ser observador (0009).
create or replace function public.puede_escribir_hilo(p_hilo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.puede_leer_hilo(p_hilo) and public.mi_rol() <> 'observador';
$$;

revoke all on function public.puede_escribir_hilo(uuid) from public;
grant execute on function public.puede_escribir_hilo(uuid) to authenticated;

-- ═══ (3) RLS ═══

alter table public.hilos             enable row level security;
alter table public.hilo_mensajes     enable row level security;
alter table public.hilo_participantes enable row level security;
alter table public.hilo_menciones    enable row level security;
alter table public.hilo_versiones    enable row level security;

-- REPLICA IDENTITY FULL para que Realtime evalúe la RLS también en UPDATE/DELETE
-- (molde 0181). Aquí es seguro: la fila «vieja» de un mensaje solo contiene lo que sus
-- lectores ya recibieron cuando se publicó.
alter table public.hilo_mensajes replica identity full;

drop policy if exists hilos_select on public.hilos;
create policy hilos_select on public.hilos for select to authenticated
  using (public.puede_leer_ancla(ambito, ancla_id));

drop policy if exists hmsg_select on public.hilo_mensajes;
create policy hmsg_select on public.hilo_mensajes for select to authenticated
  using (public.puede_leer_hilo(hilo_id));

-- Participantes: cada quien ve su propia marca de lectura y la de los demás DEL MISMO
-- hilo (para «visto por»). No revela nada que la lista de miembros del ancla no revele.
drop policy if exists hpart_select on public.hilo_participantes;
create policy hpart_select on public.hilo_participantes for select to authenticated
  using (public.puede_leer_hilo(hilo_id));

drop policy if exists hmenc_select on public.hilo_menciones;
create policy hmenc_select on public.hilo_menciones for select to authenticated
  using (exists (select 1 from public.hilo_mensajes m
                 where m.id = mensaje_id and public.puede_leer_hilo(m.hilo_id)));

-- Versiones: SOLO administración. Ver cabecera: es lo que impide que editar para retirar
-- un dato sensible se convierta en la forma de enseñárselo a todo el hilo.
drop policy if exists hver_select on public.hilo_versiones;
create policy hver_select on public.hilo_versiones for select to authenticated
  using (public.es_admin());

-- INSERT / UPDATE / DELETE: SIN policy, a propósito (molde 0172). Con RLS activa quedan
-- denegados para todos; la única vía es la RPC. Los drop limpian entornos de prueba.
drop policy if exists hilos_insert on public.hilos;
drop policy if exists hilos_update on public.hilos;
drop policy if exists hilos_delete on public.hilos;
drop policy if exists hmsg_insert  on public.hilo_mensajes;
drop policy if exists hmsg_update  on public.hilo_mensajes;
drop policy if exists hmsg_delete  on public.hilo_mensajes;
drop policy if exists hpart_insert on public.hilo_participantes;
drop policy if exists hpart_update on public.hilo_participantes;
drop policy if exists hpart_delete on public.hilo_participantes;
drop policy if exists hmenc_insert on public.hilo_menciones;
drop policy if exists hver_insert  on public.hilo_versiones;

grant select on public.hilos             to authenticated;
grant select on public.hilo_mensajes     to authenticated;
grant select on public.hilo_participantes to authenticated;
grant select on public.hilo_menciones    to authenticated;
grant select on public.hilo_versiones    to authenticated;

-- ═══ (4) El candado: partida doble sobre la escritura ═══
-- La RLS ya deniega la escritura directa. Esto cubre el otro flanco: que una función
-- SECURITY DEFINER futura —propia o ajena a este módulo— inserte o modifique sin pasar
-- por las validaciones. Solo se permite si la RPC declaró `app.hilo_ok`. El DELETE no
-- tiene flag que lo habilite: está prohibido y punto.
create or replace function public.gate_hilo_escritura()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los mensajes de un hilo no se borran: el registro es el punto. Edita el mensaje si hay que corregirlo.'
      using errcode = '23514';
  end if;
  -- Excepción necesaria: `autor_id` es ON DELETE SET NULL, y esa acción referencial la
  -- ejecuta el motor —no una RPC— al dar de baja una cuenta. Sin esta rama, borrar un
  -- perfil fallaría con «escritura solo por las funciones del módulo». Se permite solo
  -- si el ÚNICO cambio es autor_id → null: el contenido y el sello siguen intactos, que
  -- es justo lo que hace que el registro sobreviva a la baja.
  if tg_op = 'UPDATE'
     and old.autor_id is not null and new.autor_id is null
     and new.hilo_id     is not distinct from old.hilo_id
     and new.cuerpo      is not distinct from old.cuerpo
     and new.autor_sello is not distinct from old.autor_sello
     and new.creado_en   is not distinct from old.creado_en then
    return new;
  end if;
  if coalesce(current_setting('app.hilo_ok', true), '') <> '1' then
    raise exception 'Escritura en hilos solo por las funciones del módulo.' using errcode = '42501';
  end if;
  return new;
end $$;

-- Aunque PostgREST no expone las funciones que devuelven `trigger`, se le revoca el
-- EXECUTE a PUBLIC igual que a todas las demás: el agujero de 0208 nació exactamente de
-- una función creada sin revoke, y la regla vale más aplicada sin excepciones.
revoke all on function public.gate_hilo_escritura() from public;

drop trigger if exists trg_gate_hilo_mensajes on public.hilo_mensajes;
create trigger trg_gate_hilo_mensajes
  before insert or update or delete on public.hilo_mensajes
  for each row execute function public.gate_hilo_escritura();

comment on function public.gate_hilo_escritura() is
  'Candado por partida doble (doctrina 0177): la RLS deniega la escritura directa y este trigger deniega además cualquier escritura que no venga de una RPC del módulo, identificada por el flag de sesión app.hilo_ok. El DELETE no tiene flag: está prohibido bajo toda ruta.';

-- ═══ (5) Detección de datos sensibles ═══
-- Marca, no bloquea. Patrones deliberadamente conservadores: es preferible no marcar que
-- llenar de falsos positivos un canal de emergencia y que la gente deje de mirar el aviso.
create or replace function public.detectar_datos_sensibles(p_texto text)
returns text[] language plpgsql immutable as $$
declare v text := coalesce(p_texto, ''); r text[] := array[]::text[];
begin
  -- Cédula venezolana: V-12345678 / E12.345.678
  if v ~* '(^|[^[:alnum:]])[VE][-. ]?[0-9]{1,2}[.]?[0-9]{3}[.]?[0-9]{3}([^[:alnum:]]|$)' then
    r := array_append(r, 'cedula_ve');
  end if;
  -- Móvil venezolano: 0412/0414/0416/0424/0426 + 7 dígitos, con o sin separadores
  if v ~ '(^|[^0-9])0?4(12|14|16|24|26)[-. ]?[0-9]{3}[-. ]?[0-9]{4}([^0-9]|$)' then
    r := array_append(r, 'movil_ve');
  end if;
  -- Móvil colombiano: 3XX + 7 dígitos, con o sin +57
  if v ~ '(^|[^0-9])(\+?57[-. ]?)?3[0-9]{2}[-. ]?[0-9]{3}[-. ]?[0-9]{4}([^0-9]|$)' then
    r := array_append(r, 'movil_co');
  end if;
  if v ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}' then
    r := array_append(r, 'correo');
  end if;
  -- Coordenadas decimales pegadas: «10.4806, -66.9036»
  if v ~ '-?[0-9]{1,2}\.[0-9]{4,}[, ]+-?[0-9]{1,3}\.[0-9]{4,}' then
    r := array_append(r, 'coordenadas');
  end if;
  return r;
end $$;

revoke all on function public.detectar_datos_sensibles(text) from public;
grant execute on function public.detectar_datos_sensibles(text) to authenticated;

comment on function public.detectar_datos_sensibles(text) is
  'Etiqueta posibles datos sensibles en un texto (0231). MARCA, no bloquea: en una emergencia impedir el envío de un mensaje hace más daño que registrarlo. La interfaz avisa antes de enviar; la marca queda en hilo_mensajes.pii_alerta para revisión.';

-- ═══ (6) RPC: abrir / escribir / editar / marcar leído ═══

-- Abre el hilo del ancla si no existe y devuelve su id. Idempotente por (ambito, ancla).
create or replace function public.abrir_hilo(p_ambito text, p_ancla uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_amb text := lower(nullif(btrim(coalesce(p_ambito, '')), '')); v_id uuid; v_existe boolean;
begin
  if v_amb is null or p_ancla is null then
    raise exception 'Falta indicar de qué cuelga la conversación.' using errcode = '22023';
  end if;
  if v_amb not in ('caso','insumo','tarea','grupo') then
    raise exception 'Ámbito de conversación no válido: %', v_amb using errcode = '22023';
  end if;
  if not public.puede_leer_ancla(v_amb, p_ancla) then
    raise exception 'No tienes acceso a esta conversación.' using errcode = '42501';
  end if;

  -- El ancla tiene que existir de verdad: `ancla_id` no lleva FK porque apunta a cuatro
  -- tablas, así que la integridad se comprueba aquí.
  v_existe := case v_amb
    when 'caso'   then exists (select 1 from public.casos              where id = p_ancla)
    when 'insumo' then exists (select 1 from public.solicitudes_insumo where id = p_ancla)
    when 'tarea'  then exists (select 1 from public.tareas             where id = p_ancla)
    when 'grupo'  then exists (select 1 from public.grupos             where id = p_ancla)
  end;
  if not v_existe then
    raise exception 'No encuentro aquello de lo que cuelga la conversación.' using errcode = 'P0002';
  end if;

  select h.id into v_id from public.hilos h where h.ambito = v_amb and h.ancla_id = p_ancla;
  if v_id is not null then return v_id; end if;

  perform set_config('app.hilo_ok', '1', true);
  insert into public.hilos (ambito, ancla_id, creado_por)
  values (v_amb, p_ancla, auth.uid())
  on conflict (ambito, ancla_id) do nothing
  returning id into v_id;
  perform set_config('app.hilo_ok', '', true);

  if v_id is null then   -- carrera: otro lo creó entre el select y el insert
    select h.id into v_id from public.hilos h where h.ambito = v_amb and h.ancla_id = p_ancla;
  end if;
  return v_id;
end $$;

revoke all on function public.abrir_hilo(text, uuid) from public;
grant execute on function public.abrir_hilo(text, uuid) to authenticated;

-- Escribe un mensaje. Crea el hilo si hace falta. Devuelve el id del mensaje.
-- `p_menciones` son perfiles a los que avisar: se filtran a quienes REALMENTE pueden leer
-- el hilo, para que mencionar a alguien no sea una forma de contarle que existe.
create or replace function public.escribir_en_hilo(
  p_ambito    text,
  p_ancla     uuid,
  p_cuerpo    text,
  p_menciones uuid[] default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_hilo   uuid;
  v_cuerpo text := nullif(btrim(coalesce(p_cuerpo, '')), '');
  v_sello  text;
  v_msg    uuid;
  v_pii    text[];
  v_enlace text;
  v_titulo text;
  v_amb    text;
  v_ancla  uuid;
begin
  if v_cuerpo is null then
    raise exception 'El mensaje está vacío.' using errcode = '22023';
  end if;
  if length(v_cuerpo) > 4000 then
    raise exception 'El mensaje es demasiado largo (máximo 4000 caracteres).' using errcode = '22023';
  end if;

  v_hilo := public.abrir_hilo(p_ambito, p_ancla);
  if not public.puede_escribir_hilo(v_hilo) then
    raise exception 'No puedes escribir en esta conversación.' using errcode = '42501';
  end if;

  select coalesce(nullif(btrim(p.nombre_completo), ''), 'Alguien') into v_sello
    from public.perfiles p where p.id = auth.uid();
  v_sello := coalesce(v_sello, 'Alguien');
  v_pii := public.detectar_datos_sensibles(v_cuerpo);

  perform set_config('app.hilo_ok', '1', true);

  insert into public.hilo_mensajes (hilo_id, autor_id, autor_sello, cuerpo, pii_alerta)
  values (v_hilo, auth.uid(), v_sello, v_cuerpo, v_pii)
  returning id into v_msg;

  update public.hilos
     set ultimo_mensaje_en = now(),
         mensajes_n        = mensajes_n + 1
   where id = v_hilo;

  -- Quien escribe queda al día consigo mismo.
  insert into public.hilo_participantes (hilo_id, perfil_id, leido_hasta)
  values (v_hilo, auth.uid(), now())
  on conflict (hilo_id, perfil_id) do update set leido_hasta = excluded.leido_hasta;

  -- Menciones: solo a quien puede leer el hilo de verdad.
  if p_menciones is not null and array_length(p_menciones, 1) > 0 then
    insert into public.hilo_menciones (mensaje_id, perfil_id)
    select v_msg, u.pid
      from (select distinct unnest(p_menciones) as pid) u
     where u.pid is not null
       and u.pid <> auth.uid()
       and exists (select 1 from public.perfiles p where p.id = u.pid)
    on conflict do nothing;
  end if;

  perform set_config('app.hilo_ok', '', true);

  -- Aviso SOLO a quien fue mencionado explícitamente. Nada de notificar cada mensaje a
  -- todo el hilo: eso convierte la campana en ruido y la gente deja de mirarla.
  select h.ambito, h.ancla_id into v_amb, v_ancla from public.hilos h where h.id = v_hilo;
  v_enlace := case v_amb
    when 'caso'   then '/casos/'   || v_ancla
    when 'insumo' then '/insumos/' || v_ancla
    when 'tarea'  then '/tareas/'  || v_ancla
    when 'grupo'  then '/grupos/'  || v_ancla
  end;
  v_titulo := case v_amb
    when 'caso'   then 'Te mencionaron en una solicitud'
    when 'insumo' then 'Te mencionaron en una solicitud de insumos'
    when 'tarea'  then 'Te mencionaron en una tarea'
    when 'grupo'  then 'Te mencionaron en tu grupo'
  end;

  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select m.perfil_id, 'mencion', v_titulo,
         v_sello || ': ' || left(v_cuerpo, 140) || case when length(v_cuerpo) > 140 then '…' else '' end,
         v_enlace
    from public.hilo_menciones m
   where m.mensaje_id = v_msg
     -- La comprobación de acceso se hace AQUÍ, con el permiso del destinatario, no del
     -- que escribe: una notificación es una filtración pequeña pero filtración al fin.
     and public.perfil_puede_leer_hilo(m.perfil_id, v_hilo);

  perform public.registrar_auditoria('hilo_mensaje', 'hilos', v_hilo::text,
    jsonb_build_object('mensaje', v_msg, 'ambito', v_amb, 'ancla', v_ancla,
                       'pii', v_pii, 'menciones', coalesce(array_length(p_menciones, 1), 0)));

  return v_msg;
end $$;

revoke all on function public.escribir_en_hilo(text, uuid, text, uuid[]) from public;
grant execute on function public.escribir_en_hilo(text, uuid, text, uuid[]) to authenticated;

-- Editar: solo el autor, y siempre dejando la versión anterior.
create or replace function public.editar_mensaje_hilo(p_mensaje uuid, p_cuerpo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_autor uuid; v_hilo uuid; v_antes text;
  v_cuerpo text := nullif(btrim(coalesce(p_cuerpo, '')), '');
begin
  if v_cuerpo is null then
    raise exception 'El mensaje está vacío. Si querías retirarlo, edítalo y explica por qué.' using errcode = '22023';
  end if;
  if length(v_cuerpo) > 4000 then
    raise exception 'El mensaje es demasiado largo (máximo 4000 caracteres).' using errcode = '22023';
  end if;

  select m.autor_id, m.hilo_id, m.cuerpo into v_autor, v_hilo, v_antes
    from public.hilo_mensajes m where m.id = p_mensaje;
  if v_hilo is null then
    raise exception 'Mensaje no encontrado.' using errcode = 'P0002';
  end if;
  if v_autor is distinct from auth.uid() then
    raise exception 'Solo quien escribió un mensaje puede editarlo.' using errcode = '42501';
  end if;
  if not public.puede_escribir_hilo(v_hilo) then
    raise exception 'No puedes escribir en esta conversación.' using errcode = '42501';
  end if;
  if v_antes = v_cuerpo then return; end if;   -- idempotente

  perform set_config('app.hilo_ok', '1', true);
  insert into public.hilo_versiones (mensaje_id, cuerpo_anterior, editado_por)
  values (p_mensaje, v_antes, auth.uid());
  update public.hilo_mensajes
     set cuerpo     = v_cuerpo,
         pii_alerta = public.detectar_datos_sensibles(v_cuerpo),
         editado_en = now()
   where id = p_mensaje;
  perform set_config('app.hilo_ok', '', true);

  perform public.registrar_auditoria('hilo_mensaje_editado', 'hilos', v_hilo::text,
    jsonb_build_object('mensaje', p_mensaje));
end $$;

revoke all on function public.editar_mensaje_hilo(uuid, text) from public;
grant execute on function public.editar_mensaje_hilo(uuid, text) to authenticated;

create or replace function public.marcar_hilo_leido(p_hilo uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.puede_leer_hilo(p_hilo) then return; end if;   -- silencioso: no filtra existencia
  perform set_config('app.hilo_ok', '1', true);
  insert into public.hilo_participantes (hilo_id, perfil_id, leido_hasta)
  values (p_hilo, auth.uid(), now())
  on conflict (hilo_id, perfil_id) do update set leido_hasta = now();
  perform set_config('app.hilo_ok', '', true);
end $$;

revoke all on function public.marcar_hilo_leido(uuid) from public;
grant execute on function public.marcar_hilo_leido(uuid) to authenticated;

-- ═══ (7) Comprobar el acceso de OTRA persona (para avisos) ═══
-- `puede_leer_hilo()` responde por quien llama. Para decidir a quién notificar hace falta
-- responder por un tercero, y los helpers del repo leen todos de auth.uid(). Se resuelve
-- consultando los datos del destinatario en vez de suplantarlo: es menos elegante que
-- reusar los helpers, pero suplantar dentro de un SECURITY DEFINER es exactamente la
-- clase de atajo que acaba en fuga.
create or replace function public.perfil_puede_leer_hilo(p_perfil uuid, p_hilo uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_amb text; v_ancla uuid; v_verificado boolean;
begin
  if p_perfil is null or p_hilo is null then return false; end if;
  select p.verificado into v_verificado from public.perfiles p where p.id = p_perfil;
  if not coalesce(v_verificado, false) then return false; end if;

  select h.ambito, h.ancla_id into v_amb, v_ancla from public.hilos h where h.id = p_hilo;
  if v_amb is null then return false; end if;

  if v_amb = 'grupo' then
    return exists (select 1 from public.miembros_grupo mg
                    where mg.grupo_id = v_ancla and mg.perfil_id = p_perfil)
        or exists (select 1 from public.grupos g where g.id = v_ancla and g.lider_id = p_perfil)
        or exists (select 1 from public.perfiles p where p.id = p_perfil and (p.rol = 'admin' or p.super_admin));
  elsif v_amb = 'tarea' then
    return exists (select 1 from public.tareas t
                    where t.id = v_ancla
                      and (t.asignado_a = p_perfil or t.creado_por = p_perfil
                           or (t.grupo_id is not null and exists (
                                 select 1 from public.miembros_grupo mg
                                  where mg.grupo_id = t.grupo_id and mg.perfil_id = p_perfil))))
        or exists (select 1 from public.tarea_personas tp where tp.tarea_id = v_ancla and tp.perfil_id = p_perfil)
        or exists (select 1 from public.perfiles p where p.id = p_perfil and (p.rol = 'admin' or p.super_admin));
  end if;

  -- 'caso' e 'insumo': el predicado de casos_select depende de una decena de helpers que
  -- leen auth.uid(). Reproducirlo por perfil sería duplicar 0180 y quedaría desfasado al
  -- primer cambio. Se resuelve por el lado seguro: solo se avisa a quien YA participa del
  -- hilo (entró y por tanto pasó por puede_leer_hilo) o a administración.
  return exists (select 1 from public.hilo_participantes hp
                  where hp.hilo_id = p_hilo and hp.perfil_id = p_perfil)
      or exists (select 1 from public.perfiles p where p.id = p_perfil and (p.rol = 'admin' or p.super_admin));
end $$;

revoke all on function public.perfil_puede_leer_hilo(uuid, uuid) from public;
grant execute on function public.perfil_puede_leer_hilo(uuid, uuid) to authenticated;

comment on function public.perfil_puede_leer_hilo(uuid, uuid) is
  'Responde «¿puede ESTA persona leer este hilo?» para decidir a quién avisar (0231). En caso y derivación NO reproduce el predicado de casos_select —duplicarlo quedaría desfasado al primer cambio de 0180— y se queda del lado seguro: solo avisa a quien ya participa del hilo o a administración. Consecuencia aceptada: mencionar a alguien que aún no ha entrado al hilo de un caso no le genera notificación.';

-- ═══ (8) Derecho de supresión ═══
-- Dar de baja una cuenta NO debe destruir el registro (autor_id es SET NULL y el sello
-- congela el nombre). Esta es la vía lícita y deja asiento: sustituye el nombre por una
-- etiqueta neutra en todos sus mensajes, sin tocar el contenido ni el orden.
create or replace function public.anonimizar_autoria_hilos(p_perfil uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer := 0;
begin
  if not public.es_admin() then
    raise exception 'Solo administración puede anonimizar la autoría de un registro.' using errcode = '42501';
  end if;
  if p_perfil is null then return 0; end if;

  perform set_config('app.hilo_ok', '1', true);
  update public.hilo_mensajes
     set autor_id = null, autor_sello = 'Cuenta dada de baja'
   where autor_id = p_perfil;
  get diagnostics v_n = row_count;
  perform set_config('app.hilo_ok', '', true);

  perform public.registrar_auditoria('hilo_autoria_anonimizada', 'perfil', p_perfil::text,
    jsonb_build_object('mensajes', v_n));
  return v_n;
end $$;

revoke all on function public.anonimizar_autoria_hilos(uuid) from public;
grant execute on function public.anonimizar_autoria_hilos(uuid) to authenticated;

-- ═══ (9) Bandeja: los hilos con actividad que yo puedo leer ═══
-- Vista con security_invoker = true: corre con los permisos de quien consulta, así que
-- la RLS de `hilos` y `hilo_mensajes` se aplica tal cual. Es lo contrario de
-- `casos_difusion` (0180), que necesita saltarse la RLS; aquí no hace falta y por tanto
-- no se hace.
drop view if exists public.hilos_bandeja;
create view public.hilos_bandeja
  with (security_invoker = true) as
  select
    h.id, h.ambito, h.ancla_id, h.ultimo_mensaje_en, h.mensajes_n,
    hp.leido_hasta,
    (select count(*) from public.hilo_mensajes m
      where m.hilo_id = h.id
        and (hp.leido_hasta is null or m.creado_en > hp.leido_hasta)
        and m.autor_id is distinct from auth.uid()) as sin_leer,
    (select m.autor_sello from public.hilo_mensajes m
      where m.hilo_id = h.id order by m.creado_en desc limit 1) as ultimo_autor,
    (select left(m.cuerpo, 160) from public.hilo_mensajes m
      where m.hilo_id = h.id order by m.creado_en desc limit 1) as ultimo_cuerpo
  from public.hilos h
  left join public.hilo_participantes hp
         on hp.hilo_id = h.id and hp.perfil_id = auth.uid()
  where h.ultimo_mensaje_en is not null;

grant select on public.hilos_bandeja to authenticated;

comment on view public.hilos_bandeja is
  'Bandeja de conversaciones (0231). security_invoker = true a propósito: no necesita saltarse la RLS, así que hereda la de hilos/hilo_mensajes y no puede desviarse de ella.';

-- ═══ (10) Realtime ═══
-- Se publica `hilo_mensajes` y no una tabla-señal. La razón por la que 0181 usó señal
-- —Realtime entrega la fila completa y `casos` lleva contacto interno— aquí no aplica:
-- la RLS de esta tabla es exactamente «puede leer este hilo», así que la fila que viaja
-- es justo lo que el suscriptor tiene derecho a ver. Publicar una señal obligaría a un
-- viaje extra al servidor por cada mensaje.
do $$ begin
  alter publication supabase_realtime add table public.hilo_mensajes;
exception when duplicate_object then null; end $$;

-- ═══ (11) Espejo en la app ═══
-- Los ámbitos y sus rutas viven también en apps/web/lib/constantes.ts (AMBITOS_HILO).
-- La base es la fuente de verdad; la app solo decide qué pinta.
