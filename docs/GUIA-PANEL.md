# Guía completa del panel — UnidosXVenezuela

> **⚠️ Actualización (jul 2026):** la plataforma pasó a llamarse **Apoyo por
> Venezuela** y cambió su modelo: jerarquía **admin → líder → coordinador** (el
> coordinador publica en su grupo pero no gestiona miembros), **grupos solo
> visibles para sus miembros** (sin auto-unirse ni solicitudes), tareas dentro de
> cada grupo, menú por función según el grupo, flujo **Verificación → Confirmados
> → Envío a Redacción** (sección "Casos"), y sin rol Observador. Esta guía se
> está actualizando a la nueva estructura.

Guía detallada de la plataforma: los **roles**, **cómo se asignan**, **quién los
asigna** y los **flujos de trabajo** de cada módulo. Pensada para coordinación y
administración.

---

## 1. El panel de un vistazo

Tras iniciar sesión en **unidosxvnezuela.com**, cada persona ve un **menú lateral**
con las secciones a las que su rol le da acceso, y una **barra superior** con la
campana de avisos y su perfil.

**Secciones base (toda cuenta verificada):** Panel, Tareas, Grupos, Solicitar
acceso, Tablón, Mapa, Centros de acopio, Insumos, Mis horas, Avisos, Ayuda.

**Secciones por rol (aparecen solo si corresponde):** Espacios de trabajo,
Apoyo Psicosocial, Datos aliados, Verificación de casos, Contenido, Solicitudes
de acceso, Administración, Registro de actividad.

---

## 2. Cuentas: registro y verificación

> **Regla base:** toda cuenta nueva queda **pendiente** hasta que la coordinación
> la **verifica**. Sin verificar, solo ve una pantalla de espera.

**Ciclo de vida de una cuenta:**

```
Registro (rol Voluntario, pendiente)
        │
        ▼
Coordinación aprueba  ─────►  Cuenta verificada (acceso operativo)
   (Administración → Usuarios)         │
                                       ├─► se le asigna rol/es según su función
                                       └─► se le suma a grupos si corresponde
```

Otras acciones sobre cuentas (todas desde **Administración → Usuarios**):

- **Crear cuenta manualmente** (coordinación): con **correo** o **número de
  WhatsApp**, un rol y una **contraseña temporal**. Queda verificada. Si es por
  WhatsApp, se comparte la clave por WhatsApp; si es por correo, recibe email.
- **Importar por lote** (coordinación): pegar una persona por línea (número o
  correo + nombre); crea todas las cuentas verificadas de una vez.
- **Restablecer contraseña** (solo **admin**): envía una temporal al correo de la
  persona. No se puede hacer a otro administrador.
- **Eliminar cuenta** (solo **admin**, con confirmación): borra la cuenta; sus
  registros (tareas, casos, contenido) se conservan sin autor. No a otro admin.
- **Agregar a un grupo** (coordinación): suma a la persona a un grupo directamente.

---

## 3. Catálogo de roles

Un usuario tiene **un rol principal** y, si hace falta, **roles adicionales**. Los
permisos **suman**: vale el conjunto de sus roles.

### 3.1 Roles de operación

| Rol | Qué hace | Secciones que usa |
|-----|----------|-------------------|
| **Administración** (admin) | Acceso total. Aprueba cuentas, gestiona roles, grupos y áreas; restablece contraseñas; elimina cuentas; aprueba aliados; supervisa todo. | Todas |
| **Coordinador** | Coordina el día a día: gestiona usuarios (no a admins), tareas y grupos; verifica cuentas; asigna roles. | Casi todas |
| **Líder de grupo** | Maneja **su** grupo: crea/asigna tareas, miembros, anuncios, reuniones, veto. Puede dar roles de contenido a su gente. | Base + su grupo |
| **Voluntario** | Rol de base. Toma tareas abiertas, registra horas, se une a grupos abiertos. | Base |
| **Observador** | Solo mira: no toma tareas ni publica ni se une a grupos. | Base (lectura) |

### 3.2 Cadena de contenido (información → publicación)

