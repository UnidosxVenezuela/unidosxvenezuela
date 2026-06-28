# 08 — Distribución y organización de tareas (borradores)

Guía operativa para coordinar el voluntariado en la respuesta al **doble terremoto de Venezuela**.
Define cómo se clasifican, distribuyen y "cierran" las tareas según el tipo de trabajo.

## Modelo de organización

Tres ejes que se combinan en cada tarea:

1. **Área / clúster humanitario** (el *dónde/para qué*) — modelo OCHA: salud, agua y saneamiento,
   refugio, alimentación, logística, búsqueda y rescate, telecomunicaciones, protección,
   gestión de información. → en la plataforma es el **grupo**.
2. **Categoría de trabajo** (el *qué habilidad*) — código, diseño, marketing, redes sociales,
   transcripción, legal, acopio, logística, datos, salud, traducción, comunicaciones, general.
   → es el campo **categoría** de la tarea.
3. **Modo de asignación**:
   - **Abierta (libre elección):** sin asignar; cualquier voluntario la *toma*. Maximiza
     participación. Ideal para trabajo paralelizable y de bajo riesgo.
   - **Asignada:** la coordinación/líder la asigna a una persona concreta. Para trabajo
     sensible, crítico o que requiere verificación de identidad.

### Quién hace qué
- **Admin / Coordinador / Líder de grupo:** crean y asignan tareas, aprueban registros, gestionan grupos.
- **Voluntario / Observador:** ven y **toman tareas abiertas**, ejecutan, comentan y cierran.
- Regla: lo **sensible** (datos personales, legal, salud, fondos) se *asigna* a personas verificadas;
  lo **paralelizable** se deja *abierto*.

### Ciclo de una tarea
`Abierta → Tomada/Asignada → En progreso → (Bloqueada) → Completada` · con comentarios y, si aplica, ubicación.

---

## Borradores por tipo de trabajo

Cada bloque: **qué incluye · cómo abordarla · cómo distribuir · "hecho" (DoD) · sensibilidad**.

### 💻 Código
- **Incluye:** la plataforma (web/móvil), bots, scrapers de fuentes oficiales, dashboards, automatizaciones.
- **Abordar:** issues pequeños y bien descritos; una tarea = un cambio. PRs revisados por un líder técnico.
- **Distribuir:** mayormente **abiertas** por dificultad (`good first issue` → avanzado). Acceso al repo: asignado.
- **Hecho:** PR mergeado, desplegado, sin romper el build.
- **Sensibilidad:** media (secretos y `service_role` solo coordinación).

### 🎨 Diseño
- **Incluye:** identidad visual, piezas para redes, infografías de prevención, plantillas, UI/UX.
- **Abordar:** brief corto + paleta tricolor de la marca; entregar en formato editable + export.
- **Distribuir:** **abiertas** (piezas sueltas) y asignadas (sistema de diseño).
- **Hecho:** archivo final + versión lista para publicar, aprobada por comunicaciones.
- **Sensibilidad:** baja.

### 📣 Marketing
- **Incluye:** campañas de donación, mensajes clave, alianzas con medios, llamados a voluntariado.
- **Abordar:** objetivo medible (ej. captar N voluntarios / X en donaciones), público y canal.
- **Distribuir:** asignada el plan; abiertas las ejecuciones (piezas, difusión).
- **Hecho:** campaña publicada + métricas reportadas.
- **Sensibilidad:** media (mensajería oficial coherente).

### 📱 Redes sociales
- **Incluye:** publicar, responder, moderar, monitorear necesidades reportadas por la gente.
- **Abordar:** calendario + tono; plantillas aprobadas; escalar reportes urgentes a coordinación.
- **Distribuir:** **abiertas** por turnos (franjas horarias). Credenciales de cuentas: asignadas y limitadas.
- **Hecho:** turno cubierto + reportes urgentes escalados.
- **Sensibilidad:** media-alta (acceso a cuentas oficiales).

