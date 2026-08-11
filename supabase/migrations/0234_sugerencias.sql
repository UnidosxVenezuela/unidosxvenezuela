-- ============================================================
-- 0234 — Reportar un problema o proponer una idea (retroalimentación)
-- ------------------------------------------------------------
-- PROBLEMA: la plataforma no tiene forma de recibir lo que el equipo ve mientras la usa.
--   Un fallo se cuenta por WhatsApp a quien esté despierto, y una idea buena se pierde en
--   un grupo de 200 mensajes. No queda registro, nadie sabe si se leyó y no hay manera de
--   priorizar: exactamente el mismo agujero que este repositorio lleva cerrando en las
--   demás áreas.
--
-- AHORA: `public.sugerencias`. Cualquiera reporta desde donde esté —la ruta se guarda
--   sola, que es la mitad del trabajo de reproducir un fallo— y SOLO administración lo
--   lee, con su estado y su nota de respuesta.
--
-- QUIÉN LEE QUÉ, y por qué:
--   · Administración: todo. Es el buzón.
--   · Quien reporta: LO SUYO, con el estado y la nota. Sin esto, reportar sería gritar a
--     un pozo: la persona no sabría si llegó, si se leyó o qué se decidió, y a la tercera
--     deja de reportar. Es la diferencia entre un buzón y un formulario de trámite.
--   · Nadie más: ni siquiera otro voluntario ve lo que reportó un compañero. Un reporte
--     puede describir un fallo de seguridad, o nombrar a alguien.
--
-- ESCRITURA: solo por RPC (molde `casos_verificacion_campo` 0172). La tabla publica
--   ÚNICAMENTE policy de SELECT, así que con RLS activa no hay INSERT ni UPDATE posible
--   por otra vía.
--
-- ANTI-INUNDACIÓN: 5 envíos por hora y persona, comprobados dentro de la RPC. No es
--   contra un atacante —para eso está la RLS— sino contra el botón pulsado sin querer
--   veinte veces y contra el desahogo en cadena a las tres de la mañana, que ahogaría el
--   buzón justo cuando más falta hace leerlo.
--
-- AVISO: se notifica a administración en el momento, sin trigger. Un buzón que nadie
--   mira no es retroalimentación, es un archivo.
--
-- ENUM-SAFETY: `tipo` y `estado` son TEXT + CHECK (precedentes `casos_derivaciones.area`
--   0177, `punto_tipo` 0145, `casos_items.estado` 0218, `casos.pais` 0230). Añadir un
--   estado en el futuro será drop/add constraint, no un valor de enum nuevo.
--
-- Idempotente. Ejecutar tras 0233.
-- ============================================================

-- ═══ (1) La tabla ═══
create table if not exists public.sugerencias (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null check (tipo in ('problema','idea')),
  mensaje      text not null,
  ruta         text,
  autor_id     uuid references public.perfiles(id) on delete set null,
  autor_sello  text not null,
  estado       text not null default 'nueva'
               check (estado in ('nueva','en_revision','aceptada','descartada','resuelta')),
  nota_admin   text,
  atendida_por uuid references public.perfiles(id) on delete set null,
  atendida_en  timestamptz,
  creado_en    timestamptz not null default now()
);
create index if not exists idx_sugerencias_estado on public.sugerencias (estado, creado_en desc);
create index if not exists idx_sugerencias_autor  on public.sugerencias (autor_id, creado_en desc);

comment on table public.sugerencias is
  'Buzón de problemas e ideas del equipo (0234). Lo lee administración; quien reporta ve lo suyo con el estado y la respuesta, para que reportar no sea gritar a un pozo. Escritura solo por enviar_sugerencia() / atender_sugerencia().';
comment on column public.sugerencias.ruta is
  'Dónde estaba la persona al reportar. Se guarda sola: es la mitad del trabajo de reproducir un fallo.';
comment on column public.sugerencias.autor_sello is
  'Nombre congelado. autor_id es ON DELETE SET NULL —nunca cascade— para que dar de baja una cuenta no borre de quién venía el reporte.';

-- ═══ (2) RLS ═══
alter table public.sugerencias enable row level security;

drop policy if exists sug_select on public.sugerencias;
create policy sug_select on public.sugerencias for select to authenticated
  using (public.es_admin() or autor_id = auth.uid());

-- Sin policy de INSERT/UPDATE/DELETE a propósito (molde 0172).
drop policy if exists sug_insert on public.sugerencias;
drop policy if exists sug_update on public.sugerencias;
drop policy if exists sug_delete on public.sugerencias;

grant select on public.sugerencias to authenticated;

