# UnidosXVenezuela — Documento del proyecto

**Funciones y características, en detalle.**
Documento de referencia para el equipo, organizadores, aliados y colaboradores nuevos.

> **Qué es en una frase:** una plataforma web (y pronto móvil) para **coordinar la respuesta al terremoto de Venezuela**: registrar información, verificarla, convertirla en contenido y publicarla, además de organizar equipos, tareas y centros de acopio, cuidando siempre los datos sensibles.

---

## 1. Resumen ejecutivo

UnidosXVenezuela es una herramienta de coordinación humanitaria pensada para que **decenas o cientos de voluntarios** trabajen ordenados, sin depender solo de chats sueltos de WhatsApp. Reúne en un mismo lugar:

- **Personas y roles:** cada quien entra con su cuenta, tiene un rol (o varios) y ve solo lo que le corresponde.
- **Un flujo claro de la información:** de un reporte sin confirmar hasta una publicación verificada, paso a paso.
- **Equipos (grupos):** por área de trabajo, con su chat, pizarra, videollamadas y anuncios.
- **Tareas:** abiertas para sumar gente, o asignadas para lo delicado.
- **Centros de acopio y mapa:** qué se necesita y dónde.
- **Seguridad por diseño:** la base de datos decide quién puede ver y hacer cada cosa; los datos sensibles se cuidan por niveles.

Está alineada con el modelo de **clústeres humanitarios (OCHA)** y prioriza ser **fácil de usar**: *si sabes usar WhatsApp, puedes usar esto.*

---

## 2. Contexto y propósito

La emergencia por el terremoto genera una avalancha de información (personas desaparecidas, refugios, necesidades de salud, niños en riesgo, acopio) que llega por muchos canales y de calidad desigual. Sin coordinación, esa información se duplica, se pierde o se difunde sin verificar.

El propósito de la plataforma es **convertir el caos en trabajo ordenado y confiable**:

1. **Recopilar** información de forma estructurada.
2. **Verificarla** antes de actuar o publicar.
3. **Producir contenido** claro para difundir (texto, gráficas, video).
4. **Publicarlo** por los canales oficiales del equipo.
5. **Coordinar** a las personas, las tareas y los recursos físicos (acopio) alrededor de todo eso.

La emergencia también es de **salud mental**; la plataforma permite crear equipos dedicados (por ejemplo, apoyo psicosocial) que se coordinan con la misma infraestructura de grupos.

---

## 3. Principios de diseño

- **Bajar la barrera de entrada.** Interfaz simple, en español neutro, con acciones rápidas y guías dentro de la app.
- **La seguridad es la fuente de verdad.** Los permisos viven en la base de datos (RLS), no solo en la pantalla: aunque alguien conozca un atajo, no puede ver ni hacer lo que no le toca.
- **Lo sensible se asigna; lo masivo se abre.** El trabajo delicado (datos personales, salud, legal) va a personas verificadas; el trabajo paralelizable se deja abierto para sumar gente.
- **Cada rol, su espacio.** Nadie se pierde en pantallas que no usa: el menú muestra solo lo de su rol.
- **Cuidar a las personas.** Niveles de sensibilidad de la información, verificación de cuentas y auditoría de acciones importantes.

---

## 4. Perfiles y roles

Cada persona tiene un **rol principal** y puede sumar **roles adicionales** (por ejemplo, verificar *y* redactar). Los permisos se evalúan sobre el **conjunto** de roles. El **administrador tiene acceso total**.

| Rol | Para qué sirve | A qué grupos entra |
|-----|----------------|--------------------|
| **Voluntario** | Toma tareas abiertas y registra sus horas. | Abiertos (solo); privados, por invitación. |
| **Observador** | Solo mira; no toma tareas ni publica. | Ve los abiertos; no se une. |
| **Líder de grupo** | Gestiona su grupo (miembros, tareas, anuncios, pizarra). | Los abiertos + el/los grupos que lidera. |
| **Coordinador** | Coordina la operación: tareas, grupos, verifica usuarios, ve todo el flujo. | Todos (también privados). |
| **Administración (admin)** | Acceso total: aprueba usuarios, asigna roles, gestiona todo. | Todos (también privados). |
| **Recopilación** | Reporta información (casos) para que se verifique. | Abiertos + su espacio de Recopilación. |
| **Verificación** | Revisa los casos reportados y los confirma o descarta. | Abiertos; entra al módulo de casos. |
| **Redacción** | Escribe el contenido de los casos confirmados. | Abiertos + su espacio de Redacción. |
| **Diseño Gráfico** | Crea las piezas gráficas. | Abiertos + su espacio de Diseño. |
| **Edición de Videos** | Edita los videos / reels. | Abiertos + su espacio de Edición. |
| **Redes Sociales** | Publica el contenido final. | Abiertos + su espacio de Redes. |
| **Líder de plataforma aliada** | Accede a la base de datos compartida de aliados. | Abiertos; + datos de aliados. |

