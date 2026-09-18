# Auditoría de limpieza e higienización

**Proyecto:** ReviewFlow AI 3.10.0  
**Fecha:** 2026-09-18  
**Alcance:** 124 archivos TypeScript/TSX del App Router, rutas API, librerías, configuración, documentación y SQL.

> Este documento se creó antes de ejecutar los borrados y refactorizaciones descritos a continuación.

## 1. Método y grafo de importaciones

Se tomaron como puntos de entrada todos los archivos especiales de Next.js en `app/` (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `global-error.tsx`, `not-found.tsx` y `api/**/route.ts`), además de `middleware.ts` y `scripts/verify-launch.mjs`.

Comprobaciones realizadas sobre el estado original:

- Resolución del grafo estático de imports de `app/`, `components/`, `lib/` y `middleware.ts` con Madge: **124 archivos procesados**.
- Búsqueda de módulos sin consumidores, imports dinámicos y referencias por alias `@/*`.
- Análisis de exports sin consumidores con `ts-prune`, revisado manualmente para descartar falsos positivos de los puntos de entrada convencionales de Next.js.
- Comparación por hash de los archivos para localizar duplicados exactos.
- Revisión manual de `package.json`, TypeScript, Next.js, Docker, Vercel, variables de entorno, documentación y migraciones SQL.
- Línea base validada con `npm run typecheck` y `npm run build`: **ambos correctos**, con 38 páginas/rutas generadas.

### Resultado del grafo

No hay componentes, hooks, librerías completas ni rutas API huérfanas que sea seguro retirar. Los archivos que Madge presenta como “orphans” bajo `app/` son puntos de entrada descubiertos por convención por Next.js, no código muerto. Todos los módulos de `components/` y `lib/` tienen al menos un flujo activo, salvo símbolos internos concretos detallados más abajo.

Las rutas de webhooks, cron, OAuth y worker no necesitan ser importadas desde la UI: son puntos de entrada externos activos. En particular, `app/api/tenants/start/route.ts` se conserva intencionadamente como capa de compatibilidad para clientes antiguos (respuesta HTTP 402).

## 2. Archivos a eliminar

| Archivo | Motivo específico |
|---|---|
| `proyecto.zip` | Contenedor de entrada ya extraído. Mantener una copia anidada del proyecto duplica todo el código y la documentación, aumenta el entregable y puede confundir herramientas de análisis. Será sustituido por el ZIP limpio final. |

Artefactos locales regenerables como `.next/`, `node_modules/`, `next-env.d.ts` y `tsconfig.tsbuildinfo` no forman parte del código fuente ni del ZIP final; ya están cubiertos por `.gitignore` o por las exclusiones del empaquetado.

### Archivos revisados y conservados expresamente

- `supabase/schema.sql`: fuente completa para instalaciones nuevas.
- `supabase/migration_3_2_0.sql` … `migration_3_10_0.sql`: cadena histórica necesaria para actualizar instalaciones existentes desde distintas versiones; no son duplicados del esquema a efectos operativos.
- `GUIA_*.md`, `docs/GUIA_PASOS_MANUALES.md`, `README.md` y `CHANGELOG.md`: tienen públicos y propósitos distintos y se enlazan entre sí.
- `app/login/loading.tsx` y `app/registro/loading.tsx`: son duplicados de contenido, pero su ubicación es semántica para los límites de Suspense del App Router; no se fusionan para evitar añadir una abstracción mayor que el código compartido.

## 3. Archivos a fusionar/refactorizar

No se han encontrado pares de archivos completos que deban fusionarse. Sí se aplicarán estas consolidaciones de bajo riesgo:

