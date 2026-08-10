-- ============================================================
-- 0232 — El intake sensible sale de `perfiles` (cierre de fuga)
-- ------------------------------------------------------------
-- LA FUGA, tal cual estaba: `public.perfiles` guarda desde 0115 dos columnas de
--   intake del voluntariado —`contacto_emergencia` (texto libre: «Nombre (relación) ·
--   teléfono» de una persona QUE NO ES USUARIA de la plataforma) y `experiencia`— y la
--   cabecera de aquella migración lo dijo con todas las letras:
--
--       «UI limita la vista de `experiencia`/`contacto_emergencia` a administración;
--        si más adelante hace falta, mover a tabla aparte con su propia RLS.»
--
--   Esa limitación era SOLO DE LA INTERFAZ. La policy vigente es `perfiles_lectura`
--   (0018):
--       using (id = auth.uid() or public.es_verificado() or public.es_coordinacion())
--   y la RLS de Postgres filtra FILAS, NO COLUMNAS. Es decir: cualquier cuenta
--   verificada podía pedir `select contacto_emergencia from perfiles` por la API de
--   Supabase y recibir el de TODA la organización — el nombre y el teléfono del familiar
--   de cada voluntario, de personas que nunca aceptaron nada. `/admin/usuarios` además
--   lo exporta en CSV.
--
--   Contradice la doctrina del propio repositorio —«la RLS es la fuente de verdad»— y es
--   exactamente el mismo modo de fallo que 0180 cerró para el contacto de los casos: la
--   app enmascaraba una columna que la base entregaba igual.
--
-- POR QUÉ NO SE ARREGLA CON PRIVILEGIOS DE COLUMNA:
--   `revoke select (contacto_emergencia) on perfiles from authenticated` sería la
--   respuesta de manual y aquí NO sirve, por dos razones:
--     (1) Administración y voluntariado son el MISMO rol de base de datos
--         (`authenticated`); lo que los distingue es la RLS. Revocar la columna se la
--         quitaría también a administración, que sí debe verla.
--     (2) Un `grant all on all tables in schema public to authenticated` —que es
--         exactamente lo que hace el arranque de Supabase y lo que hace el propio
--         workflow de RLS de este repo tras migrar— REPONE el privilegio de todas las
--         columnas y reabre la fuga en silencio. Una protección que un grant rutinario
--         deshace no es una protección.
--   Por eso se mueve el dato a una tabla con RLS PROPIA: un grant general la deja
--   igual de cerrada, porque quien decide sigue siendo la policy.
--
-- AHORA: `public.perfiles_intake`, una tabla hija con RLS de dueño-o-administración, y
--   las dos columnas se RETIRAN de `perfiles`. No se dejan en null «por si acaso»:
--   mientras existan, cualquier ruta de escritura vieja volvería a poblarlas y la fuga
--   volvería sin que nadie se entere. Se comprobó antes de retirarlas que ninguna vista
--   depende de ellas y que ninguna de las seis funciones de trigger de `perfiles`
--   (proteger_campos_perfil, notificar_registro, trg_sincronizar_espacios,
--   sincronizar_grupo_por_rol, auditar_cambio, insig_perfil_verificado) las menciona.
--
--   El mapa de etiquetas de `/admin/logs` conserva sus claves: los asientos de auditoría
--   YA ESCRITOS sobre esas columnas deben seguir leyéndose con su nombre en español.
--
-- ESCRITURA: solo por RPC (molde `casos_verificacion_campo` 0172). Cada quien escribe lo
--   suyo; administración puede escribir el de otro porque el importador de CSV de
--   `/admin/usuarios` da de alta voluntariado en lote, y ese es su caso de uso legítimo.
--
-- ENUM-SAFETY: no crea ni añade ningún valor de enum.
--
-- Idempotente (el respaldo solo corre si las columnas todavía existen).
-- Ejecutar tras 0231.
-- ============================================================

-- ═══ (1) La tabla ═══
create table if not exists public.perfiles_intake (
  perfil_id           uuid primary key references public.perfiles(id) on delete cascade,
  experiencia         text,
  contacto_emergencia text,
  actualizado_en      timestamptz not null default now()
);

comment on table public.perfiles_intake is
  'Intake sensible del voluntariado (0232), fuera de `perfiles` porque la RLS filtra filas y no columnas: mientras vivió ahí, `perfiles_lectura` (0018) lo entregaba a cualquier cuenta verificada. Lectura: el dueño y administración. Escritura: solo por guardar_intake_perfil().';
