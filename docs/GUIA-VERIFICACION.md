# Guía · Verificación — Apoyo por Venezuela

Guía del equipo que **valida** cada solicitud: la revisa y decide si se **confirma** o se
**descarta**. Es el filtro de calidad de la plataforma.

> Existe una versión imprimible con diagramas en PDF: `docs/GUIA-VERIFICACION.pdf`
> (se genera desde `docs/GUIA-VERIFICACION.html`). Hay además una **guía rápida de una
> página**: `docs/GUIA-VERIFICACION-FACIL.pdf`.

## 1. Qué es este equipo

**Verificación** es el filtro de calidad: recibe las solicitudes que crea Recopilación y
decide, con criterio, cuáles son **reales, vigentes y bien documentadas**. Lo que confirmas
avanza; lo que descartas sale del flujo con un motivo registrado.

> **En una frase:** tú no reportas ni entregas — tú **decides qué es verdad**.

## 2. Dónde encajas

`Recopilación → `**`Verificación`**` → Envío a Redacción → Redacción / Logística`.
Recibes lo que Recopilación reporta y lo dejas listo para Envío a Redacción (y, si es una
solicitud de insumo, para Logística).

> Tu rol **no** exige segunda verificación de identidad: con tu cuenta verificada y el rol
> de Verificación ya puedes trabajar el tablero de Solicitudes.

## 3. Tu tablero: «Solicitudes»

- **Indicadores:** Total · Pendientes (sin tomar) · En proceso · Confirmados y activos · Falsos / resueltos.
- **Filtros:** búsqueda por título/descripción/fuente, y filtros por **Estado** y **Categoría**.
- **Señales:** la etiqueta **«+2 días»** marca lo antiguo; «Tomado por…» indica quién lo trabaja.
- **«Listos para redacción»:** abajo verás las solicitudes ya confirmadas y activas. No
  aparece «Nueva solicitud»: crear es tarea de Recopilación.

## 4. La decisión: confirmar o descartar

Abre la solicitud, pulsa **«Tomar solicitud»** (pasa a **En proceso** y queda a tu nombre) y decide:

1. **¿Real, vigente, con fuente y ubicación clara?**
2. **Sí →** botón **«Confirmar solicitud»** → estado **Confirmado y activo** (luego lo toma Envío a Redacción / Logística).
3. **No →** botón **«Descartar (falso)»** → estado **Falso**. **Requiere un motivo**; si lo
   dejas vacío, la app te detiene: «Indica el motivo para descartar la solicitud.» El motivo
   queda guardado en la solicitud.

### Antes de confirmar, revisa

Fuente confiable · ubicación clara (el pin corresponde) · contacto/responsable · vigencia
(48 h o reconfirmada) · que no sea duplicado · enlace no marcado como peligroso. **Ante la
duda, deja una nota y mantén «En proceso»**: confirmar es afirmar que es verdad.

## 5. Tu alcance: qué sí y qué no

**Sí puedes:** tomar, confirmar y descartar (con motivo) «Otras informaciones»; editar datos
y dejar notas mientras la solicitud no esté enviada a Redacción; **derivar a Logística** las
solicitudes de insumo confirmadas.

**No te corresponde:** **crear** solicitudes (Recopilación — no verás «Nueva solicitud»);
**enviar a Redacción** (lo hace el equipo de Envío a Redacción); tocar casos de
**Desaparecidos** (ese flujo se retiró); **eliminar** (solo administración).

> El estado «Enviado a Redacción» está **bloqueado para ti** a propósito: el selector avanzado
> no lo ofrece y, si se intenta, la app avisa «El paso a Redacción lo hace el equipo de Envío
> a Redacción». Una solicitud ya enviada se muestra bloqueada.

## 6. Avisos que recibes y disparas

- **Recibes:** «**Nuevo caso por verificar** — Llegó un caso nuevo para verificar. Ábrelo para revisarlo.»
- **Disparas (automático):** al confirmar o descartar, el **reportante** recibe «Tu caso fue
  confirmado» o «Tu caso fue descartado». No haces nada extra.

> Vincula tu **Telegram** (botón en la barra superior) para que te lleguen al instante las
> solicitudes nuevas por verificar.

## 7. Blindaje y buenas prácticas

- **Datos sensibles y menores (NNA):** apellidos ocultos salvo a administración; avisos
  discretos; archivos privados. Una solicitud **nunca** es de «desaparecidos».
- Confirma con el **mismo criterio** siempre; **explica el descarte** (ayuda a quien reportó);
  ante la duda, deja **nota** y mantén «En proceso»; no copies datos personales fuera de la
  plataforma.

---

### Nota técnica (para desarrollo)

Rol `verificador` («Verificación»), grupo `verificacion` («Verificación de información»).
`puedeVerificar = ['admin','verificador']`; **sin** puerta de 2ª verificación. Acciones en
`/casos`: `tomarCaso` → `en_proceso`, `cambiarEstadoCaso` (`confirmado`), `descartarCaso`
(`falso`, con motivo). Bloqueado el paso a `enviado_redaccion` (guard + RLS + selector).
Área de admin: `admin_verificacion` («Administración · Verificaciones»).