-- ═══ (3) Enviar ═══
create or replace function public.enviar_sugerencia(
  p_tipo    text,
  p_mensaje text,
  p_ruta    text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tipo  text := lower(nullif(btrim(coalesce(p_tipo, '')), ''));
  v_msg   text := nullif(btrim(coalesce(p_mensaje, '')), '');
  v_ruta  text := nullif(btrim(coalesce(p_ruta, '')), '');
  v_sello text;
  v_n     int;
  v_id    uuid;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;
  -- Basta con estar verificado. El observador TAMBIÉN reporta: es de solo lectura para el
  -- trabajo, no para decir que algo está roto — y suele ser quien más lo ve.
  if not public.es_verificado() then
    raise exception 'Tu cuenta todavía no está verificada.' using errcode = '42501';
  end if;
  if v_tipo not in ('problema','idea') then
    raise exception 'Indica si es un problema o una idea.' using errcode = '22023';
  end if;
  if v_msg is null then
    raise exception 'Cuéntanos qué pasó o qué se te ocurre.' using errcode = '22023';
  end if;

  select count(*) into v_n from public.sugerencias
   where autor_id = auth.uid() and creado_en > now() - interval '1 hour';
  if v_n >= 5 then
    raise exception 'Has enviado varios reportes en la última hora. Espera un rato y sigue contándonos.'
      using errcode = '23514';
  end if;

  select coalesce(nullif(btrim(p.nombre_completo), ''), 'Alguien') into v_sello
    from public.perfiles p where p.id = auth.uid();

  insert into public.sugerencias (tipo, mensaje, ruta, autor_id, autor_sello)
  values (v_tipo, left(v_msg, 2000), left(v_ruta, 300), auth.uid(), coalesce(v_sello, 'Alguien'))
  returning id into v_id;

  -- Aviso inmediato a administración: un buzón que nadie mira no es retroalimentación.
  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select p.id, 'sugerencia',
         case when v_tipo = 'problema' then 'Reportaron un problema' else 'Nueva idea del equipo' end,
         coalesce(v_sello, 'Alguien') || ': ' || left(v_msg, 140)
           || case when length(v_msg) > 140 then '…' else '' end,
         '/admin/sugerencias'
    from public.perfiles p
   where p.rol = 'admin'::public.rol_usuario or p.super_admin;

  perform public.registrar_auditoria('sugerencia_enviada', 'sugerencias', v_id::text,
    jsonb_build_object('tipo', v_tipo, 'ruta', v_ruta));
  return v_id;
end $$;

revoke all on function public.enviar_sugerencia(text, text, text) from public;
grant execute on function public.enviar_sugerencia(text, text, text) to authenticated;

-- ═══ (4) Atender ═══
-- Cambia el estado y deja una nota que VE QUIEN REPORTÓ. Es la vuelta del circuito: sin
-- ella, el buzón se llena y nadie sabe qué pasó con lo suyo.
create or replace function public.atender_sugerencia(
  p_id     uuid,
  p_estado text,
  p_nota   text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_estado text := lower(nullif(btrim(coalesce(p_estado, '')), ''));
  v_nota   text := nullif(btrim(coalesce(p_nota, '')), '');
  v_autor  uuid;
  v_tipo   text;
begin
  if not public.es_admin() then
    raise exception 'Solo administración atiende el buzón.' using errcode = '42501';
  end if;
  if v_estado not in ('nueva','en_revision','aceptada','descartada','resuelta') then
    raise exception 'Estado no válido: %', v_estado using errcode = '22023';
  end if;

  select s.autor_id, s.tipo into v_autor, v_tipo from public.sugerencias s where s.id = p_id;
  if v_tipo is null then
    raise exception 'Reporte no encontrado.' using errcode = 'P0002';
  end if;

  update public.sugerencias
     set estado       = v_estado,
         nota_admin   = coalesce(left(v_nota, 1000), nota_admin),
         atendida_por = auth.uid(),
         atendida_en  = now()
   where id = p_id;

  -- Se avisa a quien reportó, salvo que sea quien está atendiendo.
  if v_autor is not null and v_autor <> auth.uid() then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    values (v_autor, 'sugerencia',
            case v_estado
              when 'aceptada'   then 'Tu propuesta se va a hacer'
              when 'resuelta'   then 'Lo que reportaste ya está arreglado'
              when 'descartada' then 'Respondimos a lo que reportaste'
              when 'en_revision' then 'Estamos viendo lo que reportaste'
              else 'Novedad sobre lo que reportaste' end,
            coalesce(v_nota, 'Gracias por avisar.'),
            '/sugerencias');
  end if;

  perform public.registrar_auditoria('sugerencia_atendida', 'sugerencias', p_id::text,
    jsonb_build_object('estado', v_estado, 'con_nota', v_nota is not null));
end $$;

revoke all on function public.atender_sugerencia(uuid, text, text) from public;
grant execute on function public.atender_sugerencia(uuid, text, text) to authenticated;
