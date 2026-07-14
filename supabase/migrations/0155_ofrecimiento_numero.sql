-- ============================================================
-- 0155 — Número correlativo para «Donación-Ofrecimiento» (identificador OF-00001)
-- ------------------------------------------------------------
-- Los ofrecimientos (oportunidades_donacion, 0141) solo tenían el id UUID interno. Se les
-- agrega un `numero` correlativo (como casos.numero) para un identificador legible; la app
-- lo muestra como «OF-00001». Los ya existentes se ENUMERAN por orden de creación, una sola
-- vez y sin duplicados (idempotente: solo se numeran los que están en NULL). Ejecutar tras 0154.
-- ============================================================

alter table public.oportunidades_donacion add column if not exists numero bigint;

-- Secuencia propia del número.
create sequence if not exists public.oportunidad_numero_seq;

-- Backfill IDEMPOTENTE: numera solo las filas SIN número, por orden de creación, arrancando
-- después del máximo actual. Si se corre de nuevo, no hay filas en NULL → no hace nada (sin
-- duplicados). No usa la secuencia para el relleno (para no consumirla dos veces si reaplica).
do $$
declare v_base bigint;
begin
  select coalesce(max(numero), 0) into v_base from public.oportunidades_donacion;
  with faltan as (
    select id, row_number() over (order by creado_en, id) as rn
    from public.oportunidades_donacion
    where numero is null
  )
  update public.oportunidades_donacion o
     set numero = v_base + f.rn
    from faltan f
   where o.id = f.id;
end $$;

-- Alinear la secuencia para que el PRÓXIMO ofrecimiento tome max+1 (o 1 si no hay ninguno).
-- Se usa la forma (valor, is_called=false): el siguiente nextval() devuelve exactamente ese
-- valor. Con la tabla vacía, max→0 y el próximo número es 1 — evita el error «setval: value 0
-- is out of bounds» (la secuencia arranca en 1) cuando aún no existe ningún ofrecimiento.
select setval('public.oportunidad_numero_seq',
              coalesce((select max(numero) from public.oportunidades_donacion), 0) + 1, false);

-- Los nuevos ofrecimientos toman el número por defecto de la secuencia; único y no nulo.
alter table public.oportunidades_donacion
  alter column numero set default nextval('public.oportunidad_numero_seq');
alter sequence public.oportunidad_numero_seq owned by public.oportunidades_donacion.numero;

do $$ begin
  alter table public.oportunidades_donacion alter column numero set not null;
exception when others then null; end $$;  -- por si quedara algún NULL (no debería); no rompe

create unique index if not exists idx_oportdon_numero on public.oportunidades_donacion (numero);
