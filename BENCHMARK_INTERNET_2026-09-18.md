# Benchmark de mercado y mejora — ReviewFlow AI

**Fecha:** 2026-09-18  
**Versión base:** 3.12.0

## Fuentes y patrones observados

- Google recomienda compartir un enlace o código QR para solicitar reseñas, y destaca que las respuestas útiles y positivas muestran capacidad de respuesta al cliente [Google Business Profile Help](https://support.google.com/business/answer/3474050?hl=en).
- Trustpilot utiliza etiquetado y pre-etiquetado para segmentar reseñas por ubicación, agente o proveedor, comparar resultados y exportarlos a herramientas de BI [Trustpilot Review Tagging](https://business.trustpilot.com/features/review-tagging).
- Las plataformas de reputación líderes combinan invitaciones, recordatorios, atribución, analítica de volumen y tiempos de respuesta; estas capacidades convierten un simple enlace en un proceso medible [Podium review feature analysis](https://www.replychampion.com/reviews/podium).
- Las guías OWASP para webhooks recomiendan firma HMAC, deduplicación por ID, idempotencia, límites de tamaño, rate limiting, validación estricta, logs sin secretos y procesamiento asíncrono [OWASP Webhook Security Guidelines](https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets_draft/Webhook_Security_Guidelines_Cheat_Sheet.md).

## Comparación con ReviewFlow AI 3.12.0

### Ya está al nivel esperado

- Bandeja multi-origen y respuestas asistidas por IA.
- Automatización por cron/cola, control de cuotas y publicación en Google.
- Flujo de valoración neutral y conforme: ninguna puntuación queda apartada de las plataformas públicas.
- Firma, límites de tamaño, idempotencia y trazabilidad para webhooks.
- Exportación CSV e informe de reputación.

### Oportunidades detectadas

1. **Código QR descargable:** Google lo recomienda y los competidores lo convierten en un canal permanente de captación con coste marginal cero.
2. **Atribución por campaña:** falta distinguir mostrador, ticket, camarero, email, evento o local. Trustpilot resuelve este problema mediante tags/pre-tags.
3. **Conversión por campaña:** medir votos, clics y tickets por origen permite invertir en los canales que realmente funcionan.
4. **SLA de respuesta:** el informe debe mostrar tiempo medio de respuesta y porcentaje contestado en menos de 24 horas, no solo tasa de respuesta.
5. **Contexto en exportaciones:** campaña y canal deben acompañar a cada voto para análisis externo.
6. **Privacidad de atribución:** los identificadores de campaña deben ser etiquetas operativas, no nombres, emails ni teléfonos de clientes.

## Mejoras seleccionadas

- Generador QR SVG autenticado, sin trackers ni servicios externos.
- Parámetro `campaign` normalizado en enlaces de valoración.
- Persistencia y estadísticas de campañas con índices y migración SQL.
- Ranking de campañas por votos, clics públicos y tickets.
- Métricas de SLA de respuesta en el informe de reputación.
- Controles de campaña y descarga QR integrados en el panel.
- Tests de normalización, QR, SQL y contratos de atribución.

## Medidas no adoptadas

- No se implementan incentivos, filtrado por puntuación ni generación de reseñas: aumentarían el riesgo de incumplir políticas de plataformas.
- No se envían datos a un proveedor QR externo: el SVG se genera dentro de la aplicación.
- No se usa la etiqueta de campaña para almacenar PII; se limita a caracteres seguros y longitud reducida.
