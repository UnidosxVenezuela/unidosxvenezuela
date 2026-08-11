-- ============================================================
-- 0237 — El país de una solicitud, sin abrir `casos` a nadie
-- ------------------------------------------------------------
-- PROBLEMA: `solicitudes_insumo` no guarda el país (0230 lo puso en `casos`), así que el
--   tablero de Logística lo saca por el join a `casos`. Ese join depende de `casos_select`,
--   y ahí hay dos huecos:
--
--     · ALIANZAS ESTRATÉGICAS no tiene rama en `casos_select` (0180). Entra a /insumos en
--       modo consulta —revisa solicitudes y deja en la bitácora qué empresas pueden
--       ayudar— pero el join le vuelve vacío: no ve el país, y tampoco el `#00012`.
--     · LOGÍSTICA lo pierde si el caso vuelve a verificación: su rama exige
--       `estado in ('confirmado','enviado_redaccion','resuelto')`, y un caso regresado a
--       'en_proceso' deja de concederse aunque su solicitud siga viva y en curso.
--
--   En ambos casos la tarjeta se queda sin bandera. Y la alternativa —caer al DEFAULT
--   'VE'— es peor que no decir nada: sería afirmar algo que nadie registró, que es justo
--   el error que 0230 quiso evitar.
--
-- POR QUÉ UNA VISTA Y NO UNA RAMA MÁS EN `casos_select` — molde de 0226, y por su misma
--   razón. Meter a Alianzas en `casos_select` le entregaría la FILA ENTERA de `casos`:
--   `contacto`, `referente`, `contacto_whatsapp`, `contacto_instagram`, la dirección y las
--   coordenadas de una familia. La RLS filtra FILAS, no columnas —la misma lección que
--   costó la fuga de `contacto_emergencia` en 0232—, así que pedir dos datos inocuos por
--   esa vía significa entregar veinte que no lo son.
--
--   La vista proyecta EXACTAMENTE DOS: el número del caso y su país. Ni título, ni
--   contacto, ni ubicación. Y se acota con `es_verificado()`, que es literalmente la misma
--   condición de `solins_lectura` (0050): quien ve una solicitud ve su contexto, ni una
--   fila más. No se amplía a quién, se amplía qué —y ese «qué» son dos campos que no
--   identifican a nadie.
--
-- DESAPARECIDOS FUERA, aunque hoy sea imposible que aparezca uno: la rama de Logística en
--   `casos_select` ya los excluye, así que nunca se deriva uno al área. Se filtra igual,
--   porque «hoy no puede pasar» es exactamente lo que se dice antes de cada fuga.
--
-- SIN CASO DETRÁS = 'VE', y no es una suposición: esas solicitudes son anteriores a 0223
--   —cuando el alta de Logística no creaba caso— y en aquel momento la plataforma solo
--   atendía Venezuela. Mismo criterio con el que 0230 dejó en 'VE' todo lo existente.
--
-- Idempotente. Requiere 0230. Ejecutar tras 0236.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'casos' and column_name = 'pais'
  ) then
    raise exception 'Falta la migración 0230: la columna public.casos.pais no existe. Aplica 0230 antes que 0237.';
  end if;
end $$;

drop view if exists public.solicitudes_contexto;
create view public.solicitudes_contexto
  with (security_invoker = false) as
  select
    s.id            as solicitud_id,
    c.numero        as caso_numero,
    -- Sin caso detrás no hay país que leer, y esas solicitudes son venezolanas por
    -- historia (ver cabecera). Así quien consume la vista no tiene que repetir la regla.
    coalesce(c.pais, 'VE') as pais
  from public.solicitudes_insumo s
  left join public.casos c on c.id = s.caso_id
  where public.es_verificado()
    -- En el WHERE y NO en el ON del LEFT JOIN, que no es lo mismo: en el ON la fila
    -- sobreviviría con el caso a null y saldría como venezolana. Aquí desaparece. Y una
    -- solicitud SIN caso pasa igual, porque `null is distinct from 'Desaparecidos'` es
    -- cierto — que es justo lo que se quiere.
    and c.categoria is distinct from 'Desaparecidos';

grant select on public.solicitudes_contexto to authenticated;

comment on view public.solicitudes_contexto is
  'Contexto mínimo de cada solicitud de insumo: número del caso de origen y su país (0230). '
  'Existe para que Alianzas —que no tiene rama en casos_select— y Logística —que la pierde '
  'si el caso vuelve a verificación— vean el país sin que se le abra a nadie la fila entera '
  'de `casos` con su contacto y su ubicación. Molde 0226: vista curada, nunca policy más '
  'ancha. Se acota con es_verificado(), la misma condición de solins_lectura (0050).';
