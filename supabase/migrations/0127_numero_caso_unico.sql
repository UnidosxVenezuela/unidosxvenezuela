-- ============================================================
-- 0127 — Número de caso único (arregla números repetidos)
-- ------------------------------------------------------------
-- `casos.numero` es GENERATED ALWAYS AS IDENTITY, pero SIN restricción UNIQUE.
-- Si la secuencia de identidad quedó desfasada (p. ej. tras una importación
-- masiva o un reinicio de datos), dos casos DISTINTOS pueden terminar con el
-- MISMO número — y se ve repetido en Coincidencias y en Búsqueda.
--
-- Este parche, de forma idempotente y no destructiva:
--   1) Resincroniza la secuencia por encima del máximo actual (así el próximo
--      número nuevo nunca choca con uno existente).
--   2) Renumera los duplicados: conserva el más antiguo por número y reasigna
--      el resto a números nuevos (por encima del máximo).
--   3) Añade un índice único para que no se repita nunca más.
-- Si no hay duplicados, no cambia ninguna fila. Informa cuántos corrigió.
-- ============================================================

do $$
declare v_dups int;
begin
  -- 1) Secuencia por encima del máximo actual (evita que 'default' colisione).
  perform setval(
    pg_get_serial_sequence('public.casos', 'numero'),
    greatest((select coalesce(max(numero), 1) from public.casos), 1)
  );

  -- 2) Renumerar duplicados: conservar el más antiguo por número; el resto,
  --    a un número nuevo tomado de la secuencia (ya por encima del máximo).
  with d as (
    select id, row_number() over (partition by numero order by creado_en, id) as rn
      from public.casos
  ), r as (
    update public.casos c
       set numero = default
      from d
     where d.id = c.id and d.rn > 1
    returning 1
  )
  select count(*) into v_dups from r;

  raise notice 'Casos renumerados por número duplicado: %', v_dups;
end $$;

-- 3) Impedir que se repita.
create unique index if not exists idx_casos_numero on public.casos (numero);
