# Mejoras sugeridas

Propuestas para fortalecer la plataforma, ordenadas por tema. Cada una indica **prioridad** (🔴 alta / 🟡 media / 🟢 futura) y la razón. Varias se inspiran en herramientas humanitarias probadas (Sahana Eden, Ushahidi, KoBoToolbox) y en el sistema de coordinación de OCHA.

## A. Coordinación humanitaria

- 🔴 **Vista 3W (Quién–Qué–Dónde).** Tablero que cruza grupos × áreas × zonas para ver cobertura y huecos, y **evitar duplicar esfuerzos**. Es el estándar de coordinación de OCHA.
- 🔴 **Detección de tareas duplicadas.** Avisar cuando se crea una tarea muy similar (misma zona + área) para no enviar dos equipos al mismo sitio.
- 🟡 **Registro de albergues/damnificados.** Capacidad, ocupación y necesidades por albergue (como el *Shelter Registry* de Sahana Eden). Encaja en el área Refugio.
- 🟡 **Gestión de recursos e inventario.** Qué hay, dónde y cuánto (agua, medicinas, combustible) con emparejamiento "necesidad ↔ oferta".
- 🟢 **Reportes crowdsourced en mapa.** Que la población reporte incidentes/necesidades georreferenciadas (modelo Ushahidi), con verificación antes de convertirlos en tareas.

## B. Facilidad de uso (prioridad del proyecto)

- 🔴 **Diseño para estrés.** Botones grandes, alto contraste, jerarquía clara, mínimos pasos por acción. La gente usa esto cansada y con prisa.
- 🔴 **Acciones rápidas y plantillas de tareas.** Crear tareas comunes en un toque ("evaluar estructura", "llevar agua a X").
- 🟡 **Onboarding de 60 segundos.** Alta guiada y, si es posible, primer grupo sugerido automáticamente.
- 🟡 **Accesibilidad (WCAG AA).** Lectores de pantalla, tamaños de toque, daltonismo. Ver la skill de *accessibility-review*.
- 🟢 **Multi-idioma.** Español primero; preparar i18n para inglés (coordinación internacional) y lenguas indígenas si aplica.

## C. Baja conectividad y resiliencia

- 🔴 **Offline-first real en móvil.** Leer tareas asignadas y encolar cambios sin señal; sincronizar al reconectar. Crítico en zonas con infraestructura dañada.
- 🔴 **Canal SMS de respaldo.** Notificaciones críticas y, si se puede, alta/consulta por SMS para quienes no tengan datos (Sahana/KoBo usan SMS por esto).
- 🟡 **PWA ligera.** Minimizar peso y peticiones; que cargue en redes 2G/3G.
- 🟢 **Formularios de evaluación offline.** Recolección de datos de campo tipo KoBoToolbox que sincroniza después.

## D. Seguridad y privacidad de datos sensibles

- 🔴 **2FA para coordinación** (`admin`/`coordinador`).
- 🔴 **Minimización y clasificación de datos** (ya hay niveles de sensibilidad; aplicarlos estrictamente a datos de víctimas).
- 🟡 **Cifrado a nivel de campo** para datos médicos/personas vulnerables.
- 🟡 **Política de retención y anonimización** al cerrar la fase aguda.
- 🟢 **Cumplimiento** con estándares humanitarios de manejo de datos (principios de protección de datos de OCHA) y normativa local.

## E. Confiabilidad de la información

- 🟡 **Niveles de confianza/verificación** en reportes y publicaciones (no verificado / verificado por coordinación).
- 🟡 **Estados claros y bitácora** por tarea para auditar decisiones.
- 🟢 **Moderación del tablón** para evitar ruido y desinformación.

## F. Interoperabilidad y escala

- 🟡 **Exportar en formatos estándar** (CSV/HXL — *Humanitarian Exchange Language*) para compartir con OCHA/ONGs y el portal HDX.
- 🟡 **Bots de ingesta** (WhatsApp/Telegram) para recibir reportes donde ya está la gente.
- 🟢 **API y multi-organización** para que varias ONGs colaboren sin pisarse.
- 🟢 **Mapas humanitarios** con OpenStreetMap/HOT (Humanitarian OpenStreetMap Team).

## G. Calidad de ingeniería

- 🔴 **Pruebas** desde el inicio: unitarias de lógica y políticas RLS, e2e (Playwright/Detox).
- 🔴 **CI/CD** (lint, typecheck, test, deploy) — evita romper producción durante la emergencia.
- 🟡 **Observabilidad**: logs y alertas (errores, caídas) para reaccionar rápido.
- 🟡 **Backups probados** y plan de restauración.

## Quick wins recomendados para empezar
1. Diseño para estrés + plantillas de tareas (B).
2. Vista 3W y anti-duplicados (A).
3. Offline-first + SMS de respaldo (C).
4. 2FA + retención de datos (D).
5. Pruebas de políticas RLS + CI (G).
