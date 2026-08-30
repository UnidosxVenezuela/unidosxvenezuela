-- ============================================================
-- 0243 — Gestor Integral de Casos · Fase 3: cerrar con criterios, y reabrir
-- ------------------------------------------------------------
-- LO QUE PIDE LA PROPUESTA (3.7 y 5): «confirmar el resultado de la atención, validar los
--   criterios de cierre y REABRIR el caso cuando la evidencia sea insuficiente o aparezca
--   una necesidad relacionada».
--
-- LO QUE HABÍA: cerrar era poner `estado = 'resuelto'`, y reabrir NO EXISTÍA. Un caso se
--   resolvía de dos maneras —a mano, o solo al entregar la última parte del desglose
--   (`cerrar_caso_al_entregar`, 0221:776)— y una vez resuelto no había vuelta atrás salvo
--   por administración tocando la tabla. `regresar_caso_verificacion` (0209) es otra cosa:
--   devuelve a Verificación un caso que está EN el pipeline de Redacción, no uno cerrado.
--
-- LOS CRITERIOS SE CALCULAN, NO SE MARCAN. Es la decisión de diseño de esta migración y
--   conviene justificarla: una lista de casillas que alguien tilda antes de cerrar se
--   convierte en cinco clics automáticos a la tercera semana, y entonces el «cierre
--   documentado» de la propuesta es una firma sin contenido. Aquí la plataforma comprueba
--   lo que puede comprobar —desglose cubierto, entrega registrada, evidencia adjunta,
--   peticiones de información contestadas, derivaciones cerradas— y lo que no se puede
--   comprobar solo lo pone la persona, por escrito.
--
-- «AVISA, NO BLOQUEA», que fue la decisión de la organización, PERO CON DIENTES: se puede
--   cerrar con criterios sin cumplir, y para eso hay que escribir por qué. Sin la nota, la
--   RPC rechaza y dice cuáles faltan. En una emergencia nadie se queda con un caso abierto
--   porque falte un papel; lo que no se puede es cerrarlo en silencio.
--
-- QUEDA LA FOTO, NO EL RESULTADO. `casos_cierres` guarda el estado de CADA criterio en el
--   momento de cerrar, no solo si se cumplían todos. Seis meses después, «se cerró sin
--   evidencia y esta fue la razón» es una frase que se puede leer; «se cerró» no.
--
-- ESCRITURA solo por RPC (molde 0172, como 0234/0238/0240): la tabla publica ÚNICAMENTE
--   policy de SELECT. Y `casos_update` no se toca — el gestor no tiene rama ahí y no la
--   necesita.
--
-- Idempotente. Ejecutar tras 0242.
-- ============================================================