comment on column public.perfiles_intake.contacto_emergencia is
  'Nombre, relación y teléfono de una persona que NO es usuaria de la plataforma y que no aceptó nada. Es el dato de tercero más expuesto del sistema: no debe salir de aquí ni aparecer en ninguna exportación que no sea de administración.';

-- ═══ (2) RLS: el dueño y administración. Nadie más. ═══
alter table public.perfiles_intake enable row level security;

drop policy if exists pintake_select on public.perfiles_intake;
create policy pintake_select on public.perfiles_intake for select to authenticated
  using (perfil_id = auth.uid() or public.es_admin());

-- Sin policy de INSERT/UPDATE/DELETE a propósito: con RLS activa quedan denegadas para
-- todos y la única vía es la RPC de abajo. Los drop limpian entornos de prueba.
drop policy if exists pintake_insert on public.perfiles_intake;
drop policy if exists pintake_update on public.perfiles_intake;
drop policy if exists pintake_delete on public.perfiles_intake;

grant select on public.perfiles_intake to authenticated;

-- NO se publica en Realtime: no hay ninguna pantalla que necesite ver cambiar esto en
-- vivo, y publicarlo pondría el teléfono de un familiar en un WebSocket.

-- ═══ (3) Respaldo de lo que ya había, ANTES de retirar las columnas ═══
-- Guardado dentro de un `do` porque al reaplicar la migración las columnas ya no existen
-- y un `select experiencia from perfiles` fallaría al planificarse.
do $mig$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'perfiles'
       and column_name = 'contacto_emergencia'
  ) then
    execute $q$
      insert into public.perfiles_intake (perfil_id, experiencia, contacto_emergencia)
      select p.id, p.experiencia, p.contacto_emergencia
        from public.perfiles p
       where p.experiencia is not null or p.contacto_emergencia is not null
      on conflict (perfil_id) do nothing
    $q$;
  end if;
end $mig$;

-- ═══ (4) Retirar las columnas de `perfiles` ═══
-- Se RETIRAN, no se vacían: mientras existieran, cualquier escritura vieja las volvería
-- a poblar y la fuga regresaría sin aviso.
alter table public.perfiles drop column if exists experiencia;
alter table public.perfiles drop column if exists contacto_emergencia;

-- ═══ (5) Escritura ═══
-- `p_perfil` nulo = lo mío. Con `p_perfil` se escribe el de otra persona, y eso exige
-- administración: lo necesita el importador de CSV de /admin/usuarios.
create or replace function public.guardar_intake_perfil(
  p_experiencia         text default null,
  p_contacto_emergencia text default null,
  p_perfil              uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_destino uuid := coalesce(p_perfil, auth.uid());
  v_exp     text := nullif(btrim(coalesce(p_experiencia, '')), '');
  v_ce      text := nullif(btrim(coalesce(p_contacto_emergencia, '')), '');
begin
  if v_destino is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;
  if v_destino <> auth.uid() and not public.es_admin() then
    raise exception 'Solo puedes editar tus propios datos.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.perfiles where id = v_destino) then
    raise exception 'Perfil no encontrado.' using errcode = 'P0002';
  end if;

  insert into public.perfiles_intake (perfil_id, experiencia, contacto_emergencia, actualizado_en)
  values (v_destino, left(v_exp, 1000), left(v_ce, 300), now())
  on conflict (perfil_id) do update
    set experiencia         = excluded.experiencia,
        contacto_emergencia = excluded.contacto_emergencia,
        actualizado_en      = now();

  -- Auditoría SIN los valores: el asiento registra QUE cambió, no QUÉ dice. Meter el
  -- teléfono del familiar en `registro_auditoria` sería mudar la fuga de sitio.
  perform public.registrar_auditoria('intake_perfil_guardado', 'perfil', v_destino::text,
    jsonb_build_object('experiencia', v_exp is not null,
                       'contacto_emergencia', v_ce is not null,
                       'por_admin', v_destino <> auth.uid()));
end $$;

revoke all on function public.guardar_intake_perfil(text, text, uuid) from public;
grant execute on function public.guardar_intake_perfil(text, text, uuid) to authenticated;

comment on function public.guardar_intake_perfil(text, text, uuid) is
  'Única vía de escritura del intake sensible (0232). Sin p_perfil escribe el propio; con p_perfil exige administración (importador de CSV). La auditoría registra que hubo cambio, nunca el contenido.';