Además del rol, cada persona registra sus **habilidades** (redacción, diseño, logística, primeros auxilios, etc.), para que la coordinación sepa en qué puede ayudar mejor.

> **Superadministrador:** un rol especial (el dueño/os de la plataforma). Es el único que puede crear o cambiar administradores y gestionar a otros superadministradores.

---

## 5. El flujo de trabajo (de la información a la publicación)

El corazón de la plataforma es un flujo con etapas claras. En el Panel y en las secciones de Verificación y Contenido se ve una **tira con los números en vivo** de cada etapa.

```
Recopilación → Verificación → Confirmado → Redacción → Diseño / Video → Redes → Publicado
```

1. **Recopilación** reporta un caso (información sin confirmar).
2. **Verificación** lo revisa: lo **confirma** (es real) o lo marca **falso / resuelto**.
3. Un caso **confirmado** se **envía a Redacción**.
4. **Redacción** escribe y decide el destino: **Diseño** o **Video**.
5. **Diseño / Video** crea la pieza y la pasa a **Redes**.
6. **Redes** la **publica**. ✅

Cada traspaso de etapa **avisa automáticamente** al equipo siguiente (campana de notificaciones).

**¿Qué rol se necesita primero?** *Recopilación* — es quien alimenta el flujo. Para que se mueva de verdad, hace falta también *Verificación* (que confirma y destraba Redacción). Orden natural de arranque: Recopilación → Verificación → Redacción → Diseño/Video → Redes.

---

## 6. Funcionalidades en detalle

### 6.1 Acceso y cuentas

- **Inicio de sesión con correo o con WhatsApp.** Quien no tiene correo puede entrar con su **número de WhatsApp** y una contraseña (el sistema le crea un acceso interno derivado del número).
- **Registro** con verificación posterior: las cuentas nuevas quedan **pendientes** hasta que un administrador las **verifica**. Se avisa por correo cuando queda lista (si el correo está configurado).
- **Recuperación y cambio de contraseña** por la propia persona.
- **Protección anti-bot** opcional (captcha) en el acceso.

### 6.2 Perfil y habilidades

- Foto (avatar), nombre, teléfono, **WhatsApp**, organización.
- **Habilidades**: fortalezas de una lista sugerida o escritas a mano; se muestran junto al rol.
- Cambio de contraseña. A las cuentas creadas por WhatsApp se les muestra su número como forma de acceso (en vez del correo interno).

### 6.3 Administración de usuarios (coordinación / admin)

- **Aprobar** solicitudes de registro (verificar).
- **Crear un usuario** ya verificado: con **correo o WhatsApp**, rol, organización, **grupo** (opcional, lo suma de una vez) y contraseña temporal.
- **Importar por lote:** pegar una lista (número y/o correo + nombre), elegir rol y grupo, y crear **todas las cuentas de una vez**. El resultado muestra, por persona, la contraseña temporal (**Copiar clave**) y un botón **Enviar** que abre WhatsApp con el mensaje de acceso listo.
- **Asignar el rol** principal y **roles adicionales**.
- **Restablecer la contraseña** de un usuario no administrador (solo administradores): se genera una temporal y se envía **solo al correo de la persona** (el admin no la ve). Auditado.
- **Plataformas aliadas (doble aprobación):** otorgar el rol de líder aliado requiere **2 administradores** (o 1 superadmin).
- **Áreas** (catálogo de clústeres) y **Registro de actividad** (auditoría de acciones importantes).

### 6.4 Grupos y colaboración

- **Grupos por área** (salud, protección, gestión de información, comunicaciones, etc.).
- **Abiertos** (cualquier persona verificada los ve y se une sola) o **privados** (solo sus miembros; alta por invitación).
- Dentro de cada grupo:
  - **Miembros** y **líder** (se puede nombrar/cambiar).
  - **Anuncios fijados** (con adjuntos: imagen o archivo).
  - **Videollamadas** programadas; el enlace se habilita **solo mientras la reunión está activa**.
  - **Pizarra** de dibujo/lluvia de ideas (lienzo colaborativo, se guarda solo y se ve en vivo).
  - **Tareas del grupo**.
  - **Enlace de WhatsApp** del grupo (validado).
  - **Vetar / desvetar** miembros (líder o coordinación).