| Rol | Qué hace |
|-----|----------|
| **Recopilación** | **Envía** casos (información a verificar). No los verifica. |
| **Verificación** | Confirma o descarta los casos. |
| **Redacción** | Redacta el contenido y elige destino (Diseño o Video). |
| **Diseño Gráfico** | Crea la pieza gráfica. |
| **Edición de Videos** | Edita el video/reel. |
| **Redes Sociales** | Publica la pieza final. |

Cada uno de estos roles tiene además su **Espacio de trabajo** propio (grupo
privado con su cola de trabajo).

### 3.3 Roles especializados

| Rol | Qué hace | Acceso |
|-----|----------|--------|
| **Logística** | Gestiona el flujo de insumos: solicitudes, proveedores, envíos y donaciones. | Insumos (gestión) |
| **Líder de plataforma aliada** | Accede a la base compartida de contactos/endpoints aliados. | Datos aliados |
| **Apoyo Psicosocial** | Profesional que acompaña casos de salud mental asignados a él. | Apoyo Psicosocial (confidencial) |
| **Coordinación Psicosocial** | Coordina el área psicosocial: ve todos los casos, asigna, gestiona recursos. | Apoyo Psicosocial (confidencial) |

> El **superadministrador** (el dueño) no es un rol de la lista: es una marca
> especial sobre una cuenta admin. Es el único que puede crear/modificar
> administradores y gestionar superadministradores.

---

## 4. Cómo se asignan los roles y quién los asigna

Hay **cuatro vías** para dar acceso, cada una con sus reglas.

### Vía A — Panel de Administración (coordinación)

**Administración → Usuarios.** La coordinación (admin o coordinador):

1. **Aprueba** la cuenta (la verifica).
2. Elige el **Rol principal** según su función.
3. Si hará más de una cosa, abre **Roles adicionales**, marca los que
   correspondan y guarda.

### Vía B — Botón "Cadena de contenido" en un grupo

Dentro de un grupo, la **coordinación** o el **líder de ese grupo** pueden dar
roles **de la cadena de contenido** (Recopilación, Verificación, Redacción,
Diseño, Video, Redes) a **voluntarios o a sí mismos** — nunca a otros
coordinadores/líderes. Facilita sumar gente al flujo sin pasar por administración.

### Vía C — Solicitud de acceso (la pide el usuario)

En **Solicitar acceso**, una persona verificada puede pedir:
- unirse a un **grupo privado**, o
- acceder a una **sección/rol solicitable** (Logística, Verificación,
  Recopilación, Redacción, Diseño, Video, Redes).

La resuelve el **líder de ese grupo** o la **coordinación**. Al aprobar, se le
agrega la membresía o el rol. (Los roles de mando y los psicosociales **no** son
solicitables: se otorgan solo desde administración.)

### Vía D — Doble aprobación (rol de aliado)

El rol **Líder de plataforma aliada** da acceso a datos sensibles, así que
requiere **dos administradores** (o el superadministrador solo): uno **propone**
y otro **aprueba**.

---

## 5. Quién puede asignar qué (reglas de seguridad)

Estas reglas las hace cumplir la base de datos (no solo la interfaz):

| Acción | Quién puede |
|--------|-------------|
| Verificar (aprobar) una cuenta | Coordinación (admin / coordinador) |
| Cambiar el rol principal (no admin) | Coordinación |
| Asignar roles adicionales (no admin) | Coordinación; roles de contenido también un líder (Vía B) |
| Otorgar/cambiar el rol **admin** | **Solo superadministrador** |
| Otorgar/quitar **superadministrador** | **Solo superadministrador** |
| Otorgar **Líder de plataforma aliada** | **Doble aprobación** (2 admins o superadmin) |
| Restablecer contraseña de otro | **Admin** (nunca a otro admin) |
| Eliminar una cuenta | **Admin** (nunca a otro admin) |
| Cambiar **tu propio** rol o verificación | Nadie (solo la coordinación cambia el de otros) |

**Reglas de oro:** empieza con **Voluntario** y suma roles solo cuando haga falta;
lo sensible (Verificación, aliados, salud) va a personas verificadas y de
confianza; ante cambios sobre administradores, consulta al superadministrador.

