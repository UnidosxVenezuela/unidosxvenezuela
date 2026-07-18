-- 0182 · Campo «personas afectadas» (aprox.) en las solicitudes.
-- Número estimado de personas que necesitan la ayuda. Ayuda a priorizar la
-- respuesta. Es OPCIONAL: muchas veces se desconoce al momento de reportar.
-- Lo captura Recopilación en el formulario de la solicitud. Idempotente.

alter table public.casos
  add column if not exists personas_afectadas integer;

-- No puede ser negativo (guarda 0/NULL o un entero positivo). Guardado idempotente.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_casos_personas_afectadas'
  ) then
    alter table public.casos
      add constraint chk_casos_personas_afectadas
      check (personas_afectadas is null or personas_afectadas >= 0);
  end if;
end $$;

comment on column public.casos.personas_afectadas is
  'Número aproximado de personas afectadas por la solicitud (opcional; lo captura Recopilación). La RLS de casos ya cubre esta columna.';
