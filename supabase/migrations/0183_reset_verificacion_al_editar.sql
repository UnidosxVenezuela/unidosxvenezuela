-- ============================================================
-- 0183 — Reseteo del semáforo al editar un dato ya verificado
-- ------------------------------------------------------------
-- PROBLEMA («validado rancio»): al EDITAR una solicitud (casos), `editarCaso` cambia
-- descripción / fuente / vigencia / ubicación / contacto, pero NUNCA toca el semáforo
-- por campo (casos_verificacion_campo, 0172). El candado (0173) solo controla la
-- transición estado→'confirmado'. Resultado: un caso puede seguir figurando en verde
-- con los datos cambiados por debajo.
--
-- SOLUCIÓN: un trigger AFTER UPDATE sobre `casos` que, cuando cambia una columna que
-- pertenece a un CAMPO del semáforo, vuelve ese campo a 🟡 'sin_revisar' para que
-- Verificación lo revise de nuevo. Mapeo columna(s) → campo (idéntico a los `key` de
-- CAMPOS_VERIFICACION_BASE/_REQ en la app y a caso_esta_validado de 0173):
--   referente/referente_rol/contacto/contacto_whatsapp/contacto_instagram → 'referente'
--   descripcion                                                            → 'descripcion'
--   fuente/fuente_url/fuente_tipo                                           → 'fuente'
--   sigue_vigente                                                          → 'vigencia'
--   ubicacion_estado/municipio/parroquia/sector/direccion + lat/lng        → 'ubicacion'
--   req_tipo/req_cantidad/req_urgencia/personas_afectadas                  → 'cantidad'
--
-- Notas de diseño:
--   · 'evidencia' NO se mapea: la evidencia son adjuntos (otra tabla/bucket), no una
--     columna de `casos`; un UPDATE de casos no puede detectar cambios de adjuntos.
--   · `ultima_confirmacion` NO cuenta como cambio de 'vigencia' (la escribe la propia
--     verificación de vigencia → evita un bucle de auto-reseteo).
--   · Solo se resetean campos que estuvieran en un estado distinto de 'sin_revisar'
--     (verificado/requiere_info/falso). Deja constancia en la nota. Idempotente.
-- SECURITY DEFINER: el reseteo es una acción del sistema (no la escribe el usuario),
-- así que salta la RLS de casos_verificacion_campo. Ejecutar tras 0182.
-- ============================================================

create or replace function public.reset_verificacion_al_editar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campos text[] := array[]::text[];
begin
  if new.referente is distinct from old.referente
     or new.referente_rol is distinct from old.referente_rol
     or new.contacto is distinct from old.contacto
     or new.contacto_whatsapp is distinct from old.contacto_whatsapp
     or new.contacto_instagram is distinct from old.contacto_instagram then
    v_campos := array_append(v_campos, 'referente');
  end if;

  if new.descripcion is distinct from old.descripcion then
    v_campos := array_append(v_campos, 'descripcion');
  end if;

  if new.fuente is distinct from old.fuente
     or new.fuente_url is distinct from old.fuente_url
     or new.fuente_tipo is distinct from old.fuente_tipo then
    v_campos := array_append(v_campos, 'fuente');
  end if;

  if new.sigue_vigente is distinct from old.sigue_vigente then
    v_campos := array_append(v_campos, 'vigencia');
  end if;

  if new.ubicacion_estado is distinct from old.ubicacion_estado
     or new.ubicacion_municipio is distinct from old.ubicacion_municipio
     or new.ubicacion_parroquia is distinct from old.ubicacion_parroquia
     or new.ubicacion_sector is distinct from old.ubicacion_sector
     or new.ubicacion_direccion is distinct from old.ubicacion_direccion
     or new.lat is distinct from old.lat
     or new.lng is distinct from old.lng then
    v_campos := array_append(v_campos, 'ubicacion');
  end if;

  if new.req_tipo is distinct from old.req_tipo
     or new.req_cantidad is distinct from old.req_cantidad
     or new.req_urgencia is distinct from old.req_urgencia
     or new.personas_afectadas is distinct from old.personas_afectadas then
    v_campos := array_append(v_campos, 'cantidad');
  end if;

  if array_length(v_campos, 1) is null then
    return new;
  end if;

  update public.casos_verificacion_campo v
     set estado = 'sin_revisar',
         verificado_por = null,
         verificado_en = now(),
         nota = left(trim(coalesce(v.nota, '') || ' · (auto) el dato cambió; requiere re-verificación'), 500)
   where v.caso_id = new.id
     and v.campo = any(v_campos)
     and v.estado is distinct from 'sin_revisar';

  return new;
end;
$$;

drop trigger if exists trg_reset_verificacion_al_editar on public.casos;
create trigger trg_reset_verificacion_al_editar
  after update on public.casos
  for each row
  execute function public.reset_verificacion_al_editar();