---

## 6. Flujos de trabajo por módulo

### 6.1 Tareas

Crear tareas: **admin, coordinador o líder de grupo**. El resto **toma** tareas
abiertas o hace las asignadas.

```
Crear tarea → Asignar / dejar abierta (con cupo) → Voluntarios la toman
   → En progreso → Completada        (+ comentarios, material, entregable, horas)
```

### 6.2 Grupos y espacios de trabajo

La coordinación crea grupos (con área y líder). **Abiertos**: cualquier
verificado se une solo. **Privados**: por invitación o por solicitud de acceso.
El **líder** gestiona su grupo (miembros, anuncios fijados, reuniones, pizarra,
veto). La **coordinación** puede entrar a **cualquier** grupo para supervisar.
Cada rol de contenido queda automáticamente en el **grupo/Espacio** de su rol.

### 6.3 Verificación de casos → Producción de contenido

El flujo estrella de comunicación:

```
Recopilación ENVÍA un caso
      │
      ▼
Verificación lo revisa ──► ¿Confirmado y activo?
      │                          │ sí
      │ falso/resuelto           ▼
      └────────────►     "Enviar a Redacción" (crea una PIEZA)
                                 │
                                 ▼
      Redacción ─► Diseño Gráfico  ┐
                └► Edición de Videos ├─► Redes Sociales ─► Publicado
```

Cada persona solo actúa en la **etapa de su rol**; la coordinación, en todas.

### 6.4 Insumos / Logística

```
Cualquier verificado CREA una solicitud de insumo
      │
      ▼
Logística gestiona:  Solicitado → En gestión → En ruta → Entregado
      │                    (asigna proveedor; registra envíos: voluntario + vehículo + flete)
      └─► Donaciones (comprometida → recibida → asignada)
```

Ver y crear solicitudes: cualquier verificado. Gestionar el flujo: **Logística**
(o coordinación).

### 6.5 Apoyo Psicosocial (confidencial)

```
Solicitado → Asignado → En acompañamiento → Seguimiento → Cerrado (o Cancelado)
```

Área confidencial: cada caso y su bitácora solo los ven el **profesional
asignado** y la **coordinación psicosocial**. La **administración** ve solo un
**panel de supervisión** (indicadores agregados), nunca el contenido. Detalle en
`docs/GUIA-APOYO-PSICOSOCIAL.md`.

### 6.6 Solicitudes de acceso

```
Usuario pide (grupo privado o rol solicitable)
      │
      ▼
Líder del grupo / coordinación revisa ──► Aprueba (agrega membresía o rol) o rechaza
      └─► avisa al solicitante
```

### 6.7 Otras secciones

- **Tablón:** anuncios con nivel de sensibilidad (Pública, Interna, Restringida,
  Confidencial); cada nivel controla quién lo ve.
- **Mapa:** ubicaciones de tareas y centros de acopio.
- **Centros de acopio:** puntos con dirección, necesidades y urgencia; cualquier
  verificado ayuda a mantenerlos al día.
- **Mis horas:** cada quien registra sus horas de voluntariado.
- **Avisos:** notificaciones (asignaciones, traspasos del pipeline, accesos, etc.).
- **Registro de actividad:** bitácora de auditoría de acciones sensibles (coordinación).

---

## 7. Seguridad y buenas prácticas

- **La RLS es la fuente de verdad:** los permisos se aplican en la base de datos,
  no solo en la pantalla. Aunque alguien vea un enlace, sin permiso no obtiene datos.
- **Mínimo privilegio:** asigna el rol más acotado que la persona necesite.
- **Confidencialidad psicosocial:** ni la administración ve los casos de salud mental.
- **Administradores:** solo el superadministrador crea/modifica admins; los
  admins nunca se restablecen la contraseña ni se eliminan entre sí.
- **Contraseñas temporales:** son de un solo uso; pide cambiarlas al entrar.

> ¿Dudas sobre qué rol dar? Mira qué **secciones** del menú necesita la persona:
> cada sección corresponde a uno o varios roles. Si no debe verla, no le des ese rol.
