-- ============================================================
-- 0238 — Queda registro de los avisos que se mandan a toda la organización
-- ------------------------------------------------------------
-- LO QUE YA HABÍA: administración puede enviar un aviso a todas las cuentas verificadas
--   —o a los grupos que elija— desde /notificaciones. Funciona desde hace tiempo, con
--   imagen, enlace, push y Telegram. Esta migración NO lo reemplaza.
--
-- LO QUE FALTABA, y es lo que arregla:
--
--   1. NO QUEDABA REGISTRO. Es la acción de más alcance de toda la plataforma —le llega
--      a cada persona de la organización— y era la única que no dejaba rastro. Cada
--      destinatario recibía su copia y ya: nadie podía responder «¿se mandó el aviso del
--      viernes?», «¿quién lo mandó?» ni «¿a cuánta gente llegó?». Todo lo demás en este
--      repositorio se audita; esto no.
--
--   2. NO HABÍA NADA CONTRA EL DOBLE ENVÍO. Dos clics en «Enviar aviso» —o un formulario
--      reenviado al recargar— y toda la organización recibe el mismo mensaje dos veces.
--      En una plataforma donde la campana ya compite por atención, eso enseña a ignorarla.
--
-- CÓMO: `avisos_enviados` guarda qué se mandó, quién lo mandó y a cuánta gente llegó. La
--   RPC se llama ANTES del abanico: si rechaza, no se envió nada. Es a propósito — un
--   aviso que ya salió no se puede recoger, así que la comprobación va delante.
--
-- ANTI-DUPLICADO: mismo título y mismo cuerpo en los últimos 10 minutos, se rechaza. Ese
--   es el caso real (el doble clic), no el malicioso.
--
-- LÍMITE POR HORA, y GLOBAL y no por persona: cinco avisos generales en una hora ya son
--   demasiados vengan de quien vengan, y dos administradores mandando tres cada uno hacen
--   seis. Lo que hay que proteger es la atención de la organización, no la cuota de nadie.
--
-- ESCRITURA solo por RPC (molde `casos_verificacion_campo` 0172, igual que 0234): la tabla
--   publica ÚNICAMENTE policy de SELECT.
--
-- QUIÉN LO LEE: administración. El aviso en sí lo recibe todo el mundo; el historial de
--   quién mandó qué es gobierno interno, como el buzón de 0234.
--
-- ENUM-SAFETY: `destino` es TEXT + CHECK (precedentes 0177, 0145, 0218, 0230, 0234).
--
-- Idempotente. Ejecutar tras 0237.
-- ============================================================

-- ═══ (1) Tabla ═══
create table if not exists public.avisos_enviados (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null,
  cuerpo         text,
  enlace         text,
  imagen_url     text,
  destino        text not null default 'todos' check (destino in ('todos','grupos')),
  grupos         uuid[],
  destinatarios  integer not null default 0,
  autor_id       uuid references public.perfiles(id) on delete set null,
  autor_sello    text not null,
  creado_en      timestamptz not null default now()
);
create index if not exists idx_avisos_enviados_fecha on public.avisos_enviados (creado_en desc);

comment on table public.avisos_enviados is
  'Registro de los avisos enviados por administración a toda la organización o a grupos concretos (0238). El aviso lo recibe todo el mundo; este historial lo lee administración. Escritura solo por registrar_aviso_enviado().';
comment on column public.avisos_enviados.destinatarios is
  'A cuánta gente se le insertó la notificación. Se calcula ANTES del abanico, así que un 0 significa que el envío se quedó a medias y conviene mirarlo.';
comment on column public.avisos_enviados.autor_sello is
  'Nombre congelado. autor_id es ON DELETE SET NULL —nunca cascade— para que dar de baja una cuenta no borre de quién salió el aviso.';

-- ═══ (2) RLS ═══
alter table public.avisos_enviados enable row level security;

