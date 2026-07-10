# Guía · Recopilación y Gestión de la Información — Apoyo por Venezuela

Guía del equipo que convierte cada información que llega en una **solicitud con
ubicación**, verificable y accionable, con el modelo del **circuito de ayuda**.

> Existe una versión imprimible con diagramas en PDF: `docs/GUIA-RECOPILACION.pdf`
> (se genera desde `docs/GUIA-RECOPILACION.html` con Chromium).

## 1. Qué es este equipo

El equipo de **Recopilación y Gestión de la Información** es la **puerta de
entrada** de la plataforma: recibe información dispersa (redes, contactos,
terreno) y la convierte en una **solicitud clara, ubicada y con fuente**, lista
para que **Verificación** la valide y siga el flujo. **Recopila** (ordena lo que
llega), **ubica** (un pin en el mapa) y **da fuente** (de quién viene y cuándo).

> **En una frase:** ustedes no verifican ni entregan — ustedes **reportan bien**.
> Una solicitud completa, ubicada y con fuente y contacto avanza rápido y sin ruido.

> **Cambio importante (jul 2026):** ya **no** se clasifica el tipo de caso ni se
> hace búsqueda de personas ni digitalización. **Toda** información es una
> «**solicitud con ubicación**». En el menú la sección se llama ahora **«Solicitudes»**.

## 2. El circuito de ayuda — las 6 preguntas

Cada solicitud responde **seis preguntas**. Si las seis están completas, la
información es útil y verificable:

| # | Pregunta | Campo en la app |
| --- | --- | --- |
| 1 | **¿Qué es?** | Título + «¿Qué se necesita o qué se ofrece?» (descripción) |
| 2 | **¿Cuándo?** | «¿Cuándo se publicó o confirmó?» |
| 3 | **¿Fuente?** | «¿Quién es la fuente?» + «Enlace de la fuente» |
| 4 | **¿Responsable?** | «¿Quién es el responsable o referente?» (contacto) |
| 5 | **¿Dónde?** | Ubicación de la solicitud (pin en el mapa) |
| 6 | **¿Qué se necesita?** | Tipo · Urgencia · Cantidad estimada |

## 3. Antes de empezar: tu acceso

Para reportar solicitudes necesitas pertenecer al grupo **«Recopilación y Gestión
de la Información»** y tener aprobada tu **segunda verificación de identidad**:

1. La administración (o el líder) **te suma al grupo** (no hay auto-inscripción).
2. Completas la **2ª verificación de identidad** en **«Verificación»** (selfie + documento).
3. Un **administrador la aprueba** (nadie se auto-aprueba).
4. Ya ves y creas **Solicitudes**; recibes un aviso al quedar aprobada.

> Si aún no ves «Solicitudes» o aparece «Completa tu segunda verificación», falta
> el paso 2 o el 3. Lo exige la seguridad de la base de datos (RLS): no es un error de pantalla.

## 4. Cómo crear una solicitud, paso a paso

Menú **«Solicitudes» → «Nueva solicitud»**. Cada campo responde una pregunta del
circuito; al final, **«Crear solicitud»**.

- **Título** *(obligatorio)* — resumen corto y claro. Al escribir, la app avisa de **posibles duplicados**.
- **¿Qué se necesita o qué se ofrece?** — descripción concreta, clara y actualizada.
- **¿Cuándo se publicó o confirmó?** — la fecha (idealmente dentro de las últimas 48 h).
- **¿Quién es la fuente?** — red oficial, persona, grupo o contacto directo.
- **Enlace de la fuente** *(opcional)* — URL de respaldo; la app revisa que sea segura.
- **¿Quién es el responsable o referente?** — teléfono, WhatsApp, organización o punto de contacto.
- **¿Dónde ocurre?** *(obligatorio)* — toca o arrastra el **pin** en el mapa. Sin ubicación no se guarda.
- **¿Qué se necesita? (tipo)**, **Urgencia** (por defecto «media») y **Cantidad estimada** *(opcional)*.
- **Adjuntar archivos** *(opcional)* — capturas, fotos o documentos (hasta 10 MB c/u, máx. 10).

> **Consejo de calidad:** antes de crear, revisa que esté **completa**, con
> **contactos correctos**, **ubicación clara** y **enlace de la fuente**. Ahorra idas y vueltas.

## 5. La regla de las 48 horas

La información debe haberse **publicado o confirmado en las últimas 48 horas**. La
ayuda cambia rápido: un dato viejo puede enviar recursos a donde ya no hacen falta.
En la lista, las solicitudes de más de 2 días muestran una etiqueta **«+2 días»**.
Si el dato es más viejo pero sigue vigente, **confírmalo de nuevo** con la fuente y
usa la fecha de esa confirmación.

## 6. El ciclo de vida de una solicitud

Tú la creas; **otros equipos** la mueven de estado:

