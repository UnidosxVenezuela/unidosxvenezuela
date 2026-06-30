-- 0036: Roles del pipeline de contenido.
-- Flujo: Recopilación → Verificación → Redacción → Diseño/Video → Redes.
-- Cada función es un rol propio (grupos exclusivos por rol).
-- IMPORTANTE: aplicar ESTA migración ANTES que 0037 (las políticas de 0037
-- referencian estos valores de enum, que deben existir y estar confirmados).

alter type public.rol_usuario add value if not exists 'recopilacion';
alter type public.rol_usuario add value if not exists 'redaccion';
alter type public.rol_usuario add value if not exists 'diseno_grafico';
alter type public.rol_usuario add value if not exists 'edicion_video';
alter type public.rol_usuario add value if not exists 'redes_sociales';
