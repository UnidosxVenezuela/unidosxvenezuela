# Plataforma Unidos — Plan del proyecto

## 1. Contexto

El 24 de junio de 2026, dos terremotos (magnitud 7.2 y 7.5, con 39 segundos de diferencia) golpearon el norte de Venezuela, con epicentro cerca de Morón (~167 km al oeste de Caracas). Son los sismos más fuertes del país en un siglo: edificios colapsados, miles de personas afectadas y una respuesta humanitaria activa de la ONU (OCHA, WFP), gobiernos y ONGs.

En emergencias así, la coordinación es tan crítica como los recursos. Equipos numerosos de voluntarios y profesionales necesitan organizarse rápido, saber **quién hace qué y dónde**, evitar duplicar esfuerzos y proteger información delicada (ubicación de víctimas, datos médicos, personas vulnerables). **Plataforma Unidos** existe para resolver esa coordinación.

## 2. Visión

Una plataforma web y móvil, fácil de usar incluso bajo estrés y con conectividad intermitente, que permita a equipos de respuesta organizarse por áreas, asignar y seguir tareas, comunicarse en un tablón, recibir notificaciones y manejar información sensible con controles de seguridad apropiados.

## 3. Objetivos

1. **Organizar equipos numerosos** en grupos por área operativa con roles claros.
2. **Asignar y dar seguimiento a tareas** de distinta índole, con prioridad y estado.
3. **Comunicar** mediante un tablón con niveles de confidencialidad.
4. **Notificar** cambios relevantes (asignaciones, anuncios, menciones).
5. **Proteger** la información delicada: identidad verificada, control de acceso, auditoría.
6. **Funcionar en condiciones reales**: móvil, baja conectividad, curva de aprendizaje mínima.

## 4. Alcance

### Dentro del alcance (plataforma completa)
- Autenticación e identidad verificada; perfiles y roles.
- Grupos por área (modelo de clusters humanitarios) y membresías.
- Gestión de tareas (CRUD, asignación, prioridad, estado, vencimiento, ubicación).
- Tablón de publicaciones y comentarios con niveles de sensibilidad.
- Notificaciones en la app y push (web + móvil).
- Mapa de tareas y recursos (geolocalización).
- Reportes de situación y vista "3W" (Quién–Qué–Dónde).
- Modo offline / sincronización para trabajo de campo.
- Panel de administración (verificación de usuarios, roles, auditoría).

### Fuera del alcance (por ahora)
- Logística financiera/donaciones y pasarelas de pago.
- Integración directa con sistemas oficiales de la ONU (se considera a futuro).
- Mensajería privada 1:1 tipo chat (se prioriza el tablón por grupo).

## 5. Usuarios y roles

| Rol | Quién | Permisos clave |
|-----|-------|----------------|
| **admin** | Coordinación general | Todo: usuarios, roles, áreas, auditoría. |
| **coordinador** | Líder de un área/cluster | Crea grupos, ve todo lo de su operación, verifica usuarios. |
| **lider_grupo** | Responsable de un grupo | Gestiona miembros y tareas de su grupo. |
| **voluntario** | Personal de campo | Ve y actualiza tareas de sus grupos; publica en el tablón. |
| **observador** | Donantes, prensa autorizada | Solo lectura de información pública/interna. |

## 6. Áreas operativas

Basadas en el sistema de *clusters* humanitarios (IASC/OCHA) para alinearse con la coordinación internacional ya activa en Venezuela:

Salud · Agua y Saneamiento (WASH) · Refugio y Albergues · Alimentación · Logística · Búsqueda y Rescate · Telecomunicaciones · Protección · Gestión de Información.

## 7. Módulos y características

### 7.1 Identidad y acceso
- Registro con correo o teléfono (SMS), confirmación obligatoria en producción.
- **Verificación de identidad** por coordinación antes de dar acceso operativo (campo `verificado`).
- Roles con control de acceso (RBAC) reforzado por seguridad a nivel de fila en la base de datos.

### 7.2 Grupos por área
- Crear grupos dentro de un área, asignar un líder y miembros.
- Un usuario puede pertenecer a varios grupos.
- Vista de "mi equipo" con miembros, contacto y carga de trabajo.

### 7.3 Tareas
- Crear tareas con título, descripción, prioridad (baja→crítica), estado, vencimiento y ubicación opcional.
- Asignar a una persona y/o grupo; reasignar dispara notificación.
- Filtros por estado, prioridad, área, grupo y cercanía geográfica.
- Comentarios por tarea para coordinación fina.

### 7.4 Tablón
- Publicaciones generales o por grupo, con comentarios.
- **Niveles de sensibilidad**: pública, interna, restringida, confidencial — que determinan quién puede leerlas.

### 7.5 Notificaciones
- En la app (campana) y push (web + móvil) para: tarea asignada, mención, anuncio de coordinación, vencimiento próximo.
- Preferencias por usuario (qué notificar y por qué canal).

### 7.6 Mapa
- Visualización de tareas y recursos geolocalizados (estilo Ushahidi/Sahana).
- Filtro por área y estado; útil para asignación por cercanía.

### 7.7 Reportes y 3W
- Tablero de situación: tareas por estado/área, grupos activos, cobertura geográfica.
- Exportación de reportes de situación (sitrep) en PDF/CSV.

### 7.8 Offline (campo)
- Lectura de tareas asignadas sin conexión y cola de cambios que sincroniza al recuperar señal.

### 7.9 Administración
- Verificar usuarios, asignar roles, crear áreas/grupos, revisar el registro de auditoría.

## 8. Casos de uso principales

1. **Alta de voluntario** → se registra, la coordinación lo verifica y lo asigna a un grupo.
2. **Despacho de tarea** → un líder crea "Evaluar estructura en Morón", prioridad crítica, la asigna; el voluntario recibe notificación y la marca *en progreso* → *completada*.
3. **Anuncio sensible** → coordinación publica una alerta confidencial visible solo para su área.
4. **Vista de situación** → un coordinador revisa el mapa y el tablero 3W para reubicar equipos.

## 9. Métricas de éxito

- Tiempo desde alta hasta primera tarea asignada (objetivo: < 10 min).
- % de tareas con estado actualizado en las últimas 24 h.
- Tareas críticas sin asignar (objetivo: → 0).
- Adopción: usuarios activos diarios / verificados.
- Uso real en campo: % de actualizaciones hechas desde móvil/offline.