- **Supervisión:** coordinación y admin pueden **entrar a cualquier grupo** —también privado del que no son miembros— para revisar cómo va; la plataforma lo indica con un aviso de supervisión.
- **Asignar roles de contenido desde el grupo:** un líder (o coordinación) puede sumar a un voluntario —o a sí mismo— a la cadena de contenido (recopilación → … → redes), sin poder tocar a otros mandos.

### 6.5 Espacios de trabajo por rol

Cada rol de recopilación/producción tiene su **sección propia** para manejar su parte del flujo, sin mezclarse con el tablero general:

- **Tu cola en tu etapa:** solo las piezas que te toca trabajar ahora.
- **Tu equipo a la mano:** enlaces a tu grupo, su pizarra y su chat.
- **Recopilación:** botones para reportar un caso y ver casos.
- Cada persona queda **automáticamente** en el espacio (grupo privado) de su rol, y se ajusta al cambiar de rol.

### 6.6 Verificación de casos

- **Reportar un caso** (recopilación): título, categoría, descripción y **fuente**. Al escribir, avisa de **posibles duplicados**.
- **Categorías** de caso (desaparecidos, niños, refugio, alimentación, salud, otras informaciones relevantes, etc.).
- **Estados:** *en proceso* → *confirmado y activo* → o *falso / resuelto*.
- **Asignar** el caso a un verificador; filtros por sub-área y aviso cuando un caso lleva demasiado tiempo sin avanzar.
- **Enviar a Redacción** cuando queda confirmado.
- **Borrar un caso:** solo un administrador (con doble confirmación).

### 6.7 Producción de contenido

- **Tablero por etapas** (Redacción → Diseño/Video → Redes → Publicado). Cada quien trabaja **su** etapa.
- Abrir una pieza para **escribir/cargar el entregable**, **asignarla** y **avanzarla**.
- **Subida de archivos** (la pieza final) a almacenamiento privado.
- **Notificaciones automáticas** de traspaso: al avanzar, el equipo siguiente recibe aviso.
- Para el día a día, cada rol usa su **Espacio de trabajo** (más enfocado); el tablero completo es la visión general de coordinación.

### 6.8 Tareas

- **Tareas abiertas** (cualquiera las toma) y **asignadas** (para trabajo sensible o crítico).
- **Cupos:** algunas admiten varias personas.
- **Prioridad** (crítica/alta/media/baja), **estado**, **vencimiento**, **categoría** y **ubicación** opcional.
- **Comentarios** y **entregables**; coordinación o el líder la dan por completada.
- Se muestran en **tarjetas** amigables, con actualización en **tiempo real**.

### 6.9 Centros de acopio

- Registrar puntos: **qué necesitan**, capacidad, horario, contacto y **ubicación en el mapa**.
- **Urgencia** (alta/media/baja) que los pinta de color.
- Un **administrador** puede asignar uno o varios **coordinadores responsables** por punto.

### 6.10 Mapa

- Muestra los **centros de acopio** coloreados por urgencia y las **tareas con ubicación**.

### 6.11 Tablón

- Mensajes y anuncios para el equipo con **niveles de sensibilidad** (pública, interna, restringida, confidencial), para compartir cuidando los datos.

### 6.12 Mis horas

- Cada persona registra sus **horas de voluntariado**, que suman al total de la comunidad visible en el Panel.

### 6.13 Notificaciones

- **Campana 🔔** con avisos: cuando te asignan algo, cuando una pieza llega a tu etapa o hay novedades. Página dedicada para verlas y marcarlas como leídas.

### 6.14 Plataformas aliadas

- Base de datos **compartida de contactos/endpoints aliados**, con acceso restringido y otorgado por **doble aprobación** de administradores.

### 6.15 Ayuda

- **Guía de uso dentro de la app** (por rol y por sección), con primeros pasos, el flujo completo y un “paso a paso” de lo más común.

---

## 7. Seguridad y protección de datos

- **RLS (Row Level Security) como fuente de verdad.** Cada tabla define quién puede leer/escribir; la interfaz nunca es el único control.
- **Funciones de permiso centralizadas** (SECURITY DEFINER) que evalúan el conjunto de roles del usuario.
- **Protección anti auto-escalada:** nadie puede cambiarse el rol a sí mismo; conceder “admin” exige superadmin; el rol de aliado solo se otorga por el flujo de doble aprobación.
- **Clave de servicio (service_role) solo en el servidor**, nunca en el navegador.
- **Niveles de sensibilidad** en el Tablón y manejo cuidadoso de datos personales.
- **Auditoría:** se registran las acciones importantes (crear/verificar usuarios, cambios de rol, restablecer contraseñas, etc.).
- **Archivos** en almacenamiento privado con enlaces firmados de vida corta.

