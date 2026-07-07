# ADR-002: Almacenamiento a escala — Supabase Pro + Cloudflare R2 + CDN

- **Estado:** Aceptada — arquitectura (2026-07-07). Implementación por fases (ver Consecuencias).
- **Contexto:** [ADR-001](07-DECISION-ARCHIVOS.md) fijó **Supabase Storage** como
  mecanismo de archivos. Con la entrada del equipo de **Redes Sociales** el volumen
  cambia de naturaleza: no son unos pocos documentos, son **imágenes y video** que se
  producen y consumen de forma masiva (piezas de contenido, material para publicar,
  respaldos). Dos costos crecen distinto:
  1. **Almacenamiento** (GB guardados) — crece lineal y es barato.
  2. **Egress / ancho de banda** (GB servidos al reproducir/descargar) — crece con
     cada visualización y es **el costo que se dispara** cuando el video se ve mucho.

  El plan gratuito de Supabase además **pausa el proyecto por inactividad** y da poco
  egress, lo que no es aceptable para una plataforma de respuesta a emergencias que
  debe estar siempre disponible. Necesitamos escalar sin romper el modelo **RLS** que
  protege los datos sensibles (fotos de casos, selfies de verificación de identidad,
  listados digitalizados con datos de víctimas).

## Decisión

Arquitectura de **almacenamiento en dos planos**, según la sensibilidad del archivo:

1. **Base de la plataforma → Supabase Pro** ($25/mes): sin auto-pausa, respaldos
   diarios, 100 GB de almacenamiento y 250 GB de egress incluidos, y
   *Image Transformations* (redimensionado/optimización servido por Supabase).
2. **Media pública y pesada → Cloudflare R2 + CDN de Cloudflare**: las piezas ya
   publicadas y los assets que Redes distribuye se guardan en **R2** (compatible con
   S3, **egress $0** hacia Internet vía Cloudflare) y se sirven detrás de la **CDN de
   Cloudflare** (caché global, rápido y con transferencia gratuita).
3. **Media privada y sensible → permanece en Supabase Storage con RLS**: fotos de
   casos, selfies de verificación de identidad y digitalización **NO** se mueven a R2
   público. La confidencialidad se mantiene bajo las mismas reglas de sensibilidad y
   RLS del resto de los datos (principio de ADR-001).

R2 y la CDN son **complementarios**, no alternativos: R2 es el *origen* barato; la CDN
es la *entrega* rápida y sin costo de egress. Uno no reemplaza al otro.

## Alternativas evaluadas

| Criterio | Supabase solo (Pro) | Wasabi | Backblaze B2 | **R2 + Supabase Pro ✅** |
|---|---|---|---|---|
| Almacenamiento | 100 GB incl.; luego por GB | 1 TB **mínimo** facturado | 10 GB gratis; luego ~$6/TB-mes | Supabase 100 GB + R2 10 GB gratis; luego ~$0.015/GB-mes |
| **Egress (servir video)** | 250 GB incl.; luego se paga | Cap «uso justo» (egress ≤ almacenado/mes) | Gratis hasta 3× almacenado; libre a Cloudflare (Bandwidth Alliance) | **$0 vía CDN de Cloudflare** |
| Retención mínima | No | **90 días** por objeto | No | No |
| Modelo de acceso | RLS nativo | S3 (propio) | S3/B2 (propio) | RLS (privado) + firmado/público (R2) |
| Encaja con el stack actual | Total | Aparte | Aparte | Supabase se queda; R2 solo para lo público |
| Operación / auto-pausa | Sin auto-pausa (Pro) | N/A | N/A | Sin auto-pausa |

Notas de descarte:

- **Wasabi:** el **mínimo de 1 TB** facturado y la **retención de 90 días** por objeto
  penalizan borrar/rotar contenido; el egress es «gratis» solo bajo una política de
  *uso justo* (no puede superar el volumen almacenado al mes), justo lo contrario de un
  video viral. Bueno para archivo frío, no para media que se ve mucho.
- **Backblaze B2:** muy competitivo y con **egress libre hacia Cloudflare** (Bandwidth
  Alliance). Es la segunda mejor opción; se descarta solo porque R2 nos da el mismo
  egress $0 **sin salir de Cloudflare** (un proveedor menos que operar) y con un tramo
  gratuito que cubre el arranque.
