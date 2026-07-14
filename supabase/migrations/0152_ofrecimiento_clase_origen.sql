-- ============================================================
-- 0152 — «Donación-Ofrecimiento»: qué se ofrece (clase) + quién ofrece (origen)
-- ------------------------------------------------------------
-- El módulo de ofertas (oportunidades_donacion, 0141) tenía `tipo_oferta`
-- (especie/dinero/servicio/transporte/otro) pero faltaba la distinción de alto nivel
-- que pidió el equipo, en dos ejes independientes:
--
--   (1) QUÉ se ofrece → `clase`:
--        · 'donacion'  = se entregan BIENES/insumos/recursos (alimentos, agua,
--                        medicamentos, ropa, colchones, kits, materiales, dinero…).
--        · 'servicio'  = se brinda una ACCIÓN/atención por un tiempo, sin entregar
--                        bienes (consulta médica/veterinaria, apoyo psicológico,
--                        traslado, orientación legal/social, refugio, comidas…).
--
--   (2) QUIÉN ofrece → `origen` (para tener claridad del ofrecimiento):
--        'centro_acopio' · 'persona' · 'organizacion'.
--
-- `tipo_oferta` se conserva como detalle fino (y sigue rigiendo la lógica de dinero al
-- conectar con una solicitud). Ambos campos son TEXTO con CHECK (sin enums nuevos → sin
-- cast eager; mismo estilo que 0141). `clase` default 'donacion' para las filas ya
-- existentes. Idempotente. Ejecutar tras 0151.
-- ============================================================

alter table public.oportunidades_donacion
  add column if not exists clase  text not null default 'donacion',
  add column if not exists origen text;

-- CHECKs idempotentes (add constraint no soporta IF NOT EXISTS en PG16 → DO/exception).
do $$ begin
  alter table public.oportunidades_donacion
    add constraint oportdon_clase_chk check (clase in ('donacion','servicio'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.oportunidades_donacion
    add constraint oportdon_origen_chk check (origen is null or origen in ('centro_acopio','persona','organizacion'));
exception when duplicate_object then null; end $$;