| Estado | Qué significa |
| --- | --- |
| **Pendiente** | Todavía no lo ha tomado nadie; está pendiente de revisión. |
| **En proceso** | Alguien ya lo tomó y lo está revisando. |
| **Confirmado y activo** | La información fue validada; el equipo de Envío a Redacción lo tomará. |
| **Falso / descartado** | La información es falsa, antigua o ya resuelta. No continúa en el flujo. |
| **Enviado a Redacción** | La solicitud pasó a Redacción: el flujo de verificación terminó. |
| **Resuelto / atendido** | La ayuda se entregó (Logística) y la solicitud quedó atendida. Ciclo cerrado. |

Recorrido: **Recopilación crea** → *Pendiente* → **Verificación toma** → *En
proceso* → **Verificación confirma o descarta** → *Confirmado* / *Falso* → **Envío
a Redacción** → *Enviado a Redacción*; en paralelo, lo confirmado que llega a
**Logística** termina en *Resuelto*.

> **Tu alcance como Recopilación:** tú **creas** la solicitud. **No** la confirmas,
> descartas ni cambias de estado — eso es de Verificación. Sí puedes **editar tu
> propia solicitud** mientras esté **Pendiente** o **En proceso** (todo cambio queda registrado).

## 7. Quién hace qué

| Equipo / rol | Qué hace con la solicitud |
| --- | --- |
| **Recopilación** *(tú)* | Reporta la solicitud con ubicación y fuente. Edita la suya mientras está pendiente/en proceso. **No** cambia estados. |
| **Verificación** | Toma la solicitud, la revisa y la **confirma** o la **descarta** (con motivo). |
| **Envío a Redacción** | Toma las confirmadas y las **envía a Redacción**. |
| **Logística y Acopio** | Atiende las solicitudes de insumo derivadas y, al entregar, las deja **resueltas**. |
| **Administración** | Ve todo, aprueba verificaciones de identidad y puede editar o eliminar solicitudes. |

## 8. Blindaje y buenas prácticas

- **Datos sensibles y menores (NNA):** los **apellidos** se ocultan salvo a la
  administración; los **avisos** (campana, push, Telegram) son **discretos** (sin
  detalle); los **archivos** son privados (enlaces temporales); y el **mapa
  público** solo muestra puntos ya confirmados, sin datos personales. Una solicitud
  **nunca** es de tipo «desaparecidos».
- **Revisa duplicados** — si aparece el aviso de «posibles duplicados», ábrelos antes de crear.
- **Cuida los enlaces** — la app marca enlaces inseguros o peligrosos; si te avisa, busca otra fuente.
- **Fuente y responsable claros** — sin ellos, Verificación no puede validar.
- **Archivos de respaldo** — se aceptan imágenes, PDF y ofimática; no ejecutables.
- **Contactos:** «fuente» y «responsable» son **texto libre** (teléfono, WhatsApp,
  organización…). No hay formato obligatorio: escríbelos completos y verificables.

## 9. Avisos que envías y recibes

Los avisos llegan por tres vías a la vez: la **campana** in-app («Avisos»), las
**notificaciones del navegador** (push) y **Telegram** (si la persona lo vinculó).

- **Envías (automático):** al crear una solicitud, **Verificación recibe** «Nuevo
  caso por verificar». Se dispara solo.
- **Recibes:** cuando Verificación decide, te llega «**Tu caso fue confirmado**» o
  «**Tu caso fue descartado**».

> **Recomendación:** vincula tu **Telegram** desde tu perfil (botón «Telegram» en
> la barra superior, junto a «Consejos») para enterarte al instante.

## 10. Preguntas frecuentes

- **No veo «Solicitudes».** Falta pertenecer al grupo o tener aprobada la 2ª
  verificación de identidad.
- **No puedo confirmar mi solicitud.** Correcto: Recopilación solo reporta; confirma Verificación.
- **Me equivoqué en un dato.** Edítala mientras esté *Pendiente* o *En proceso*; si
  ya avanzó, pídelo a Verificación o a la administración.
- **¿Desapariciones o datos de menores?** No por aquí: ese flujo se retiró. Sigue el
  protocolo que indique la coordinación.
- **La información es de hace 3 días.** Confírmala de nuevo con la fuente y usa esa fecha.

---

### Nota técnica (para desarrollo)

- Grupo del sistema `gestion_casos` → rol funcional `recopilacion` («Recopilación»).
  Nombre visible «Recopilación y Gestión de la Información» (migración `0135`).
- Sección «Solicitudes» = `/casos`. Alta en `/casos/nuevo` (`crearCaso`), categoría
  fija `'Otras informaciones'`, `es_requerimiento` + ubicación obligatoria, campo
  `contacto` (migración `0137`).
- Estados `EstadoCaso`: `pendiente · en_proceso · confirmado · falso ·
  enviado_redaccion · resuelto`. Recopilación **solo crea** (`puedeRecopilar`); el
  paso a Redacción lo hace el equipo `redaccion` (RPC `enviar_caso_redaccion`).
- Puerta de **2ª verificación** de identidad (`identidad_aprobada()`) impuesta por
  RLS para crear y ver solicitudes; `recopilacion ∈ ROLES_SEGUNDA_VERIFICACION`.
- Módulos de **Búsqueda de personas** y **Digitalización** desactivados (migración
  `0138`), retirados del menú.
