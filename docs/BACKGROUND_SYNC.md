# Sincronización en Segundo Plano y Recuperación Segura (Android + Google Apps Script v4.1)

## Arquitectura

1. **Coordinador JS (`src/lib/syncManager.js` + `src/lib/sheetsApi.js`)**
   - Serializa las operaciones `push`, `pull_month` y `pull_full` evitando dobles pulsaciones y carreras entre subida y descarga.
   - Asigna un `mutationId` único a cada tarea encolada (`localStorage`), regenerándolo automáticamente si el usuario edita una tarea local ya en cola.
   - Tras recibir confirmaciones del servidor, aplica `applyPushResultsToQueue(...)` eliminando **únicamente** las tareas confirmadas (`applied` o `duplicate`) cuyo `mutationId` coincida con el enviado; cualquier edición o alta añadida mientras se ejecutaba la sincronización se conserva intacta.
   - Al aplicar datos descargados (`saveSingleMonthDataToCache`), reaplica encima las mutaciones locales aún pendientes en `pushQueue` para no sobrescribir trabajo sin subir.

2. **Plugin Capacitor + Persistencia Nativa + AndroidX WorkManager (`android/app/src/main/java/com/controlgastos/app/sync/`)**
   - `BackgroundSyncPlugin`: Expone `enqueuePush`, `enqueuePullMonth`, `enqueueFullSync`, `getSyncStates`, `acknowledgeSync` y `cancelSync`.
   - `SyncRequestRepository`: Guarda cada solicitud (`requestId`, tipo, `scriptUrl`, snapshot completo de tareas, meses, progreso y resultado) en almacenamiento interno nativo (`filesDir/bg_sync_requests/`) **antes** de confirmar el inicio o encolar en WorkManager. No toca `localStorage` del WebView desde Java ni excede los límites de `WorkManager Data`.
   - `BackgroundSyncWorker`: Ejecuta las peticiones HTTP GET/POST directamente en Java (`AppsScriptHttpClient`) mediante `WorkManager` con restricción `NetworkType.CONNECTED`, política `ExistingWorkPolicy.APPEND_OR_REPLACE` y `OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST`.
   - **Recuperación tras cierre / cambio de app**: Al arrancar la app y en `appStateChange` (`isActive`), `initSyncCoordinator` consulta `BackgroundSync.getSyncStates()`, restaura barras de progreso si el worker sigue vivo, aplica resultados pendientes a `localStorage` y solo entonces llama a `acknowledgeSync`.

3. **Backend Google Apps Script (`Files/google-apps-script.js` → v4.1.0)**
   - Añade bloqueo de concurrencia mediante `LockService.getScriptLock()`.
   - Mantiene un registro rolling de idempotencia por `mutationId` en `PropertiesService.getScriptProperties()` (`IDEM_*`, hasta 140 claves recientes).
   - `pushBatchChanges` devuelve resultados individuales por tarea (`applied`, `duplicate` o `failed`) sin silenciar errores.
   - Añade `getTaskStatuses` para reconciliar qué tareas llegaron a escribirse en Google Sheets si se corta la red antes de recibir la respuesta HTTP.
   - **Seguridad ante scripts antiguos**: Si `ping` indica que el script remoto no expone `capabilities.idempotency`, el cliente y el worker rechazan ejecutar lotes con riesgo de duplicados y piden actualizar el script en Google Sheets.

## Actualización obligatoria de Google Apps Script (v4.1.0)

Para habilitar la sincronización segura en segundo plano:
1. Abre la app → **Ajustes ⚙️** → pulsa **Copiar código de Google Apps Script (v4.1 Sync Segura)** (o copia `Files/google-apps-script.js`).
2. En tu hoja de Google Sheets ve a **Extensiones → Apps Script**, reemplaza todo el código y guarda.
3. Pulsa **Implementar → Administrar implementaciones → Editar (lápiz) → Versión: Nueva versión → Implementar** (con acceso **Cualquier persona**).

## Garantías reales y límites honestos

- **Sí sobrevive a**: cambiar de aplicación, bloquear la pantalla, perder temporalmente la cobertura de red (WorkManager reintenta cuando vuelve `CONNECTED`) y cierres del proceso por memoria del sistema (al volver a abrir la app se recupera el estado y se concilia con `getTaskStatuses`).
- **No garantiza**:
  - Ejecución tras **Forzar detención** desde los ajustes del sistema Android (Android cancela todos los `JobScheduler`/`WorkManager` de la app hasta que el usuario vuelva a abrirla).
  - Ejecución instantánea e ininterrumpida bajo ahorro agresivo de batería / Doze si se agota la cuota de trabajos *expedited* (en cuyo caso WorkManager difiere el trabajo hasta una ventana de mantenimiento con red).
  - En navegador **Web** (sin Android nativo), cerrar la pestaña interrumpe la petición en curso; la recuperación automática con WorkManager aplica únicamente en Android nativo.

## Verificación manual recomendada

1. **Segundo plano y bloqueo**: Encola 3 gastos, pulsa **Push** y bloquea la pantalla o cambia a otra app inmediatamente; verifica en Google Sheets que los 3 gastos aparecen y al volver a la app la cola queda vacía.
2. **Corte de red**: Activa modo avión, pulsa **Push**, bloquea/sal de la app, reactiva Wi‑Fi/datos y espera unos segundos; verifica que sube sin duplicados y al abrir la app aparece sincronizado.
3. **Doble toque / Pull concurrente**: Pulsa **Push** dos veces seguidas o intenta pulsar **Pull** mientras sube; debe deduplicar o bloquear la operación incompatible.
4. **Lote parcial**: Añade una tarea con fila inválida o sin backend actualizado; verifica que solo se limpian de la cola local las tareas confirmadas y el error conserva la pendiente.
5. **Edición durante Push**: Inicia un **Push** en segundo plano y modifica/añade otro gasto mientras termina; verifica que la tarea modificada/nueva permanece en la cola local para el siguiente Push.