drop policy if exists avisos_env_select on public.avisos_enviados;
create policy avisos_env_select on public.avisos_enviados for select to authenticated
  using (public.es_admin());

-- Sin policy de INSERT/UPDATE/DELETE a propósito (molde 0172).
drop policy if exists avisos_env_insert on public.avisos_enviados;
drop policy if exists avisos_env_update on public.avisos_enviados;
drop policy if exists avisos_env_delete on public.avisos_enviados;

grant select on public.avisos_enviados to authenticated;

-- ═══ (3) Registrar (y frenar el duplicado) ═══
-- Se llama ANTES de repartir las notificaciones: si esto levanta una excepción, no salió
-- nada. Al revés no serviría de nada, porque un aviso enviado no se puede recoger.
drop function if exists public.registrar_aviso_enviado(text, text, text, text, text, uuid[], integer);
create function public.registrar_aviso_enviado(
  p_titulo        text,
  p_cuerpo        text default null,
  p_enlace        text default null,
  p_imagen        text default null,
  p_destino       text default 'todos',
  p_grupos        uuid[] default null,
  p_destinatarios integer default 0
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_titulo  text := nullif(btrim(coalesce(p_titulo, '')), '');
  v_cuerpo  text := nullif(btrim(coalesce(p_cuerpo, '')), '');
  v_destino text := lower(nullif(btrim(coalesce(p_destino, '')), ''));
  v_sello   text;
  v_n       int;
  v_id      uuid;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;
  if not public.es_admin() then
    raise exception 'Solo administración envía avisos generales.' using errcode = '42501';
  end if;
  if v_titulo is null then
    raise exception 'El aviso necesita un título.' using errcode = '22023';
  end if;
  if v_destino not in ('todos','grupos') then
    raise exception 'Destino no válido.' using errcode = '22023';
  end if;

  -- El doble clic, que es el caso real. Mismo título y mismo cuerpo en 10 minutos.
  select count(*) into v_n from public.avisos_enviados a
   where a.titulo = left(v_titulo, 200)
     and coalesce(a.cuerpo, '') = coalesce(left(v_cuerpo, 2000), '')
     and a.creado_en > now() - interval '10 minutes';
  if v_n > 0 then
    raise exception 'Ese mismo aviso se envió hace un momento. Si de verdad quieres repetirlo, espera diez minutos o cámbiale algo.'
      using errcode = '23514';
  end if;

  -- Límite GLOBAL, no por persona: lo que se protege es la atención de la organización.
  select count(*) into v_n from public.avisos_enviados a
   where a.creado_en > now() - interval '1 hour';
  if v_n >= 5 then
    raise exception 'Ya salieron cinco avisos generales en la última hora. Espera un rato: la campana deja de leerse si suena de más.'
      using errcode = '23514';
  end if;

  select coalesce(nullif(btrim(p.nombre_completo), ''), 'Administración') into v_sello
    from public.perfiles p where p.id = auth.uid();

  insert into public.avisos_enviados
    (titulo, cuerpo, enlace, imagen_url, destino, grupos, destinatarios, autor_id, autor_sello)
  values (
    left(v_titulo, 200), left(v_cuerpo, 2000), left(nullif(btrim(coalesce(p_enlace, '')), ''), 500),
    left(nullif(btrim(coalesce(p_imagen, '')), ''), 1000),
    v_destino, p_grupos, greatest(coalesce(p_destinatarios, 0), 0),
    auth.uid(), coalesce(v_sello, 'Administración')
  ) returning id into v_id;

  perform public.registrar_auditoria('aviso_general_enviado', 'avisos_enviados', v_id::text,
    jsonb_build_object('destino', v_destino, 'destinatarios', coalesce(p_destinatarios, 0),
                       'con_imagen', p_imagen is not null));
  return v_id;
end $$;

revoke all on function public.registrar_aviso_enviado(text, text, text, text, text, uuid[], integer) from public;
grant execute on function public.registrar_aviso_enviado(text, text, text, text, text, uuid[], integer) to authenticated;
