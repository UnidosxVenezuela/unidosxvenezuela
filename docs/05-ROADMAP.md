# Roadmap

Dado que es una respuesta a una emergencia activa, el roadmap prioriza tener **algo útil en producción rápido** y luego endurecer y ampliar. Las "semanas" son orientativas para 1–3 desarrolladores.

## Fase 0 — Cimientos (días 1–3)
- [x] Monorepo, configuración, esquema SQL + RLS, scaffold web/móvil.
- [ ] Crear proyecto Supabase, aplicar migraciones (`pnpm db:push`), generar tipos.
- [ ] Desplegar web (Vercel) y build de desarrollo móvil (Expo Go).
- **Hito:** entorno funcionando con login real.

## Fase 1 — MVP operativo (semanas 1–2)
- [x] Registro/login + creación automática de perfil.
- [x] Verificación de usuarios y asignación de rol (panel mínimo).
- [x] CRUD de grupos y membresías.
- [x] CRUD de tareas con asignación, estado, prioridad, comentarios y tiempo real.
- [x] Tablón (publicar/comentar) con niveles de sensibilidad.
- [x] Notificaciones en la app (campana + página) vía Realtime.
- **Hito:** un equipo real puede coordinar tareas de principio a fin.

## Fase 2 — Campo y tiempo real (semanas 3–4)
- [ ] Notificaciones push (Expo Push + Web Push) con Edge Functions.
- [ ] Mapa de tareas/recursos (MapLibre); migrar ubicación a PostGIS.
- [ ] Filtros avanzados y búsqueda; vista "mi día".
- [ ] App móvil a paridad con web en los flujos clave.
- **Hito:** uso cómodo desde el móvil en campo.

## Fase 3 — Resiliencia (semanas 5–6)
- [ ] Modo offline: cache de tareas asignadas + cola de mutaciones.
- [ ] Reportes de situación (sitrep) y tablero 3W; export PDF/CSV.
- [ ] Auditoría ampliada (triggers por tabla) y panel de administración completo.
- **Hito:** funciona con conectividad intermitente; coordinación tiene visión global.

## Fase 4 — Endurecimiento y escala (continuo)
- [ ] 2FA para coordinación; cifrado de campos sensibles; rate limiting.
- [ ] Pruebas (unitarias, e2e con Playwright/Detox) y CI/CD.
- [ ] Accesibilidad (WCAG AA), i18n y soporte de idiomas indígenas si aplica.
- [ ] Observabilidad (logs, métricas, alertas) y plan de continuidad.

## Sugerencia de primeros sprints

**Sprint 1:** Auth + perfiles + verificación + grupos.
**Sprint 2:** Tareas (CRUD + asignación + estados) + notificaciones in-app.
**Sprint 3:** Tablón + sensibilidad + push.
**Sprint 4:** Mapa + reportes.
