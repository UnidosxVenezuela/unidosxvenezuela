# Guía · Logística y Acopio — Apoyo por Venezuela

Guía de **roles, grupos, herramientas y flujo de trabajo** del área que conecta las
solicitudes de ayuda con el mapa, los centros de acopio y la respuesta con insumos:
**casos → mapa → acopio → insumos**.

> Existe una versión imprimible en PDF: `docs/GUIA-LOGISTICA-ACOPIO.pdf`.

## 1. Qué es esta área

Reúne todo lo necesario para que una **solicitud de ayuda con ubicación** se convierta en una
**entrega coordinada y trazable**. Cubre cuatro herramientas encadenadas:

- **Casos** — un vecino/equipo reporta una necesidad con lugar (un hospital sin insumos, un
  refugio sin agua…) marcada **en el mapa**.
- **Mapa** — muestra esas solicitudes georreferenciadas y los centros de acopio, para ver dónde
  falta qué.
- **Acopio** — los centros de recolección: inventario en tiempo real, donaciones, traspasos y
  necesidades.
- **Insumos (Logística)** — la cola de solicitudes derivadas: se atiende cada una desde el centro
  más cercano con stock, hasta la entrega.

> **Principio:** la **RLS** (seguridad a nivel de base de datos) hace valer quién puede ver y hacer
> cada cosa. Aunque alguien manipule la pantalla, no puede hacer lo que su rol no permite. Esta área
> **no** maneja datos confidenciales de víctimas (eso vive en Verificación/Búsqueda), por lo que
> **no** exige segunda verificación de identidad.

## 2. Roles y quién hace qué

| Rol | Alcance | Qué puede hacer |
| --- | --- | --- |
| **Administrador general** | Toda la plataforma | Acceso total. Crea el área, nombra al admin de Logística, y ve todo. |
| **Admin · Logística y Acopio** ⭐ *(nuevo)* | Toda el área de logística | **Administra el grupo «Gestión de Acopio»** (miembros y líder). **Opera todos los centros** de acopio (inventario, donaciones, traspasos, necesidades) y **todos los insumos**. Ve la **capa del mapa**. **Aprueba los registros** de su área. **No** es admin general: no toca casos de verificación/desaparecidos, contenido ni psicosocial. |
| **Logística** | Todos los centros e insumos | Gestiona cualquier centro y atiende la cola de insumos (asignar, en ruta, entregar). Ve el panel global de necesidades y el mapa. |
| **Coordinador responsable de centro** | El/los centro(s) asignados | Lo asigna el admin. Control total de su centro: ingresar y descontar stock, fijar conteos, registrar donaciones y salidas, traspasar, marcar y resolver necesidades. |
| **Creador del centro** | El centro que registró | Gestiona por completo el punto que abrió en terreno, aunque no tenga rol de logística. |
| **Voluntario de acopio** | El/los centro(s) asignados | **Solo suma**: registra entradas y donaciones desde el teléfono (con el QR del centro). No descuenta, no fija conteos, no elimina. |
| **Recopilación / Verificación** *(área vecina)* | Casos | Alimentan el flujo: Recopilación **reporta** la solicitud con ubicación; Verificación la **confirma** y la **deriva a Logística**. No operan acopio. |

> **El nuevo admin de área en una frase:** es el «jefe de Logística y Acopio». Coordina a todo el
> equipo de logística y todos los centros sin ser administrador general — igual que ya existen los
> admin de *Verificaciones* y de *Redes Sociales* para sus áreas.

## 3. Grupos

- **Gestión de Acopio** — grupo del sistema. Clave `gestion_acopio`, rol `logistica`. Es el grupo
  de coordinación del área: quien entra a él obtiene el rol **Logística**. El **admin de Logística**
  administra sus miembros y su líder, y lo supervisa.
- **Centros de acopio** — cada punto de recolección es una **entidad propia** (no un grupo): tiene
  ubicación en el mapa, contacto, horario, capacidad, inventario y **responsables** (coordinadores y
  voluntarios). El liderazgo de un centro se define por **datos** (creador + responsables asignados),
  no por un rol global.

## 4. Herramientas (qué hay en cada pantalla)

