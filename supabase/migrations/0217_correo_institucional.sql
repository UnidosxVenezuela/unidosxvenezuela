-- ============================================================
-- 0217 — Correo institucional: plantillas y registro de envíos
-- ------------------------------------------------------------
-- ANTES: la plataforma enviaba correo con un helper de 29 líneas
--   (`apps/web/lib/email.ts`) que NO devolvía nada y que empezaba con
--   `if (!API_KEY) return;` — es decir, sin la clave de Resend el envío se daba por
--   bueno en SILENCIO. No quedaba constancia de NADA: ni de a quién se escribió, ni
--   con qué texto, ni de si el proveedor lo aceptó o lo rechazó. Alianzas
--   Estratégicas, que es quien escribe a empresas, fundaciones y proveedores, no
--   tenía ni plantillas ni bitácora: cada persona redactaba su propio correo.
--   La auditoría tampoco servía de red: `registrar_auditoria` (0130) hace
--   `if not public.es_verificado() then return; end if;` — también falla en silencio.
--
-- AHORA: dos tablas propias.
--   · `correo_plantillas` — el texto institucional aprobado, con variables
--     {{nombre}}, {{organizacion}}… Se siembran cuatro plantillas de Alianzas
--     (presentación, solicitud de donación, agradecimiento y seguimiento).
--   · `correo_envios` — el REGISTRO. Cada correo nace con folio y estado
--     'pendiente' ANTES de intentar el envío, y luego se le escribe el resultado
--     ('enviado' / 'fallido' / 'no_configurado'). Así un fallo del proveedor —o de
--     la propia aplicación— nunca puede perder la constancia de que se intentó.
--
-- PRIVACIDAD — el cuerpo renderizado NO se guarda. Se guardan `plantilla_id` +
--   `variables`, y las variables pasan por `correo_variables_publicas()`, que
--   descarta cualquier clave que huela a secreto. El motivo es concreto: el
--   call-site de `apps/web/app/(app)/admin/usuarios/actions.ts` (importación por
--   lote) mete la CONTRASEÑA TEMPORAL en claro dentro del HTML. Guardar el cuerpo
--   sería guardar contraseñas.
--
-- CORREOS INTERNOS DE WHATSAPP: las cuentas creadas con número (no con correo)
--   tienen un correo interno determinístico `wa<dígitos>@wa.unidosxvnezuela.com`
--   (`apps/web/lib/whatsapp.ts`). Ahí NUNCA se envía nada; el registro lo rechaza
--   de plano, además del filtro de la aplicación.
--
-- RLS: las dos tablas son de SOLO LECTURA para la sesión (una única policy de
--   SELECT cada una). NO hay policy de INSERT, UPDATE ni DELETE: es deliberado —
--   con RLS activada, lo que no tiene policy queda denegado, y toda la escritura
--   pasa por las tres RPC SECURITY DEFINER de abajo, que llevan su propio gate.
--   Mismo molde que `certificados` (0215), `ajustes_app` (0188) y
--   `casos_verificacion_campo` (0172).
--
-- ENUM-SAFETY: esta migración NO crea ni añade ningún valor de enum. `estado` y
--   `entidad` son TEXT + CHECK (precedentes: `casos_derivaciones.area` en 0177,
--   `tipo_difusion` en 0189). Ampliarlos mañana es un `drop constraint` + `add`.
--
-- Idempotente. Ejecutar tras 0216.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- (A) Plantillas de correo
-- ════════════════════════════════════════════════════════════
create table if not exists public.correo_plantillas (
  id              uuid primary key default gen_random_uuid(),
  clave           text not null unique,
  nombre          text not null,
  asunto          text not null,
  cuerpo_html     text not null,
  variables       text[] not null default '{}',
  area            text,
  activa          boolean not null default true,
  creado_por      uuid references public.perfiles (id) on delete set null,
  actualizado_por uuid references public.perfiles (id) on delete set null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists idx_correo_plantillas_activa on public.correo_plantillas (activa, nombre);

comment on table public.correo_plantillas is
  'Plantillas de correo institucional (0217). El cuerpo admite variables {{nombre}}, {{organizacion}}… que se sustituyen al redactar. Lectura: cualquier cuenta verificada; escritura SOLO por guardar_plantilla_correo().';

alter table public.correo_plantillas enable row level security;

-- Lectura para cualquier cuenta verificada: el texto institucional no es sensible y
-- otras áreas pueden querer consultarlo (mismo criterio que `solins_lectura`, 0050).
drop policy if exists corplant_select on public.correo_plantillas;
create policy corplant_select on public.correo_plantillas for select to authenticated
  using (public.es_verificado());

-- Sin policy de INSERT/UPDATE/DELETE a propósito: ver la cabecera.

-- ════════════════════════════════════════════════════════════
-- (B) Registro de envíos
-- ════════════════════════════════════════════════════════════
create sequence if not exists public.correo_folio_seq;

create table if not exists public.correo_envios (
  id                   uuid primary key default gen_random_uuid(),
  folio                text not null unique,
  plantilla_id         uuid references public.correo_plantillas (id) on delete set null,
  destinatario_email   text not null,
  destinatario_nombre  text,
  -- Seguimiento: de QUÉ cuelga este correo. `entidad`/`entidad_id` es el par genérico
  -- (sirve para lo que aún no tiene tabla); las tres FK son el enlace fuerte cuando el
  -- destino sí existe como fila. Todas opcionales: un correo suelto es válido.
  entidad              text check (entidad is null or entidad in
                         ('caso','oportunidad','proveedor','afiliado','solicitud','perfil','otra')),
  entidad_id           text,
  oportunidad_id       uuid references public.oportunidades (id) on delete set null,
  proveedor_id         uuid references public.proveedores (id) on delete set null,
  caso_id              uuid references public.casos (id) on delete set null,
  asunto               text,
  -- Variables NO sensibles con las que se renderizó. El cuerpo renderizado NUNCA
  -- se guarda (ver cabecera): se reconstruye con plantilla_id + variables.
  variables            jsonb not null default '{}'::jsonb,
  estado               text not null default 'pendiente'
                       check (estado in ('pendiente','enviado','fallido','no_configurado')),
  proveedor_mensaje_id text,
  error                text,
  enviado_por          uuid references public.perfiles (id) on delete set null,
  enviado_en           timestamptz,
  creado_en            timestamptz not null default now()
);
create index if not exists idx_correo_envios_creado on public.correo_envios (creado_en desc);
create index if not exists idx_correo_envios_estado on public.correo_envios (estado, creado_en desc);
create index if not exists idx_correo_envios_oportunidad on public.correo_envios (oportunidad_id) where oportunidad_id is not null;
create index if not exists idx_correo_envios_proveedor   on public.correo_envios (proveedor_id)   where proveedor_id   is not null;
create index if not exists idx_correo_envios_caso        on public.correo_envios (caso_id)        where caso_id        is not null;

comment on table public.correo_envios is
  'Registro de correos institucionales (0217). La fila se crea ANTES de enviar, en estado «pendiente», y se cierra con marcar_envio_correo(). NO guarda el cuerpo renderizado: solo plantilla_id + variables no sensibles (hay un envío que lleva contraseñas temporales en claro).';

alter table public.correo_envios enable row level security;

-- Lectura: administración y el departamento de Alianzas Estratégicas (0216). Es una
-- bitácora de contactos externos, no un dato de todo el mundo.
drop policy if exists corenv_select on public.correo_envios;
create policy corenv_select on public.correo_envios for select to authenticated
  using (public.es_admin() or public.puede_alianzas());

-- Sin policy de INSERT/UPDATE/DELETE a propósito: ver la cabecera. Un envío no se
-- borra ni se edita — es la constancia de que se escribió.

-- ════════════════════════════════════════════════════════════
-- (C) Saneado de las variables que SÍ se guardan
-- ════════════════════════════════════════════════════════════
-- Descarta cualquier clave que parezca un secreto (contraseña, clave, token, PIN…)
-- y recorta los valores largos. Es la última barrera: aunque la aplicación mande de
-- más, la base no lo persiste. `plpgsql` por doctrina del repo (cuerpo late-bound).
create or replace function public.correo_variables_publicas(p_variables jsonb)
returns jsonb language plpgsql immutable as $$
declare v_out jsonb := '{}'::jsonb; k text; v jsonb; n int := 0;
begin
  if p_variables is null or jsonb_typeof(p_variables) <> 'object' then
    return '{}'::jsonb;
  end if;
  for k, v in select * from jsonb_each(p_variables) loop
    exit when n >= 40;                       -- tope defensivo de claves
    if k ~* '(contrase|password|passwd|clave|token|secret|api[_-]?key|otp|pin|codigo_verif)' then
      continue;                              -- secreto: no se guarda
    end if;
    if jsonb_typeof(v) = 'string' then
      v_out := v_out || jsonb_build_object(k, left(v #>> '{}', 200));
    elsif jsonb_typeof(v) in ('number','boolean') then
      v_out := v_out || jsonb_build_object(k, v);
    end if;                                  -- objetos/arrays: fuera
    n := n + 1;
  end loop;
  return v_out;
end $$;

comment on function public.correo_variables_publicas(jsonb) is
  'Filtra las variables de un correo antes de guardarlas (0217): descarta claves que parezcan secretos y recorta los valores. Última barrera contra persistir contraseñas temporales.';

-- ════════════════════════════════════════════════════════════
-- (D) Registrar el envío ANTES de enviarlo
-- ════════════════════════════════════════════════════════════
-- Devuelve el id de la fila «pendiente». La aplicación llama a esto PRIMERO, luego
-- intenta el envío, y cierra con marcar_envio_correo(). Si la aplicación se cae en
-- medio, queda la constancia en «pendiente» — que es exactamente lo que se quiere
-- saber: se intentó y no consta el resultado.
create or replace function public.registrar_envio_correo(
  p_destinatario_email  text,
  p_asunto              text,
  p_plantilla           uuid    default null,
  p_destinatario_nombre text    default null,
  p_entidad             text    default null,
  p_entidad_id          text    default null,
  p_variables           jsonb   default '{}'::jsonb,
  p_oportunidad         uuid    default null,
  p_proveedor           uuid    default null,
  p_caso                uuid    default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_email text; v_folio text; v_id uuid; v_entidad text; v_clave text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;
  if not (public.es_admin() or public.puede_alianzas()) then
    raise exception 'Solo Alianzas Estratégicas o administración pueden enviar correo institucional.'
      using errcode = '42501';
  end if;

  v_email := lower(nullif(btrim(coalesce(p_destinatario_email, '')), ''));
  if v_email is null then
    raise exception 'Indica el correo del destinatario.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Ese correo no es válido: %', v_email using errcode = '22023';
  end if;
  -- Correos internos de las cuentas creadas por WhatsApp: no existen fuera de la
  -- plataforma. Escribir ahí es un rebote garantizado (apps/web/lib/whatsapp.ts).
  if v_email like '%@wa.unidosxvnezuela.com' then
    raise exception 'Esa dirección es un correo interno de una cuenta de WhatsApp; no recibe correo. Usa su correo real o escríbele por WhatsApp.'
      using errcode = '22023';
  end if;

  v_entidad := nullif(btrim(coalesce(p_entidad, '')), '');
  -- Coherencia mínima: si vino una FK y no vino `entidad`, se deduce.
  if v_entidad is null then
    v_entidad := case
      when p_oportunidad is not null then 'oportunidad'
      when p_proveedor   is not null then 'proveedor'
      when p_caso        is not null then 'caso'
      else null end;
  end if;

  v_folio := 'COR-' || to_char(now(), 'YYYY') || '-' ||
             lpad(nextval('public.correo_folio_seq')::text, 6, '0');

  insert into public.correo_envios (
    folio, plantilla_id, destinatario_email, destinatario_nombre,
    entidad, entidad_id, oportunidad_id, proveedor_id, caso_id,
    asunto, variables, estado, enviado_por
  ) values (
    v_folio, p_plantilla, v_email, nullif(btrim(coalesce(p_destinatario_nombre, '')), ''),
    v_entidad, nullif(btrim(coalesce(p_entidad_id, '')), ''), p_oportunidad, p_proveedor, p_caso,
    left(nullif(btrim(coalesce(p_asunto, '')), ''), 300),
    public.correo_variables_publicas(p_variables), 'pendiente', auth.uid()
  ) returning id into v_id;

  select clave into v_clave from public.correo_plantillas where id = p_plantilla;

  -- Traza fina en la auditoría. NO se puede depender solo de ella (0130 retorna en
  -- silencio si la cuenta no está verificada): la constancia real es la fila de arriba.
  perform public.registrar_auditoria('correo_registrado', 'correo_envios', v_id::text,
    jsonb_build_object('folio', v_folio, 'plantilla', v_clave, 'entidad', v_entidad));

  return v_id;
end $$;

revoke all on function public.registrar_envio_correo(text, text, uuid, text, text, text, jsonb, uuid, uuid, uuid) from public;
grant execute on function public.registrar_envio_correo(text, text, uuid, text, text, text, jsonb, uuid, uuid, uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
-- (E) Cerrar el envío con su resultado
-- ════════════════════════════════════════════════════════════
-- Solo cierra filas que sigan en «pendiente»: un envío ya resuelto es inmutable.
create or replace function public.marcar_envio_correo(
  p_envio     uuid,
  p_estado    text,
  p_mensaje_id text default null,
  p_error     text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; v_folio text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;
  if not (public.es_admin() or public.puede_alianzas()) then
    raise exception 'No tienes permiso para cerrar un envío de correo.' using errcode = '42501';
  end if;

  v_estado := nullif(btrim(coalesce(p_estado, '')), '');
  if v_estado is null or v_estado not in ('enviado', 'fallido', 'no_configurado') then
    raise exception 'Estado de envío no válido: %', coalesce(p_estado, '(vacío)') using errcode = '22023';
  end if;

  update public.correo_envios
     set estado               = v_estado,
         proveedor_mensaje_id = nullif(btrim(coalesce(p_mensaje_id, '')), ''),
         error                = left(nullif(btrim(coalesce(p_error, '')), ''), 500),
         enviado_en           = case when v_estado = 'enviado' then now() else enviado_en end
   where id = p_envio and estado = 'pendiente'
  returning folio into v_folio;

  if v_folio is null then
    raise exception 'Ese envío no existe o ya tenía resultado.' using errcode = 'P0002';
  end if;

  perform public.registrar_auditoria('correo_' || v_estado, 'correo_envios', p_envio::text,
    jsonb_build_object('folio', v_folio, 'estado', v_estado));
end $$;

revoke all on function public.marcar_envio_correo(uuid, text, text, text) from public;
grant execute on function public.marcar_envio_correo(uuid, text, text, text) to authenticated;

-- ════════════════════════════════════════════════════════════
-- (F) Crear o actualizar una plantilla
-- ════════════════════════════════════════════════════════════
create or replace function public.guardar_plantilla_correo(
  p_clave       text,
  p_nombre      text,
  p_asunto      text,
  p_cuerpo_html text,
  p_variables   text[]  default null,
  p_area        text    default null,
  p_activa      boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_clave text; v_id uuid; v_nueva boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;
  if not (public.es_admin() or public.puede_alianzas()) then
    raise exception 'Solo Alianzas Estratégicas o administración pueden editar las plantillas de correo.'
      using errcode = '42501';
  end if;

  -- Clave de sistema: minúsculas, sin espacios (se usa para referenciarla).
  v_clave := lower(regexp_replace(btrim(coalesce(p_clave, '')), '[^a-zA-Z0-9_]+', '_', 'g'));
  v_clave := nullif(btrim(v_clave, '_'), '');
  if v_clave is null then
    raise exception 'Falta la clave de la plantilla.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Ponle un nombre a la plantilla.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_asunto, '')), '') is null then
    raise exception 'La plantilla necesita un asunto.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_cuerpo_html, '')), '') is null then
    raise exception 'La plantilla necesita un cuerpo.' using errcode = '22023';
  end if;

  v_nueva := not exists (select 1 from public.correo_plantillas where clave = v_clave);

  insert into public.correo_plantillas
    (clave, nombre, asunto, cuerpo_html, variables, area, activa, creado_por, actualizado_por)
  values
    (v_clave, btrim(p_nombre), btrim(p_asunto), p_cuerpo_html,
     coalesce(p_variables, '{}'::text[]), nullif(btrim(coalesce(p_area, '')), ''),
     coalesce(p_activa, true), auth.uid(), auth.uid())
  on conflict (clave) do update
    set nombre          = excluded.nombre,
        asunto          = excluded.asunto,
        cuerpo_html     = excluded.cuerpo_html,
        variables       = excluded.variables,
        area            = excluded.area,
        activa          = excluded.activa,
        actualizado_por = auth.uid(),
        actualizado_en  = now()
  returning id into v_id;

  perform public.registrar_auditoria('plantilla_correo_guardada', 'correo_plantillas', v_id::text,
    jsonb_build_object('clave', v_clave, 'nombre', btrim(p_nombre), 'nueva', v_nueva));

  return v_id;
end $$;

revoke all on function public.guardar_plantilla_correo(text, text, text, text, text[], text, boolean) from public;
grant execute on function public.guardar_plantilla_correo(text, text, text, text, text[], text, boolean) to authenticated;

-- ════════════════════════════════════════════════════════════
-- (G) Siembra: las cuatro plantillas de Alianzas Estratégicas
-- ════════════════════════════════════════════════════════════
-- `do nothing` a propósito: si el equipo ya editó una plantilla, re-ejecutar la
-- migración NO le pisa el texto. Para reponer el original basta borrar la fila (por
-- SQL) y volver a ejecutar, o reescribirla desde la pantalla de plantillas.
insert into public.correo_plantillas (clave, nombre, asunto, cuerpo_html, variables, area) values

('presentacion_organizacion',
 'Presentación de la organización',
 'Presentación de Apoyo por Venezuela — {{organizacion}}',
 '<p>Estimado/a {{nombre}}:</p>
<p>Le escribimos desde <strong>Apoyo por Venezuela</strong>, una organización de voluntariado que coordina la respuesta al terremoto de junio de 2026. Nuestros equipos recopilan las necesidades en terreno, las <strong>verifican una a una</strong> y coordinan la entrega con logística propia y con aliados locales.</p>
<p>Nos dirigimos a <strong>{{organizacion}}</strong> porque creemos que existe una oportunidad concreta de colaboración con impacto directo en las familias afectadas. Podemos aportar el diagnóstico verificado de las necesidades, la trazabilidad de cada entrega y el respaldo documental de lo ejecutado.</p>
<p>Quedamos atentos a la posibilidad de agendar una breve reunión para presentarle nuestro trabajo y las formas de colaboración disponibles.</p>
<p>Agradecemos de antemano su tiempo y su atención.</p>
<p>Cordialmente,<br />{{remitente}}<br />{{cargo}} — Apoyo por Venezuela<br />{{contacto}}</p>',
 array['nombre','organizacion','remitente','cargo','contacto'],
 'alianzas_estrategicas'),

('solicitud_donacion',
 'Solicitud de donación',
 'Solicitud de apoyo para {{necesidad}} — Apoyo por Venezuela',
 '<p>Estimado/a {{nombre}}:</p>
<p>Desde <strong>Apoyo por Venezuela</strong> le escribimos para solicitar el apoyo de <strong>{{organizacion}}</strong> con una necesidad ya verificada por nuestro equipo:</p>
<ul>
  <li><strong>Qué se necesita:</strong> {{necesidad}}</li>
  <li><strong>Cantidad estimada:</strong> {{cantidad}}</li>
  <li><strong>Destino:</strong> {{destino}}</li>
  <li><strong>Fecha en que se requiere:</strong> {{fecha_limite}}</li>
</ul>
<p>El aporte puede hacerse en especie o mediante la compra directa al proveedor que ustedes prefieran. Nuestro equipo de logística se encarga del retiro, el traslado y la entrega, y entrega el <strong>respaldo documental</strong> de lo recibido y de lo distribuido.</p>
<p>Si desean conocer el detalle de la solicitud antes de decidir, con gusto se lo compartimos.</p>
<p>Quedamos atentos a su respuesta. Muchas gracias por considerarlo.</p>
<p>Cordialmente,<br />{{remitente}}<br />Apoyo por Venezuela<br />{{contacto}}</p>',
 array['nombre','organizacion','necesidad','cantidad','destino','fecha_limite','remitente','contacto'],
 'alianzas_estrategicas'),

('agradecimiento_donacion',
 'Agradecimiento por donación recibida',
 'Gracias por su aporte — Apoyo por Venezuela',
 '<p>Estimado/a {{nombre}}:</p>
<p>En nombre de todo el equipo de <strong>Apoyo por Venezuela</strong>, queremos agradecer a <strong>{{organizacion}}</strong> el aporte recibido el {{fecha}}:</p>
<p><strong>{{aporte}}</strong></p>
<p>Su donación fue incorporada a nuestro inventario y destinada a <strong>{{destino}}</strong>. Cada entrega queda registrada en la plataforma con la que coordinamos la respuesta, de modo que podemos darles cuenta de su uso cuando lo necesiten.</p>
<p>Gestos como este son los que sostienen el trabajo en terreno. Gracias por confiar en nosotros.</p>
<p>Con gratitud,<br />{{remitente}}<br />Apoyo por Venezuela<br />{{contacto}}</p>',
 array['nombre','organizacion','aporte','fecha','destino','remitente','contacto'],
 'alianzas_estrategicas'),

('seguimiento_alianza',
 'Seguimiento de alianza',
 'Seguimiento de nuestra conversación — {{organizacion}}',
 '<p>Estimado/a {{nombre}}:</p>
<p>Retomamos contacto para dar seguimiento a la conversación que sostuvimos el {{fecha}} con <strong>{{organizacion}}</strong> sobre <strong>{{tema}}</strong>.</p>
<p>El próximo paso acordado fue: <strong>{{proximo_paso}}</strong>.</p>
<p>Si necesitan información adicional de nuestra parte —cifras del trabajo realizado, necesidades verificadas pendientes o el respaldo de entregas anteriores— con gusto se la hacemos llegar.</p>
<p>Quedamos a la orden.</p>
<p>Cordialmente,<br />{{remitente}}<br />Apoyo por Venezuela<br />{{contacto}}</p>',
 array['nombre','organizacion','tema','proximo_paso','fecha','remitente','contacto'],
 'alianzas_estrategicas')

on conflict (clave) do nothing;