---

## 8. Experiencia de usuario (UX)

- **Español neutro** en todo el dominio y la interfaz.
- **Panel de inicio por rol:** saludo, acciones rápidas, la tira del flujo con conteos en vivo y un resumen personal.
- **Tarjetas** claras en tareas, grupos, casos y piezas; **estados vacíos guiados** que dicen qué hacer a continuación.
- **Sonidos de interfaz** suaves (con interruptor) y **avisos (toasts)** discretos.
- **Tiempo real** en varias vistas (tareas, grupos, pizarra, anuncios).
- **PWA:** funciona en el teléfono como una app; menú lateral colapsable; tablas que se deslizan de lado.

---

## 9. Arquitectura y tecnología

- **Monorepo** con **pnpm + Turborepo**, **TypeScript** estricto.
- **Web:** **Next.js 14** (App Router, PWA). Lecturas en el servidor; cambios mediante *Server Actions*.
- **Backend/datos:** **Supabase** — Postgres + Auth + Storage + Realtime. La lógica de permisos vive en el esquema SQL y sus políticas.
- **Móvil:** **Expo / React Native** (en desarrollo; se busca paridad con la web).
- **Correo transaccional:** Resend (opcional; si no está configurado, la app no se rompe).
- **Despliegue:** la web en Vercel (producción con dominio propio); la base de datos y las migraciones en Supabase.
- **Estructura del repositorio:**
  - `apps/web` — aplicación web.
  - `apps/mobile` — aplicación móvil.
  - `packages/` — tipos y cliente de Supabase compartidos.
  - `supabase/migrations` — esquema, políticas (RLS), realtime, triggers y semillas.
  - `docs/` — documentación del proyecto.

---

## 10. Estado actual y hoja de ruta

**Funcionando (web):** acceso (correo o WhatsApp), perfiles y habilidades, multi-rol, administración de usuarios (crear, importar por lote, verificar, roles, roles adicionales, restablecer contraseña), grupos y colaboración (pizarra, videollamadas, anuncios, vetados, supervisión), espacios de trabajo por rol, verificación de casos, producción de contenido con notificaciones de traspaso, tareas, centros de acopio con responsables, mapa, tablón con sensibilidad, horas, notificaciones, plataformas aliadas y ayuda dentro de la app.

**Próximos pasos (ideas):**

- **Paridad móvil** (Expo) y **notificaciones push**.
- **Mapa** con más capacidades geoespaciales.
- **Modo offline** para trabajo en terreno.
- **Digitalización con IA** de listados de personas (revisión línea por línea con resalte de incongruencias) — en evaluación.
- **Pruebas de políticas RLS** y automatizaciones de calidad (CI).
- **Exportar la auditoría** y reportes.

---

## 11. Licencia

El proyecto es **software libre** bajo la **GNU Affero General Public License v3.0 (AGPL-3.0)**. Cualquiera puede usarlo, estudiarlo, modificarlo y compartirlo; y **quien lo despliegue como servicio debe ofrecer su código fuente**, para que las mejoras vuelvan a la comunidad y la plataforma humanitaria siga abierta para todos.

---

## 12. Glosario

- **Caso:** una unidad de información reportada (p. ej. una persona desaparecida) que sigue el flujo hasta publicarse o descartarse.
- **Pieza:** el contenido en producción (texto, gráfica o video) derivado de un caso confirmado.
- **Grupo abierto / privado:** abierto = cualquiera verificado se une; privado = solo miembros, por invitación.
- **Espacio de trabajo:** la sección propia de un rol para su parte del flujo, con su cola y su equipo a la mano.
- **Clúster / área:** agrupación de trabajo al estilo del modelo humanitario de OCHA.
- **RLS:** reglas en la base de datos que deciden quién puede ver y hacer cada cosa.
- **Verificado:** cuenta aprobada por un administrador; requisito para operar.

---

*Documento vivo: se actualiza a medida que la plataforma evoluciona. Para el “cómo se usa” paso a paso, ver [GUIA-DE-USO.md](GUIA-DE-USO.md); para las funciones de cada rol al asignar, ver [ROLES.md](ROLES.md).*
