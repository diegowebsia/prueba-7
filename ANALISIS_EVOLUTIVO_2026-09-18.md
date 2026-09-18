# Análisis evolutivo de seguridad y servicios — ReviewFlow AI 3.11.0

**Fecha:** 2026-09-18  
**Base analizada:** commit `12f02ab`  
**Objetivo:** localizar debilidades residuales tras la remediación inicial y proponer mejoras técnicas y funcionales.

## Resumen

La versión 3.11.0 cerró los bloqueantes de la auditoría original, pero todavía puede mejorar en defensa en profundidad, operación de webhooks, portabilidad de datos y valor aportado al cliente. No se han identificado secretos versionados ni vulnerabilidades npm conocidas. Los riesgos siguientes son principalmente de robustez y abuso, no una reapertura de los P0 cerrados.

## Debilidades residuales

### Prioridad alta

1. **Idempotencia Stripe incompleta a nivel de evento.** Las recargas son transaccionales, pero los eventos de suscripción, avisos de trial y pago fallido no reclaman `event.id`. Un reenvío puede repetir correos/logs y operaciones secundarias.
2. **Replay del ticket de feedback.** El token firmado permite transformar un voto en ticket, pero la actualización debería exigir que la fila siga siendo `redirect` y tenga antigüedad limitada. Sin ello, un token conservado puede volver a disparar avisos dentro del rate limit.
3. **Cuerpos públicos sin límite uniforme.** Varios endpoints llaman `req.json()` o `req.text()` directamente. Los límites Zod se aplican después de reservar el cuerpo; un cuerpo grande puede consumir memoria antes de ser rechazado.
4. **Migración de credenciales históricas no operativa.** Los lectores aceptan JSON antiguo en claro para compatibilidad, pero falta una tarea administrada que recifre filas históricas y reporte cuántas quedan pendientes.
5. **CI SQL estática.** Los tests comprueban invariantes textuales, pero el workflow todavía no ejecuta `schema.sql` contra PostgreSQL vacío ni la migración sobre una estructura previa.

### Prioridad media

6. **CSP todavía permite `unsafe-inline` para scripts.** Las demás cabeceras son correctas, pero la protección XSS puede endurecerse con nonces generados en Proxy y propagados al render.
7. **Procesamiento de webhooks sin estado observable.** `processed_events` permite deduplicar, pero no registra estado, intentos, último error o fecha de finalización. Soporte no puede distinguir “duplicado” de “falló tras reclamar”.
8. **Errores BD ignorados en rutas históricas.** Aunque los flujos críticos nuevos comprueban errores, persisten escrituras auxiliares `update/insert/upsert` de telemetría/configuración tratadas como best-effort sin métrica central.
9. **Limpieza de seguridad no programada desde aplicación.** Existe `cleanup_security_data()`, pero depende de que el operador programe cron manualmente.
10. **Logs sin correlación global.** Falta un request ID uniforme en respuestas y logs para seguir una petición entre Proxy, API, cola y proveedor.
11. **Imagen Docker fijada por versión pero no por digest.** Reduce deriva frente a `node:latest`, aunque la reproducibilidad completa requiere que Renovate/Dependabot mantenga el digest OCI.

## Mejoras de servicios propuestas

1. **Centro de exportación y portabilidad:** descarga CSV segura de reseñas y feedback por empresa, útil para RGPD, análisis externo y migraciones.
2. **Resumen de reputación accionable:** métricas de puntuación, distribución, pendientes de respuesta, tickets abiertos y tendencias en un contrato API estable.
3. **Estado de integraciones para el cliente:** mostrar última sincronización y error sanitizado sin exponer credenciales.
4. **Recifrado administrado de integraciones:** operación solo super-admin, auditable y repetible.
5. **Mayor trazabilidad de webhooks:** estado e intentos, con posibilidad de reintento seguro.
6. **Protección de entradas públicas:** límite de bytes antes de parsear y respuestas 413 consistentes.

## Plan de implementación

### Fase inmediata

- Reclamo/finalización idempotente de eventos Stripe con liberación controlada en error.
- Limitar cuerpos en contacto, feedback y webhooks públicos.
- Cerrar replay de tickets por estado y TTL.
- Añadir exportación CSV con neutralización de fórmulas y aislamiento por tenant.
- Añadir endpoint de resumen de reputación autenticado.
- Añadir recifrado super-admin y contador de filas legacy.
- Incorporar request ID desde Proxy.
- Mejorar tests de los nuevos contratos y CI PostgreSQL.

### Fase dependiente de infraestructura

- CSP sin `unsafe-inline` tras probar nonces con scripts de Next, Stripe y analítica en staging.
- Fijación automática del digest OCI mediante Renovate/Dependabot.
- Pruebas E2E con credenciales sandbox de Google, Stripe, Meta y Supabase.

## Criterios de salida

- Lint, typecheck, tests, audit y build en verde.
- Webhooks repetidos no repiten efectos secundarios.
- Entradas excesivas devuelven 413 antes del parseo.
- CSV no permite inyección de fórmulas y exige membresía del tenant.
- Recifrado accesible solo a super-admin y sin exponer secretos.
- Reporte de cambios y entrega descargable actualizados.
