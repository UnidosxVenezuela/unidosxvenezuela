# ADR-001: Almacenamiento de archivos — Supabase Storage (no Google Drive)

- **Estado:** Aceptada (2026-06-27)
- **Contexto:** La plataforma necesita compartir archivos (fotos de daños, reportes,
  documentos) entre equipos. Se evaluó integrar Google Drive frente a usar Supabase
  Storage, que ya forma parte del stack.

## Decisión

Usar **Supabase Storage** como mecanismo de archivos de la plataforma.

## Alternativas evaluadas

| Criterio | Google Drive (API + Picker) | Supabase Storage ✅ |
|---|---|---|
| Cuenta requerida | Cuenta Google (muchos afectados no la tienen) | El login de la plataforma |
| Control de acceso | Permisos gestionados por Google | Mismo modelo RLS/sensibilidad |
| Baja conectividad | Depende de Google; peor offline | Integra con el plan offline |
| Datos sensibles | Riesgo de fuga por mala configuración | Más controlable |
| Colaboración (Docs) | Excelente | No nativo |

## Razones

1. **Seguridad unificada:** los archivos se rigen por las mismas reglas de
   sensibilidad y RLS que el resto de los datos, clave para información de víctimas.
2. **Inclusión:** no exige que la persona tenga cuenta Google.
3. **Resiliencia:** encaja con el modo offline previsto para campo.

## Consecuencias

- Asumimos el costo de almacenamiento y la gestión de buckets/políticas.
- Sin edición colaborativa tipo Docs (no es un requisito actual).
- **Implementación futura (sprint de archivos):** tabla `archivos`
  (`proveedor` = 'storage', `ruta`, `tipo_mime`, `tamano`, `sensibilidad`,
  enlaces a `tarea_id`/`publicacion_id`), bucket privado con políticas de acceso
  alineadas a la sensibilidad, y subida con URLs firmadas.
- Google Drive queda como posible integración opcional a futuro si una ONG aliada
  lo requiere (enlazando archivos, sin reemplazar el almacenamiento propio).
