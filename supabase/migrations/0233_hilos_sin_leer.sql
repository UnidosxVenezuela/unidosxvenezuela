-- ============================================================
-- 0233 — Cuenta de mensajes sin leer (para el botón flotante del chat)
-- ------------------------------------------------------------
-- PROBLEMA: el botón flotante de conversaciones tiene que mostrar cuántos mensajes hay
--   sin leer, y se pinta en TODAS las páginas. Sacar ese número de `hilos_bandeja`
--   (0231) obligaría a traer una fila por hilo en cada carga de cada pantalla, con su
--   subconsulta de conteo y su último mensaje, para acabar sumando un entero.
--
-- AHORA: una función que devuelve ese entero y ya. Suma DOS cosas:
--
--   (a) Los hilos en los que la persona YA ENTRÓ (`hilo_participantes`): cuenta los
--       mensajes posteriores a su marca de lectura.
--
--   (b) Los hilos de GRUPO de un grupo al que pertenece pero en los que todavía no ha
--       entrado: cuenta desde `miembros_grupo.unido_en`. Sin esta rama, quien acaba de
--       entrar a un equipo NUNCA se enteraría de que hay conversación —el contador diría
--       cero para siempre hasta que abriera la página del grupo por casualidad—, que es
--       justo lo contrario de para qué sirve la insignia. Y contar desde `unido_en`
--       evita el otro extremo: que al sumarse a un grupo viejo le aparezcan cientos de
--       mensajes «sin leer» de conversaciones que nunca fueron suyas.
--
--   Para 'caso', 'insumo' y 'tarea' NO hay rama equivalente, y es deliberado: nadie
--   «pertenece» a una solicitud. Ahí el ancla correcta es la primera vez que se abre,
--   que es cuando la app llama a marcar_hilo_leido() y crea la fila de participante.
--
-- SEGURIDAD: es SECURITY DEFINER, así que salta la RLS; por eso NO acepta parámetros y
--   responde SIEMPRE por `auth.uid()`. No hay forma de preguntar por otra persona: un
--   `p_perfil` aquí convertiría un contador inocente en una sonda para saber con quién
--   habla quién. Y no se cuentan los mensajes propios.
--
--   El filtro por `puede_leer_hilo()` es necesario aunque la persona sea participante:
--   los permisos pueden habérsele retirado después de entrar (sale de un grupo, pierde
--   un rol), y en ese caso el hilo deja de contar — igual que deja de verse.
--
-- ENUM-SAFETY: no crea ni añade ningún valor de enum.
-- Idempotente. Ejecutar tras 0232.
-- ============================================================

create or replace function public.mis_hilos_sin_leer()
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(t.n), 0)::integer from (
    -- (a) Hilos en los que ya entré: desde mi marca de lectura.
    select count(*) as n
      from public.hilo_participantes hp
      join public.hilo_mensajes m on m.hilo_id = hp.hilo_id
     where hp.perfil_id = auth.uid()
       and m.autor_id is distinct from auth.uid()
       and (hp.leido_hasta is null or m.creado_en > hp.leido_hasta)
       and public.puede_leer_hilo(hp.hilo_id)

    union all

    -- (b) Hilos de un grupo mío en los que aún no entré: desde que me uní al grupo.
    select count(*) as n
      from public.hilos h
      join public.miembros_grupo mg
        on mg.grupo_id = h.ancla_id and mg.perfil_id = auth.uid()
      join public.hilo_mensajes m on m.hilo_id = h.id
     where h.ambito = 'grupo'
       and not exists (select 1 from public.hilo_participantes hp
                        where hp.hilo_id = h.id and hp.perfil_id = auth.uid())
       and m.autor_id is distinct from auth.uid()
       and m.creado_en > mg.unido_en
  ) t;
$$;

revoke all on function public.mis_hilos_sin_leer() from public;
grant execute on function public.mis_hilos_sin_leer() to authenticated;

comment on function public.mis_hilos_sin_leer() is
  'Cuántos mensajes sin leer tengo (0233). Sin parámetros a propósito: es SECURITY DEFINER y responde solo por auth.uid(), para que no se pueda usar como sonda de con quién habla quién. Ignora los mensajes propios y descarta los hilos a los que ya se perdió el acceso.';