### ✍️ Transcripción
- **Incluye:** pasar a texto audios/llamadas/listas manuscritas de campo (damnificados, recursos, acopio).
- **Abordar:** una unidad = un audio/lista; formato estándar; marcar dudoso.
- **Distribuir:** **abiertas** masivamente — alta paralelización, ideal para sumar mucha gente.
- **Hecho:** texto cargado y revisado por un segundo voluntario (doble verificación).
- **Sensibilidad:** **alta** si hay datos personales → tarea **restringida/confidencial** y asignada.

### ⚖️ Legal
- **Incluye:** protección de datos, consentimiento, marco de donaciones, convenios, vocería ante autoridades.
- **Abordar:** plantillas y criterios; toda duda con datos personales pasa por aquí.
- **Distribuir:** **asignada** siempre, a personas verificadas.
- **Hecho:** documento/criterio aprobado y archivado.
- **Sensibilidad:** **máxima**.

### 📦 Acopio (puntos de recolección)
- **Incluye:** registrar puntos de acopio, inventario de insumos, necesidades por punto, horarios.
- **Abordar:** ficha por punto (ubicación, responsable, qué recibe, qué falta); actualizar en tiempo real.
- **Distribuir:** **abiertas** para registrar/actualizar; asignada la responsabilidad de cada punto.
- **Hecho:** punto con datos completos y necesidades al día; idealmente con ubicación (lat/lng) para el mapa.
- **Sensibilidad:** baja-media (teléfono del responsable = restringida).

### 🚚 Logística
- **Incluye:** transporte, rutas, distribución desde acopio a zonas, combustible, voluntarios en terreno.
- **Abordar:** origen→destino, carga, ventana horaria, contacto en destino.
- **Distribuir:** asignada (responsable de ruta) + abiertas (apoyo de carga/descarga).
- **Hecho:** entrega confirmada por el contacto en destino.
- **Sensibilidad:** media (seguridad de rutas).

### 📊 Datos
- **Incluye:** consolidar reportes, deduplicar, mapear necesidades, indicadores para decisiones.
- **Abordar:** una fuente/planilla por tarea; criterios de calidad; nunca exponer datos personales.
- **Distribuir:** abiertas (limpieza) + asignada (análisis y publicación de indicadores).
- **Hecho:** dataset limpio/validado + indicador actualizado.
- **Sensibilidad:** **alta** (agregada y anonimizada).

### 🩺 Salud (apoyo no clínico)
- **Incluye:** difundir info verificada de salud, censos de necesidades médicas, apoyo a brigadas.
- **Abordar:** SOLO información de fuentes oficiales/profesionales; nunca consejo médico de voluntarios.
- **Distribuir:** asignada a personas con perfil; difusión abierta.
- **Hecho:** info verificada publicada / censo entregado a coordinación de salud.
- **Sensibilidad:** **alta**.

### 🌐 Traducción / Comunicaciones
- **Traducción:** materiales a lenguas indígenas/inglés; **abiertas**, revisión por segundo hablante.
- **Comunicaciones:** boletines internos, vocería, coordinación entre grupos; asignada.

---

## Onboarding de un voluntario (flujo)
1. Se registra → queda **pendiente de verificación**.
2. Mientras tanto **ya puede tomar tareas abiertas** de baja sensibilidad (¡colaborar desde el minuto uno!).
3. La coordinación lo **verifica** → habilita tareas asignadas y sensibles.
4. Se suma a uno o más **grupos** (áreas) según habilidad/disponibilidad.

## Principios
- **Bajar la barrera de entrada:** que siempre haya tareas abiertas, pequeñas y claras.
- **Doble verificación** en lo que afecta a personas (transcripción, datos, salud).
- **Lo sensible se asigna; lo masivo se abre.**
- **Una tarea = un resultado** comprobable.

> Estos son borradores vivos: ajustar categorías, DoD y umbrales de sensibilidad con la coordinación real.