- **Supabase solo:** perfecto para lo privado/sensible, pero el **egress** de servir
  video a escala encarece rápido; por eso se combina con R2 para lo público.

## Razones

1. **El egress es el costo real y R2 lo pone en $0** al servirse por la CDN de
   Cloudflare: un video que se ve miles de veces no dispara la factura.
2. **Seguridad sin cambios:** lo sensible sigue en Supabase con RLS (ADR-001); solo lo
   ya público migra a R2. No se debilita el blindaje de datos de víctimas ni NNA.
3. **Costo de arranque casi nulo:** el tramo gratuito de R2 (10 GB) + los 100 GB de
   Supabase Pro cubren el inicio; el crecimiento es barato y predecible.
4. **Un ecosistema, no cuatro:** R2 + CDN viven en Cloudflare; evitamos operar Wasabi o
   B2 por separado.
5. **Compatibilidad S3:** R2 habla el protocolo S3, así que la integración usa
   herramientas estándar y no nos ata al proveedor.

## Consecuencias

### Capacidad y costo (respuesta directa: «¿con R2 gratis + Pro andamos bien?»)

- **Sí, para empezar.** Capacidad práctica **~110 GB sin costo extra** sobre el plan Pro
  (100 GB Supabase + 10 GB R2 gratis). Más allá, R2 cuesta **~$0.015/GB-mes** (≈ **$1.50
  por cada 100 GB/mes**) y el **egress sigue en $0** por la CDN. En la práctica la
  **capacidad es efectivamente ilimitada** a un costo marginal muy bajo; lo que se paga
  al crecer es almacenamiento, no ancho de banda.
- Costo base mensual: **$25 (Supabase Pro)** + lo que exceda los tramos gratuitos de R2.

### Tamaño de subida por archivo — la restricción real hoy

- El código declara **25 MB** por archivo (`apps/web/app/(app)/contenido/actions.ts`),
  **pero ese límite no es el efectivo**. Las subidas pasan por una **Server Action**
  (`'use server'`) que lee `file.arrayBuffer()` en el servidor, así que el archivo viaja
  **por el cuerpo de la petición** y queda topado por:
  - el límite por defecto de **Server Actions de Next.js** (~1 MB salvo que se suba
    `serverActions.bodySizeLimit`), y
  - el límite de cuerpo de función **serverless de Vercel** (~4.5 MB).
- **Efecto:** hoy el equipo de Redes está **limitado a unos pocos MB por archivo** — sirve
  para imágenes ligeras y documentos, **no para video**.
- **Solución (parte de esta arquitectura): subida directa navegador → almacenamiento**
  (URL *presigned* para R2 / *resumable* TUS para Supabase). El archivo **no** pasa por
  la Server Action, por lo que el tope sube a **cientos de MB / GB**. Límites recomendados
  por tipo:
  - **Imágenes:** 10–15 MB, con **compresión en el cliente** antes de subir.
  - **Video:** 200 MB – 1 GB, siempre por **subida directa**.
  - **Documentos:** 25 MB.

### Implementación por fases

1. **Supabase Pro** activo (base; ya decidido).
2. **Subida directa + límites por tipo + compresión de imagen en cliente** para el bucket
   público `contenido`, detrás de variables `R2_*` (no rompe el flujo actual hasta que se
   carguen las credenciales). Los buckets privados (`adjuntos`, `identidad`,
   `digitalizacion`, `avatars`) **siguen** en Supabase con RLS.
3. **R2 + CDN de Cloudflare** como origen/entrega de lo público; se activa el *offload*
   cuando el egress de Supabase se acerque al incluido (250 GB) o el volumen público lo
   justifique.

### Otras

- Un archivo público servido por R2/CDN **no** está protegido por RLS: solo va a R2 lo que
  ya es público. La frontera público/privado se decide **por bucket**, no por archivo suelto.
- Se documenta una **tabla de proveedores** implícita: `storage` (privado, Supabase) vs
  `r2` (público, Cloudflare); el `proveedor` por archivo permite migrar sin reescribir enlaces.
- Backblaze B2 queda como **plan B** equivalente (egress libre a Cloudflare) si R2 dejara de
  convenir.
