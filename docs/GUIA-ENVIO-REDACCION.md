# Guía · Envío a Redacción — Apoyo por Venezuela

Guía del equipo **puente** entre la verificación y el contenido: toma las solicitudes
**confirmadas** y las **pasa a Redacción** para que se cuente la historia.

> Existe una versión imprimible con diagramas en PDF: `docs/GUIA-ENVIO-REDACCION.pdf`
> (se genera desde `docs/GUIA-ENVIO-REDACCION.html`). Hay además una **guía rápida de una
> página**: `docs/GUIA-ENVIO-REDACCION-FACIL.pdf`.

## 1. Qué es este equipo

**Envío a Redacción** es el puente del flujo: recoge las solicitudes que Verificación ya
**confirmó** y las **entrega a Redacción** para producir el contenido (piezas, gráficas,
videos, publicaciones). Con tu envío, el **flujo de verificación termina**.

> **En una frase:** tú aseguras que **ninguna solicitud confirmada se quede sin contar**.

## 2. Dónde encajas

`Recopilación → Verificación → `**`Envío a Redacción`**` → Redacción / contenido`.
Tu rol **no** exige segunda verificación de identidad.

> **Importante — no hay aviso automático.** El envío **no** genera notificación. Te enteras
> de lo que hay por enviar mirando tu tablero, que se **actualiza solo** (en tiempo real).
> Conviene revisarlo con frecuencia para que nada confirmado se quede esperando.

## 3. Tu módulo: «Envío a Redacción»

- **«Confirmados por enviar»** — las solicitudes ya confirmadas por Verificación, de la más
  antigua a la más nueva. Es tu **cola de trabajo**. (Vacía: «Nada pendiente por enviar».)
- **«Enviados a Redacción»** — las que ya pasaste (marcadas «Enviado a Redacción»), de la más
  reciente a la más antigua. Tu **historial**.

## 4. Cómo enviar a Redacción

1. En **«Confirmados por enviar»**, abre la solicitud y revisa que esté completa.
2. Pulsa **«Enviar a Redacción»**.
3. Confirma en el aviso: «¿Enviar «…» a Redacción?».
4. Pasa a **«Enviados a Redacción»**. El flujo de verificación terminó.

> **Reglas del envío:** solo se envían solicitudes **confirmadas** («Solo se envían casos
> confirmados»); las de **Desaparecidos** nunca pasan por aquí; y solo tu equipo (o la
> administración) puede enviar.

## 5. Entregar el material a Redacción

En cada solicitud tienes tres herramientas para pasarle la información al equipo de contenido,
y **quedan registradas** (se sabe quién copió o descargó):

- **Ver** — abre la solicitud completa para leerla.
- **Copiar** — copia el texto al portapapeles para pegarlo donde redacta el equipo.
- **Descargar** — baja un archivo de texto (`caso-NNNNN.txt`) con toda la información.

> El paso de la información a Redacción es **manual y trazable**: tú les compartes el
> material. La producción del contenido (piezas, gráficas, videos) ocurre después, en el
> módulo de contenido del equipo de Redacción, Diseño y Redes.

## 6. Tu alcance: qué sí y qué no

**Sí puedes:** enviar a Redacción las solicitudes confirmadas; ver, copiar y descargar la
información (queda registrado); editar los datos de una solicitud confirmada o enviada.

**No te corresponde:** crear ni verificar solicitudes; enviar algo **no confirmado** o de
**Desaparecidos** (la app lo impide); **eliminar** solicitudes (solo administración).

## 7. Blindaje y buenas prácticas

- **Datos sensibles y menores (NNA):** apellidos ocultos salvo a administración; archivos
  privados. Al copiar o descargar, maneja la información con cuidado: compártela solo por los
  canales del equipo y no la publiques tal cual sin el trabajo de Redacción.
- **Revisa el tablero seguido** (no hay aviso); **envía lo que esté listo** (si falta algo,
  avisa a Verificación); atiende primero **lo más antiguo**; usa «Copiar/Descargar» (auditado)
  en vez de reescribir a mano.

---

### Nota técnica (para desarrollo)

Rol `redaccion` («Envío a Redacción»), grupo `redaccion` («Redacción»). Módulo
`/envio-redaccion`: listas «Confirmados por enviar» (estado `confirmado`) y «Enviados a
Redacción» (`enviado_redaccion`). Botón «Enviar a Redacción» → RPC `enviar_caso_redaccion`
(solo `redaccion`/admin, solo confirmados, no Desaparecidos). Sin puerta de 2ª verificación;
sin notificación en el envío (el tablero refresca en tiempo real). El pipeline de contenido
`/contenido` (`piezas_contenido`) es un módulo aparte.