| Herramienta | Para qué sirve |
| --- | --- |
| **Mapa** `/mapa` | Solicitudes de ayuda con ubicación + centros de acopio en un solo mapa. |
| **Centros de acopio** `/acopio` | Lista y panel de centros. Crear un centro, ver su ficha y el **panel global de necesidades**. |
| **Ficha del centro** `/acopio/[id]` | Inventario en tiempo real (producto, categoría, unidad, cantidad, mínimo de alerta), **QR del centro**, donaciones, traspasos, salidas, necesidades y bitácora. Importar por CSV; capacidad de albergue (camas). |
| **Necesidades** `/acopio/necesidades` | Panel que reúne, por prioridad, todo lo que falta en la red. |
| **Etiquetas / Imprimir** `/acopio/[id]/etiquetas · /imprimir` | Etiquetas QR por producto y exportar/imprimir el inventario (CSV/PDF). |
| **Insumos** `/insumos` | La cola de **solicitudes de insumo** (incluye las derivadas de casos): solicitado → en ruta → entregado. |
| **Solicitud de insumo** `/insumos/[id]` | Detalle, enlace al caso de origen y **centros cercanos con stock** sugeridos. |
| **Proveedores · Donaciones** `/insumos/proveedores · /donaciones` | Catálogo de proveedores y registro de donaciones que entran al inventario. |

## 5. Flujo de trabajo · de la solicitud a la entrega

Recorrido completo de una **solicitud de ayuda con ubicación** (requerimiento):

1. **Reportar con ubicación** *(Recopilación)* — se crea un caso marcando «solicitud de ayuda» y se
   coloca un **pin en el mapa** (las personas no manejan lat/lng: marcan el lugar). Se indica tipo de
   insumo, cantidad y urgencia. Nace **pendiente**.
2. **Verificar y confirmar** *(Verificación)* — se revisa y se **confirma** (o se descarta). Solo un
   caso **confirmado** pasa a logística.
3. **Derivar a Logística** *(Verificación)* — «Derivar a Logística» crea una **solicitud de insumo**
   enlazada al caso. El equipo de **Logística recibe un aviso**.
4. **Atender desde el centro cercano** *(Logística/Acopio)* — en la solicitud se ven los **centros más
   cercanos con stock**. Se toma, se marca **en ruta** y se coordina la salida del inventario.
5. **Entregar → caso resuelto** *(Logística/Acopio)* — al marcar **entregada**, el caso de origen pasa
   a **resuelto** y se **avisa a quien reportó** y a quien lo atendió. Queda todo registrado
   (bitácora + auditoría).

> **Reglas del ciclo:** solo se deriva un caso **confirmado** y con ubicación; una solicitud
> **entregada o cancelada** no se reabre (salvo administración); cada cambio de estado queda auditado.

### Flujos propios del acopio (sin pasar por un caso)

- **Donaciones → inventario.** Un voluntario registra lo que llega (y de quién) con el QR del centro.
  Solo suma; nunca descuadra.
- **Traspasos entre centros.** Con un clic se descuenta en el origen y se suma en el destino, con
  registro en ambos.
- **Salidas y consumo.** Se descuenta stock con un motivo; queda en la bitácora.
- **Necesidades urgentes.** Cada centro marca lo que le falta por prioridad; el panel global lo reúne.

## 6. Cómo se crea y opera el rol de admin

- **Quién lo otorga:** solo el **administrador general** (o superadmin) concede o quita el rol
  `admin_logistica`. Ni un admin de área ni un coordinador pueden acuñarlo.
- **Registro por área:** al registrarse, una persona puede elegir **«Logística y acopio»** como su
  área; esa solicitud le llega directamente al admin de Logística para aprobarla.
- **Panel acotado:** el admin de Logística ve el panel de administración **limitado a su área** — sus
  usuarios, su grupo «Gestión de Acopio» y sus centros — nunca las secciones de otras áreas.
- **Alcance de datos:** sus poderes los hace cumplir la base de datos (RLS): opera todos los centros e
  insumos como logística y supervisa su grupo, pero **no** obtiene los poderes globales del
  administrador general.

---

### Nota técnica (para desarrollo)

- Rol nuevo: `admin_logistica` (enum `rol_usuario`). Área de admin: `logistica` (`AreaAdmin`).
- Migración `0119_admin_logistica.sql`: helper `es_admin_logistica()`; rebase de `puede_logistica()`,
  `es_lider_acopio()`, `puede_gestionar_acopio()` (operación) y `puede_supervisar_grupo()` (supervisa
  `gestion_acopio`); ruteo de registro + blindaje en `proteger_campos_perfil` (solo admin general
  concede el rol). Sin puerta de identidad (no confidencial).
- Grupo del área: `gestion_acopio` → rol funcional `logistica`.