| Archivo(s) | Refactorización prevista |
|---|---|
| `lib/stripe.ts` y consumidores | Eliminar el “barrel” redundante que reexporta el catálogo completo de `lib/plans.ts`. Los consumidores importarán reglas comerciales directamente desde `lib/plans.ts`; `lib/stripe.ts` quedará como única fuente de integración Stripe. |
| `components/Motion.tsx` | Retirar `stagger`, variante exportada sin consumidor. |
| `components/Skeleton.tsx` | Retirar `ButtonSpinner`, wrapper sin consumidor sobre `Spinner`. |
| `components/Toast.tsx` | Retirar `useToastApi`, hook sin consumidor; se conserva `useToast`, usado por los flujos activos. |
| `lib/db.ts` | Retirar helpers nunca invocados (`isDbPoolConfigured`, `transaction`, `purgeTenantDb`, `purgeAllTenantsDb`) y su tipo importado asociado. Se conservan pool, consultas y health checks activos. |
| `lib/ingest.ts` | Retirar `gateBody`, wrapper sin consumidor. |
| `lib/maps.ts` | Retirar `googleMapsLink`; se conserva `googleReviewLink`, usado en los flujos de feedback y tienda. |
| `lib/openai.ts` | Retirar aliases/telemetría sin consumidores (`DEFAULT_OPENAI_MODEL`, `modelPricing`, `openAiConcurrency`) y convertir helpers usados solo dentro del módulo en privados. |
| `lib/plans.ts` | Retirar constantes documentales sin consumidores (`PAID_PLAN_IDS`, `PAID_PLANS`, `PURGE_STRATEGY`). |
| `lib/queue.ts` | Retirar `queueStatus`, wrapper sin consumidor; se conserva `isQueueConfigured`, usado por health y encolado. |
| `lib/usage.ts` | Retirar APIs legacy sin consumidores (`incrementUsage`, `canConsume`, `quotaExceeded`, `STORAGE_ROW_KB`) y el mapeo inverso que solo soportaba una de ellas. |

Además se añadirá una configuración ESLint explícita y reproducible, porque el script original `npm run lint` abre un asistente interactivo y falla en CI. Esto afecta a `package.json`, `package-lock.json` y un nuevo `.eslintrc.json`.

## 4. Impacto y seguridad

- **Compilación:** los símbolos seleccionados no tienen imports ni llamadas activas. Tras los cambios se repetirán typecheck, lint y build de producción.
- **Variables de entorno:** no se elimina ni renombra ninguna variable. `.env.example`, `lib/env.ts`, Docker y Vercel se conservan.
- **Base de datos:** no se modifica ni elimina el esquema ni la cadena de migraciones. Las funciones SQL siguen intactas; solo se retiran wrappers TypeScript que no eran llamados.
- **Flujos principales:** se mantienen landing, autenticación, onboarding, dashboard, administración, Stripe, IA, reseñas, feedback, cron, cola, webhooks e integraciones.
- **Compatibilidad externa:** no se elimina ninguna ruta API. Los exports retirados pertenecen a un paquete privado (`"private": true`) y no forman parte de una API npm pública.
- **Rollback:** todos los cambios quedan trazables en Git y el entregable limpio excluye únicamente archivos regenerables y el ZIP de origen.

La declaración de no impacto queda condicionada a la validación final automatizada, cuyos resultados se registrarán al final de este documento.

## 5. Validación final

Resultado posterior a la limpieza:

| Control | Resultado |
|---|---|
| `npm ci` | Correcto; lockfile reproducible. |
| `npm run typecheck` | Correcto, sin errores TypeScript. |
| `npm run lint` | Correcto, sin warnings ni errores. El comando ya es no interactivo y apto para CI. |
| `npm run build` | Correcto; compilación de producción completada y **38 rutas/páginas** generadas. |
| `git diff --check` | Correcto; sin errores de whitespace. |
| Revisión del grafo posterior | Sin módulos huérfanos nuevos ni referencias a los símbolos retirados. |

Durante la activación de ESLint también se retiraron imports/variables que la nueva comprobación confirmó como muertos (`ZERO_USAGE`, una instancia no usada de `useToast`, y tipos/imports que habían quedado sin consumidor tras la limpieza).

### Observación de dependencias

`npm audit --omit=dev` informa 5 avisos heredados (2 low, 2 high y 1 critical) en la línea antigua de Next.js 14 y en Nodemailer/Supabase SSR. Las correcciones automáticas propuestas exigen saltos mayores (`next` 16, `nodemailer` 10 y `@supabase/ssr` 0.12), por lo que **no se mezclan en esta limpieza estructural**: requerirían una migración funcional independiente con pruebas de regresión. No se ejecutó `npm audit fix --force` para no introducir cambios incompatibles de forma silenciosa.

## 6. Declaración final de seguridad funcional

Después de las validaciones anteriores, la eliminación realizada **no afecta a la compilación, las variables de entorno, el esquema o las migraciones de base de datos, ni a los flujos principales o endpoints externos**. El proyecto conserva los mismos 38 puntos de entrada compilados que la línea base.