-- ═══ (1) Los criterios, calculados ═══
-- Devuelve una fila por criterio. `cumplido` es lo que la plataforma puede afirmar;
-- `detalle` es la frase que se le enseña a la persona para que sepa qué mirar.
drop function if exists public.criterios_cierre_caso(uuid);
create function public.criterios_cierre_caso(p_caso uuid)
returns table (criterio text, cumplido boolean, detalle text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_cob      record;
  v_sol      record;
  v_adj      int;
  v_peticion int;
  v_deriv    int;
begin
  if not (public.es_admin() or public.es_mando_verificacion() or public.es_gestor_casos()
          or public.tiene_rol('verificador')) then
    return;
  end if;

  select * into v_cob from public.cobertura_items_caso(p_caso);
  select s.estado::text as estado, count(*) over () as n into v_sol
    from public.solicitudes_insumo s where s.caso_id = p_caso
   order by s.creado_en desc limit 1;

  select count(*) into v_adj from public.casos_adjuntos a where a.caso_id = p_caso;
  select count(*) into v_peticion from public.casos_solicitudes_info si
   where si.caso_id = p_caso and si.estado <> 'cerrada';
  select count(*) into v_deriv from public.casos_derivaciones d
   where d.caso_id = p_caso and d.estado <> 'cerrada';

  -- Desglose cubierto. Sin desglose no hay nada que exigir: se da por cumplido.
  return query select 'desglose'::text,
    coalesce(v_cob.n_items, 0) = 0 or coalesce(v_cob.n_cumplidos, 0) >= v_cob.n_items,
    case when coalesce(v_cob.n_items, 0) = 0 then 'Este caso no lleva desglose por ítem.'
         else 'Cubiertos ' || coalesce(v_cob.n_cumplidos, 0) || ' de ' || v_cob.n_items || ' ítems.' end;

  -- Entrega registrada. Sin solicitud de Logística tampoco hay nada que exigir.
  return query select 'entrega'::text,
    v_sol.estado is null or v_sol.estado in ('entregado', 'cancelado', 'no_disponible'),
    case when v_sol.estado is null then 'Este caso no generó entrega de Logística.'
         else 'La entrega está en «' || v_sol.estado || '».' end;

  -- Evidencia. Es el criterio que más se salta y el que más cuesta reconstruir después.
  return query select 'evidencia'::text, v_adj > 0,
    case when v_adj > 0 then v_adj || ' archivo(s) adjuntos al caso.'
         else 'No hay ningún archivo adjunto al caso.' end;

  -- Peticiones de información (0240) contestadas y cerradas.
  return query select 'sin_peticiones'::text, v_peticion = 0,
    case when v_peticion = 0 then 'No queda ninguna petición de información abierta.'
         else v_peticion || ' petición(es) de información sin cerrar.' end;

  -- Derivaciones (0177) cerradas: ningún área se queda con trabajo colgando.
  return query select 'sin_derivaciones'::text, v_deriv = 0,
    case when v_deriv = 0 then 'Ninguna área tiene trabajo abierto en este caso.'
         else v_deriv || ' derivación(es) sin cerrar.' end;
end $$;

revoke all on function public.criterios_cierre_caso(uuid) from public;
grant execute on function public.criterios_cierre_caso(uuid) to authenticated;

comment on function public.criterios_cierre_caso(uuid) is
  'Criterios de cierre de un caso (0243), CALCULADOS y no marcados a mano: desglose, entrega, evidencia, peticiones de información y derivaciones. Una lista de casillas se tilda sin mirar a la tercera semana; esto no.';

-- ═══ (2) El registro de cierres y reaperturas ═══
create table if not exists public.casos_cierres (
  id          uuid primary key default gen_random_uuid(),
  caso_id     uuid not null references public.casos(id) on delete cascade,
  accion      text not null check (accion in ('cierre', 'reapertura')),
  nota        text,
  -- Foto de CADA criterio en el momento de cerrar, no solo si se cumplían todos.
  criterios   jsonb not null default '[]'::jsonb,
  completo    boolean not null default false,
  actor_id    uuid references public.perfiles(id) on delete set null,
  actor_sello text not null,
  creado_en   timestamptz not null default now()
);
create index if not exists idx_casos_cierres_caso on public.casos_cierres (caso_id, creado_en desc);

comment on table public.casos_cierres is
  'Cierres y reaperturas de un caso (0243). Guarda la FOTO de los criterios en el momento de cerrar: seis meses después, «se cerró sin evidencia y esta fue la razón» es una frase que se puede leer; «se cerró» no. Escritura solo por cerrar_caso_gestion() / reabrir_caso().';
comment on column public.casos_cierres.completo is
  'Si se cumplían TODOS los criterios al cerrar. Un cierre incompleto es válido —en una emergencia nadie deja un caso abierto porque falte un papel— pero exige nota.';

alter table public.casos_cierres enable row level security;

drop policy if exists cierres_select on public.casos_cierres;
create policy cierres_select on public.casos_cierres for select to authenticated
  using (public.es_admin() or public.es_mando_verificacion() or public.es_gestor_casos()
         or public.tiene_rol('verificador')
         or exists (select 1 from public.casos c where c.id = caso_id and c.gestor_id = auth.uid()));

-- Sin policy de INSERT/UPDATE/DELETE a propósito (molde 0172).
drop policy if exists cierres_insert on public.casos_cierres;
drop policy if exists cierres_update on public.casos_cierres;
drop policy if exists cierres_delete on public.casos_cierres;

grant select on public.casos_cierres to authenticated;

-- ═══ (3) Cerrar ═══
drop function if exists public.cerrar_caso_gestion(uuid, text);
create function public.cerrar_caso_gestion(p_caso uuid, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caso     record;
  v_nota     text := nullif(btrim(coalesce(p_nota, '')), '');
  v_crit     jsonb;
  v_faltan   text;
  v_completo boolean;
  v_sello    text;
begin
  select id, categoria, titulo, estado, gestor_id, creado_por, asignado_a
    into v_caso from public.casos where id = p_caso;
  if v_caso.id is null then
    raise exception 'Esa solicitud no existe.' using errcode = '22023';
  end if;
  if v_caso.categoria is not distinct from 'Desaparecidos' then
    raise exception 'Los casos de Desaparecidos siguen el circuito de Búsqueda.' using errcode = '22023';
  end if;
  if not (public.es_admin() or public.es_mando_verificacion()
          or (v_caso.gestor_id is not null and v_caso.gestor_id = auth.uid())) then
    raise exception 'Cierra el caso su gestor, su líder o administración.' using errcode = '42501';
  end if;
  if v_caso.estado::text not in ('confirmado', 'enviado_redaccion') then
    raise exception 'Este caso está en «%» y desde aquí solo se cierra uno confirmado o enviado a redacción.', v_caso.estado
      using errcode = '22023';
  end if;

  select jsonb_agg(jsonb_build_object('criterio', c.criterio, 'cumplido', c.cumplido, 'detalle', c.detalle)),
         bool_and(c.cumplido),
         string_agg(c.detalle, ' ') filter (where not c.cumplido)
    into v_crit, v_completo, v_faltan
    from public.criterios_cierre_caso(p_caso) c;

  -- «Avisa, no bloquea» — pero con dientes: se puede cerrar incompleto, y entonces hay que
  -- decir por qué. Sin la nota se rechaza, y el mensaje dice qué falta.
  if not coalesce(v_completo, false) and v_nota is null then
    raise exception 'Faltan criterios de cierre: % Escribe por qué se cierra igualmente.', coalesce(v_faltan, '')
      using errcode = '23514';
  end if;

  select coalesce(nullif(btrim(p.nombre_completo), ''), 'Gestión de Casos') into v_sello
    from public.perfiles p where p.id = auth.uid();

  update public.casos set estado = 'resuelto', actualizado_en = now() where id = p_caso;

  insert into public.casos_cierres (caso_id, accion, nota, criterios, completo, actor_id, actor_sello)
  values (p_caso, 'cierre', left(v_nota, 2000), coalesce(v_crit, '[]'::jsonb),
          coalesce(v_completo, false), auth.uid(), coalesce(v_sello, 'Gestión de Casos'));

  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select d, 'caso_cerrado', 'Se cerró una solicitud que seguías',
         left(coalesce(v_caso.titulo, 'Una solicitud'), 140), '/casos?caso=' || p_caso
    from (select distinct unnest(array[v_caso.creado_por, v_caso.asignado_a]) as d) x
   where d is not null and d is distinct from auth.uid();

  perform public.registrar_auditoria('caso_cerrado_gestion', 'casos', p_caso::text,
    jsonb_build_object('completo', coalesce(v_completo, false), 'con_nota', v_nota is not null));
end $$;

revoke all on function public.cerrar_caso_gestion(uuid, text) from public;
grant execute on function public.cerrar_caso_gestion(uuid, text) to authenticated;

-- ═══ (4) Reabrir ═══
-- Lo pide la propuesta con todas las letras: «reabrir el caso cuando la evidencia sea
-- insuficiente o aparezca una necesidad relacionada». Vuelve a 'confirmado' —no a
-- 'pendiente'— porque los datos ya estaban verificados: lo que se reabre es la ATENCIÓN,
-- no la verificación. Para eso está `regresar_caso_verificacion` (0209), que es otra cosa.
drop function if exists public.reabrir_caso(uuid, text);
create function public.reabrir_caso(p_caso uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_caso record; v_motivo text := nullif(btrim(coalesce(p_motivo, '')), ''); v_sello text;
begin
  select id, categoria, titulo, estado, gestor_id, creado_por into v_caso
    from public.casos where id = p_caso;
  if v_caso.id is null then
    raise exception 'Esa solicitud no existe.' using errcode = '22023';
  end if;
  if v_caso.categoria is not distinct from 'Desaparecidos' then
    raise exception 'Los casos de Desaparecidos siguen el circuito de Búsqueda.' using errcode = '22023';
  end if;
  if not (public.es_admin() or public.es_mando_verificacion()
          or (v_caso.gestor_id is not null and v_caso.gestor_id = auth.uid())) then
    raise exception 'Reabre el caso su gestor, su líder o administración.' using errcode = '42501';
  end if;
  if v_caso.estado::text <> 'resuelto' then
    raise exception 'Solo se reabre un caso resuelto. Este está en «%».', v_caso.estado
      using errcode = '22023';
  end if;
  -- El motivo es obligatorio, y no por burocracia: reabrir deshace un cierre que alguien
  -- firmó, y esa persona tiene derecho a leer por qué.
  if v_motivo is null then
    raise exception 'Escribe por qué se reabre el caso.' using errcode = '22023';
  end if;

  select coalesce(nullif(btrim(p.nombre_completo), ''), 'Gestión de Casos') into v_sello
    from public.perfiles p where p.id = auth.uid();

  update public.casos
     set estado = 'confirmado',
         -- Se reabre el reloj: un caso reabierto sin fecha de seguimiento vuelve a ser un
         -- caso a la deriva, que es justo lo que la Fase 1 vino a evitar.
         proxima_revision = now() + public.plazo_seguimiento(req_urgencia::text),
         proxima_accion = left('Reabierto: ' || v_motivo, 500),
         actualizado_en = now()
   where id = p_caso;

  insert into public.casos_cierres (caso_id, accion, nota, criterios, completo, actor_id, actor_sello)
  values (p_caso, 'reapertura', left(v_motivo, 2000), '[]'::jsonb, false,
          auth.uid(), coalesce(v_sello, 'Gestión de Casos'));

  -- Avisa a quien lo cerró y a quien lo gestiona: deshacer un cierre ajeno en silencio es
  -- la forma más rápida de que dos personas trabajen contra el mismo caso.
  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select d, 'caso_reabierto', 'Se reabrió un caso', left(v_motivo, 140), '/casos?caso=' || p_caso
    from (select distinct unnest(
            array[v_caso.gestor_id, v_caso.creado_por,
                  (select cc.actor_id from public.casos_cierres cc
                    where cc.caso_id = p_caso and cc.accion = 'cierre'
                    order by cc.creado_en desc limit 1)]) as d) x
   where d is not null and d is distinct from auth.uid();

  perform public.registrar_auditoria('caso_reabierto', 'casos', p_caso::text,
    jsonb_build_object('motivo', left(v_motivo, 500)));
end $$;

revoke all on function public.reabrir_caso(uuid, text) from public;
grant execute on function public.reabrir_caso(uuid, text) to authenticated;
