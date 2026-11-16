package com.controlgastos.app.sync;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Ejecutor puro e independiente del ciclo de vida de la UI para operaciones push y pull.
 * Maneja verificación de compatibilidad, idempotencia, reconciliación ante cortes de red
 * y recuperación segura tras interrupción del proceso.
 */
public class SyncExecutor {

    public interface CancellationSignal {
        boolean isStopped();
    }

    public interface StateListener {
        void onStateChanged(JSONObject updatedRequest);
    }

    public enum Outcome {
        SUCCEEDED,
        PARTIAL,
        FAILED,
        UNCERTAIN,
        CANCELLED,
        RETRY_NEEDED
    }

    private final SyncRequestRepository repository;
    private final AppsScriptHttpClient.Transport transport;
    private final StateListener listener;

    public SyncExecutor(
            SyncRequestRepository repository,
            AppsScriptHttpClient.Transport transport,
            StateListener listener
    ) {
        this.repository = repository;
        this.transport = transport;
        this.listener = listener;
    }

    public Outcome execute(String requestId, CancellationSignal cancellation, int runAttempt) {
        JSONObject req = repository.getRequest(requestId);
        if (req == null) {
            return Outcome.FAILED;
        }

        if (SyncConstants.STATUS_CANCELLED.equals(req.optString("status"))) {
            return Outcome.CANCELLED;
        }

        final int effectiveAttempt = Math.max(runAttempt, req.optInt("attemptCount", 0) + 1);
        req = updateAndNotify(requestId, obj -> {
            obj.put("status", SyncConstants.STATUS_RUNNING);
            obj.put("attemptCount", effectiveAttempt);
            obj.put("progressMessage", "Iniciando sincronización en segundo plano…");
        });

        String type = req.optString("type", "");
        String scriptUrl = req.optString("scriptUrl", "");
        if (scriptUrl.trim().isEmpty()) {
            finishWithError(requestId, SyncConstants.STATUS_FAILED, SyncConstants.ERROR_INVALID_REQUEST,
                    "URL de Google Apps Script no configurada.");
            return Outcome.FAILED;
        }

        if (SyncConstants.TYPE_PUSH.equals(type)) {
            return executePush(req, cancellation, effectiveAttempt);
        } else if (SyncConstants.TYPE_PULL_MONTH.equals(type)) {
            return executePullMonth(req, cancellation, effectiveAttempt);
        } else if (SyncConstants.TYPE_PULL_FULL.equals(type)) {
            return executePullFull(req, cancellation, effectiveAttempt);
        } else {
            finishWithError(requestId, SyncConstants.STATUS_FAILED, SyncConstants.ERROR_INVALID_REQUEST,
                    "Tipo de operación desconocido: " + type);
            return Outcome.FAILED;
        }
    }

    private Outcome executePush(JSONObject req, CancellationSignal cancellation, int attempt) {
        String requestId = req.optString("requestId");
        String scriptUrl = req.optString("scriptUrl");
        JSONArray tasks = req.optJSONArray("tasks");

        if (tasks == null || tasks.length() == 0) {
            JSONObject emptyResult = new JSONObject();
            try {
                emptyResult.put("processed", 0);
                emptyResult.put("appliedCount", 0);
                emptyResult.put("duplicateCount", 0);
                emptyResult.put("failedCount", 0);
                emptyResult.put("results", new JSONArray());
                emptyResult.put("monthsAffected", new JSONArray());
                emptyResult.put("monthsData", new JSONObject());
            } catch (JSONException ignored) {}
            finishWithSuccess(requestId, SyncConstants.STATUS_SUCCEEDED, tasksLength(tasks), tasksLength(tasks),
                    "Sin tareas pendientes.", emptyResult);
            return Outcome.SUCCEEDED;
        }

        // 1. Verificar capacidades del Apps Script remoto antes de enviar mutaciones
        try {
            JSONObject ping = AppsScriptHttpClient.parseJsonResponse(
                    transport.get(buildUrl(scriptUrl, "action=ping&_t=" + System.currentTimeMillis()))
            );
            JSONObject caps = ping.optJSONObject("capabilities");
            boolean supportsIdempotency = caps != null
                    && caps.optBoolean("idempotency", false)
                    && caps.optBoolean("taskIds", false);
            if (!supportsIdempotency) {
                finishWithError(
                        requestId,
                        SyncConstants.STATUS_FAILED,
                        SyncConstants.ERROR_BACKEND_INCOMPATIBLE,
                        "El script remoto de Google Sheets no soporta sincronización idempotente (requiere Apps Script v4.1+). Copia el código actualizado desde Ajustes y vuelve a implementarlo para evitar duplicados."
                );
                return Outcome.FAILED;
            }
        } catch (AppsScriptHttpClient.HttpException e) {
            finishWithError(requestId, SyncConstants.STATUS_FAILED, e.errorCode, e.getMessage());
            return Outcome.FAILED;
        } catch (IOException netErr) {
            return handleNetworkInterruption(requestId, attempt, 0, tasks.length(),
                    "Sin conexión al verificar Google Sheets: " + safeMsg(netErr), false);
        }

        if (isStopped(cancellation, requestId)) return Outcome.CANCELLED;

        // Mapa persistente de resultados por clave (mutationId || id)
        Map<String, JSONObject> resultMap = loadPersistedTaskResults(req.optJSONObject("confirmedTaskIds"));
        JSONObject mergedMonthsData = req.optJSONObject("monthsDataCache");
        if (mergedMonthsData == null) mergedMonthsData = new JSONObject();

        // 2. Si es un reintento tras interrupción previa o corte de respuesta, consultar primero el estado real en servidor
        if (attempt > 1) {
            List<String> unresolvedIds = collectUnresolvedMutationIds(tasks, resultMap);
            if (!unresolvedIds.isEmpty()) {
                updateProgress(requestId, countConfirmed(tasks, resultMap), tasks.length(),
                        "Comprobando cambios ya aplicados en Excel…");
                try {
                    queryAndMergeTaskStatuses(scriptUrl, tasks, unresolvedIds, resultMap);
                    persistPartialPushState(requestId, tasks, resultMap, mergedMonthsData);
                } catch (IOException netErr) {
                    return handleNetworkInterruption(requestId, attempt, countConfirmed(tasks, resultMap), tasks.length(),
                            "No se pudo verificar el estado previo en Excel: " + safeMsg(netErr), true);
                } catch (AppsScriptHttpClient.HttpException scriptErr) {
                    // Continuamos solo si el error no impide avanzar; si falla backend, reportamos fallo
                    finishWithError(requestId, SyncConstants.STATUS_FAILED, scriptErr.errorCode, scriptErr.getMessage());
                    return Outcome.FAILED;
                }
            }
        }

        // 3. Filtrar tareas aún pendientes de aplicar
        List<JSONObject> pendingTasks = filterPendingTasks(tasks, resultMap);
        int totalTasks = tasks.length();
        int chunkSize = SyncConstants.MAX_TASKS_PER_BATCH;

        for (int offset = 0; offset < pendingTasks.size(); offset += chunkSize) {
            if (isStopped(cancellation, requestId)) return Outcome.CANCELLED;

            int end = Math.min(offset + chunkSize, pendingTasks.size());
            JSONArray chunkArray = new JSONArray();
            List<String> chunkMutationIds = new ArrayList<>();
            for (int i = offset; i < end; i++) {
                JSONObject item = pendingTasks.get(i);
                chunkArray.put(item);
                String mId = taskKey(item);
                if (!mId.isEmpty()) chunkMutationIds.add(mId);
            }

            int alreadyConfirmed = countConfirmed(tasks, resultMap);
            updateProgress(requestId, alreadyConfirmed, totalTasks,
                    "Subiendo " + Math.min(alreadyConfirmed + 1, totalTasks) + "–" + Math.min(alreadyConfirmed + chunkArray.length(), totalTasks) + " de " + totalTasks + " cambios…");

            try {
                JSONObject postPayload = new JSONObject();
                postPayload.put("action", "pushBatchChanges");
                postPayload.put("batchId", requestId + "_b" + (offset / chunkSize));
                postPayload.put("tasks", chunkArray.toString());

                String raw = transport.postJson(scriptUrl, postPayload.toString());
                JSONObject batchRes = AppsScriptHttpClient.parseJsonResponse(raw);

                JSONArray resultsArr = batchRes.optJSONArray("results");
                if (resultsArr == null) {
                    finishWithError(requestId, SyncConstants.STATUS_FAILED, SyncConstants.ERROR_BACKEND_INCOMPATIBLE,
                            "Respuesta de lote sin resultados individuales. Actualiza Apps Script a v4.1+.");
                    return Outcome.FAILED;
                }

                mergeBatchResults(resultsArr, resultMap);
                mergeMonthsData(mergedMonthsData, batchRes.optJSONObject("monthsData"));
                persistPartialPushState(requestId, tasks, resultMap, mergedMonthsData);
            } catch (IOException netErr) {
                // Corte de red o timeout justo durante el POST: el servidor pudo haber aplicado parte del lote.
                // Consultamos inmediatamente getTaskStatuses para reconciliar antes de reintentar.
                try {
                    if (!chunkMutationIds.isEmpty()) {
                        queryAndMergeTaskStatuses(scriptUrl, tasks, chunkMutationIds, resultMap);
                        persistPartialPushState(requestId, tasks, resultMap, mergedMonthsData);
                    }
                } catch (Exception ignored) {
                    // Sigue sin red: WorkManager reintentará y volverá a reconciliar antes de enviar.
                }
                return handleNetworkInterruption(requestId, attempt, countConfirmed(tasks, resultMap), totalTasks,
                        "Conexión interrumpida durante la subida: " + safeMsg(netErr), true);
            } catch (AppsScriptHttpClient.HttpException scriptErr) {
                finishWithError(requestId, SyncConstants.STATUS_FAILED, scriptErr.errorCode, scriptErr.getMessage());
                return Outcome.FAILED;
            } catch (JSONException jsonErr) {
                finishWithError(requestId, SyncConstants.STATUS_FAILED, SyncConstants.ERROR_INVALID_REQUEST,
                        "Error construyendo lote JSON: " + jsonErr.getMessage());
                return Outcome.FAILED;
            }
        }

        // 4. Construir resultado consolidado final
        return finalizePushOutcome(requestId, tasks, resultMap, mergedMonthsData);
    }

    private Outcome finalizePushOutcome(
            String requestId,
            JSONArray tasks,
            Map<String, JSONObject> resultMap,
            JSONObject mergedMonthsData
    ) {
        JSONArray consolidatedResults = new JSONArray();
        List<String> monthsAffected = new ArrayList<>();
        int appliedCount = 0;
        int duplicateCount = 0;
        int failedCount = 0;
        String firstFailureMsg = null;

        for (int i = 0; i < tasks.length(); i++) {
            JSONObject task = tasks.optJSONObject(i);
            if (task == null) continue;
            String key = taskKey(task);
            String month = task.optString("month", "");
            JSONObject res = resultMap.get(key);

            if (res == null) {
                failedCount++;
                JSONObject unknownErr = new JSONObject();
                try {
                    unknownErr.put("id", task.optString("id", ""));
                    unknownErr.put("mutationId", task.optString("mutationId", ""));
                    unknownErr.put("action", task.optString("action", ""));
                    unknownErr.put("month", month);
                    unknownErr.put("status", "failed");
                    unknownErr.put("error", "Sin confirmación del servidor");
                } catch (JSONException ignored) {}
                consolidatedResults.put(unknownErr);
                if (firstFailureMsg == null) firstFailureMsg = "Alguna tarea no recibió confirmación";
                continue;
            }

            consolidatedResults.put(res);
            String st = res.optString("status", "");
            if ("applied".equals(st)) {
                appliedCount++;
                if (!month.isEmpty() && !monthsAffected.contains(month)) monthsAffected.add(month);
            } else if ("duplicate".equals(st)) {
                duplicateCount++;
                if (!month.isEmpty() && !monthsAffected.contains(month)) monthsAffected.add(month);
            } else {
                failedCount++;
                if (firstFailureMsg == null) {
                    firstFailureMsg = res.optString("error", "Error aplicando tarea");
                }
            }
        }

        int confirmedTotal = appliedCount + duplicateCount;
        JSONObject finalPayload = new JSONObject();
        try {
            finalPayload.put("processed", confirmedTotal);
            finalPayload.put("appliedCount", appliedCount);
            finalPayload.put("duplicateCount", duplicateCount);
            finalPayload.put("failedCount", failedCount);
            finalPayload.put("total", tasks.length());
            finalPayload.put("results", consolidatedResults);
            finalPayload.put("monthsAffected", new JSONArray(monthsAffected));
            finalPayload.put("monthsData", mergedMonthsData);
        } catch (JSONException ignored) {}

        if (failedCount == 0) {
            finishWithSuccess(
                    requestId,
                    SyncConstants.STATUS_SUCCEEDED,
                    confirmedTotal,
                    tasks.length(),
                    confirmedTotal + " cambio(s) sincronizados correctamente.",
                    finalPayload
            );
            return Outcome.SUCCEEDED;
        } else if (confirmedTotal > 0) {
            finishWithPartialOrError(
                    requestId,
                    SyncConstants.STATUS_PARTIAL,
                    SyncConstants.ERROR_REMOTE_SCRIPT,
                    "Subidos " + confirmedTotal + " de " + tasks.length() + " cambios. Fallaron " + failedCount + ": " + firstFailureMsg,
                    confirmedTotal,
                    tasks.length(),
                    finalPayload
            );
            return Outcome.PARTIAL;
        } else {
            finishWithPartialOrError(
                    requestId,
                    SyncConstants.STATUS_FAILED,
                    SyncConstants.ERROR_REMOTE_SCRIPT,
                    "No se pudo aplicar ningún cambio: " + (firstFailureMsg != null ? firstFailureMsg : "Error desconocido"),
                    0,
                    tasks.length(),
                    finalPayload
            );
            return Outcome.FAILED;
        }
    }

    private Outcome executePullMonth(JSONObject req, CancellationSignal cancellation, int attempt) {
        String requestId = req.optString("requestId");
        String scriptUrl = req.optString("scriptUrl");
        String month = req.optString("targetMonth", "Septiembre");

        updateProgress(requestId, 0, 2, "Descargando " + month + " desde Excel…");
        if (isStopped(cancellation, requestId)) return Outcome.CANCELLED;

        JSONObject monthData;
        try {
            String raw = transport.get(buildUrl(scriptUrl,
                    "action=getMonthData&month=" + encodeUrl(month) + "&_t=" + System.currentTimeMillis()));
            monthData = AppsScriptHttpClient.parseJsonResponse(raw);
        } catch (AppsScriptHttpClient.HttpException scriptErr) {
            finishWithError(requestId, SyncConstants.STATUS_FAILED, scriptErr.errorCode, scriptErr.getMessage());
            return Outcome.FAILED;
        } catch (IOException netErr) {
            return handleNetworkInterruption(requestId, attempt, 0, 2,
                    "Error de red al descargar " + month + ": " + safeMsg(netErr), false);
        }

        if (isStopped(cancellation, requestId)) return Outcome.CANCELLED;
        updateProgress(requestId, 1, 2, "Actualizando categorías…");

        JSONObject categoriesData = null;
        List<String> failedParts = new ArrayList<>();
        try {
            String catRaw = transport.get(buildUrl(scriptUrl, "action=getCategories&_t=" + System.currentTimeMillis()));
            categoriesData = AppsScriptHttpClient.parseJsonResponse(catRaw);
        } catch (Exception catErr) {
            failedParts.add("categories: " + safeMsg(catErr));
        }

        JSONObject resultPayload = new JSONObject();
        try {
            resultPayload.put("month", month);
            resultPayload.put("monthData", monthData);
            if (categoriesData != null) resultPayload.put("categories", categoriesData);
            resultPayload.put("failedParts", new JSONArray(failedParts));
            resultPayload.put("partial", !failedParts.isEmpty());
        } catch (JSONException ignored) {}

        if (failedParts.isEmpty()) {
            finishWithSuccess(requestId, SyncConstants.STATUS_SUCCEEDED, 2, 2,
                    month + " descargado correctamente.", resultPayload);
            return Outcome.SUCCEEDED;
        } else {
            finishWithPartialOrError(requestId, SyncConstants.STATUS_PARTIAL, SyncConstants.ERROR_REMOTE_SCRIPT,
                    month + " descargado, pero falló la actualización de categorías.",
                    1, 2, resultPayload);
            return Outcome.PARTIAL;
        }
    }

    private Outcome executePullFull(JSONObject req, CancellationSignal cancellation, int attempt) {
        String requestId = req.optString("requestId");
        String scriptUrl = req.optString("scriptUrl");
        String month = req.optString("targetMonth", "Septiembre");

        updateProgress(requestId, 0, 5, "Descargando sincronización completa (" + month + ")…");
        if (isStopped(cancellation, requestId)) return Outcome.CANCELLED;

        // 1. Intentar llamada unificada getFullSyncData (v4.0+)
        try {
            String raw = transport.get(buildUrl(scriptUrl,
                    "action=getFullSyncData&month=" + encodeUrl(month) + "&_t=" + System.currentTimeMillis()));
            JSONObject fullRes = AppsScriptHttpClient.parseJsonResponse(raw);
            if (fullRes.optBoolean("success", false) && fullRes.optJSONObject("monthData") != null) {
                finishWithSuccess(requestId, SyncConstants.STATUS_SUCCEEDED, 5, 5,
                        "Sincronización completa descargada (" + month + ").", fullRes);
                return Outcome.SUCCEEDED;
            }
        } catch (IOException netErr) {
            return handleNetworkInterruption(requestId, attempt, 0, 5,
                    "Sin conexión durante la descarga completa: " + safeMsg(netErr), false);
        } catch (AppsScriptHttpClient.HttpException ignored) {
            // Puede tratarse de una versión antigua de script sin getFullSyncData: intentamos descarga modular
        }

        // 2. Fallback modular con seguimiento estricto de éxitos/fallos por parte
        int targetIdx = indexOfMonth(month);
        String prevMonth = SyncConstants.ALL_MONTHS[(targetIdx - 1 + 12) % 12];
        String nextMonth = SyncConstants.ALL_MONTHS[(targetIdx + 1) % 12];

        JSONObject mainMonthData = null;
        JSONObject colindantMonths = new JSONObject();
        JSONObject controlPanel = null;
        JSONObject categories = null;
        List<String> failedParts = new ArrayList<>();
        int succeededParts = 0;

        try {
            updateProgress(requestId, 1, 5, "Descargando " + month + "…");
            mainMonthData = AppsScriptHttpClient.parseJsonResponse(
                    transport.get(buildUrl(scriptUrl, "action=getMonthData&month=" + encodeUrl(month) + "&_t=" + System.currentTimeMillis()))
            );
            succeededParts++;
        } catch (IOException netErr) {
            return handleNetworkInterruption(requestId, attempt, succeededParts, 5,
                    "Sin conexión descargando " + month + ": " + safeMsg(netErr), false);
        } catch (Exception e) {
            failedParts.add(month + ": " + safeMsg(e));
        }

        if (isStopped(cancellation, requestId)) return Outcome.CANCELLED;

        try {
            updateProgress(requestId, 2, 5, "Descargando " + prevMonth + "…");
            JSONObject prev = AppsScriptHttpClient.parseJsonResponse(
                    transport.get(buildUrl(scriptUrl, "action=getMonthData&month=" + encodeUrl(prevMonth) + "&_t=" + System.currentTimeMillis()))
            );
            colindantMonths.put(prevMonth, prev);
            succeededParts++;
        } catch (Exception e) {
            failedParts.add(prevMonth + ": " + safeMsg(e));
        }

        if (isStopped(cancellation, requestId)) return Outcome.CANCELLED;

        try {
            updateProgress(requestId, 3, 5, "Descargando " + nextMonth + "…");
            JSONObject next = AppsScriptHttpClient.parseJsonResponse(
                    transport.get(buildUrl(scriptUrl, "action=getMonthData&month=" + encodeUrl(nextMonth) + "&_t=" + System.currentTimeMillis()))
            );
            colindantMonths.put(nextMonth, next);
            succeededParts++;
        } catch (Exception e) {
            failedParts.add(nextMonth + ": " + safeMsg(e));
        }

        if (isStopped(cancellation, requestId)) return Outcome.CANCELLED;

        try {
            updateProgress(requestId, 4, 5, "Descargando Panel de Control…");
            controlPanel = AppsScriptHttpClient.parseJsonResponse(
                    transport.get(buildUrl(scriptUrl, "action=getControlPanelData&_t=" + System.currentTimeMillis()))
            );
            succeededParts++;
        } catch (Exception e) {
            failedParts.add("Panel de control: " + safeMsg(e));
        }

        if (isStopped(cancellation, requestId)) return Outcome.CANCELLED;

        try {
            updateProgress(requestId, 5, 5, "Descargando categorías…");
            categories = AppsScriptHttpClient.parseJsonResponse(
                    transport.get(buildUrl(scriptUrl, "action=getCategories&_t=" + System.currentTimeMillis()))
            );
            succeededParts++;
        } catch (Exception e) {
            failedParts.add("Categorías: " + safeMsg(e));
        }

        JSONObject result = new JSONObject();
        try {
            result.put("success", failedParts.isEmpty());
            result.put("partial", !failedParts.isEmpty() && succeededParts > 0);
            result.put("month", month);
            if (mainMonthData != null) result.put("monthData", mainMonthData);
            result.put("colindantMonths", colindantMonths);
            if (controlPanel != null) result.put("controlPanel", controlPanel);
            if (categories != null) result.put("categories", categories);
            result.put("failedParts", new JSONArray(failedParts));
        } catch (JSONException ignored) {}

        if (succeededParts == 0 || mainMonthData == null) {
            finishWithPartialOrError(
                    requestId,
                    SyncConstants.STATUS_FAILED,
                    SyncConstants.ERROR_REMOTE_SCRIPT,
                    "La descarga falló (" + String.join("; ", failedParts) + ").",
                    succeededParts,
                    5,
                    result
            );
            return Outcome.FAILED;
        } else if (!failedParts.isEmpty()) {
            finishWithPartialOrError(
                    requestId,
                    SyncConstants.STATUS_PARTIAL,
                    SyncConstants.ERROR_REMOTE_SCRIPT,
                    "Descarga parcial: " + month + " actualizado, pero fallaron " + failedParts.size() + " parte(s).",
                    succeededParts,
                    5,
                    result
            );
            return Outcome.PARTIAL;
        } else {
            finishWithSuccess(requestId, SyncConstants.STATUS_SUCCEEDED, 5, 5,
                    "Descarga completa finalizada.", result);
            return Outcome.SUCCEEDED;
        }
    }

    private void queryAndMergeTaskStatuses(
            String scriptUrl,
            JSONArray tasks,
            List<String> mutationIds,
            Map<String, JSONObject> resultMap
    ) throws IOException {
        JSONObject payload = new JSONObject();
        try {
            payload.put("action", "getTaskStatuses");
            payload.put("mutationIds", new JSONArray(mutationIds).toString());
        } catch (JSONException ignored) {}

        String raw = transport.postJson(scriptUrl, payload.toString());
        JSONObject res = AppsScriptHttpClient.parseJsonResponse(raw);
        JSONObject statuses = res.optJSONObject("statuses");
        if (statuses == null) return;

        for (int i = 0; i < tasks.length(); i++) {
            JSONObject t = tasks.optJSONObject(i);
            if (t == null) continue;
            String mId = taskKey(t);
            if (mId.isEmpty() || resultMap.containsKey(mId)) continue;
            JSONObject statusObj = statuses.optJSONObject(mId);
            if (statusObj != null && "applied".equals(statusObj.optString("status"))) {
                JSONObject confirmed = new JSONObject();
                try {
                    confirmed.put("id", t.optString("id", ""));
                    confirmed.put("mutationId", t.optString("mutationId", mId));
                    confirmed.put("action", t.optString("action", ""));
                    confirmed.put("month", t.optString("month", ""));
                    confirmed.put("status", "duplicate");
                    if (!statusObj.isNull("row")) confirmed.put("row", statusObj.opt("row"));
                } catch (JSONException ignored) {}
                resultMap.put(mId, confirmed);
            }
        }
    }

    private Outcome handleNetworkInterruption(
            String requestId,
            int attempt,
            int current,
            int total,
            String message,
            boolean mayHaveWrittenToServer
    ) {
        if (attempt < SyncConstants.MAX_WORK_ATTEMPTS) {
            updateAndNotify(requestId, obj -> {
                obj.put("status", SyncConstants.STATUS_QUEUED);
                obj.put("progressCurrent", current);
                obj.put("progressTotal", total);
                obj.put("progressMessage", "Esperando red para reintentar (" + attempt + "/" + SyncConstants.MAX_WORK_ATTEMPTS + ")…");
                obj.put("errorCode", SyncConstants.ERROR_NETWORK);
                obj.put("errorMessage", message);
            });
            return Outcome.RETRY_NEEDED;
        }

        String terminalStatus = mayHaveWrittenToServer
                ? SyncConstants.STATUS_UNCERTAIN
                : SyncConstants.STATUS_FAILED;
        String finalMsg = mayHaveWrittenToServer
                ? message + " El resultado de algunas tareas en Excel no pudo confirmarse. Revisa tus gastos y pulsa reintentar."
                : message;
        finishWithError(requestId, terminalStatus, SyncConstants.ERROR_NETWORK, finalMsg);
        return mayHaveWrittenToServer ? Outcome.UNCERTAIN : Outcome.FAILED;
    }

    private static Map<String, JSONObject> loadPersistedTaskResults(JSONObject stored) {
        Map<String, JSONObject> map = new HashMap<>();
        if (stored == null) return map;
        JSONArray names = stored.names();
        if (names == null) return map;
        for (int i = 0; i < names.length(); i++) {
            String k = names.optString(i, "");
            if (k.isEmpty()) continue;
            JSONObject val = stored.optJSONObject(k);
            if (val != null) map.put(k, val);
        }
        return map;
    }

    private void persistPartialPushState(
            String requestId,
            JSONArray tasks,
            Map<String, JSONObject> resultMap,
            JSONObject monthsDataCache
    ) {
        JSONObject persistedMap = new JSONObject();
        for (Map.Entry<String, JSONObject> entry : resultMap.entrySet()) {
            try {
                persistedMap.put(entry.getKey(), entry.getValue());
            } catch (JSONException ignored) {}
        }
        int confirmed = countConfirmed(tasks, resultMap);
        updateAndNotify(requestId, obj -> {
            obj.put("confirmedTaskIds", persistedMap);
            obj.put("monthsDataCache", monthsDataCache);
            obj.put("progressCurrent", confirmed);
            obj.put("progressTotal", tasks.length());
        });
    }

    private static void mergeBatchResults(JSONArray resultsArr, Map<String, JSONObject> resultMap) {
        for (int i = 0; i < resultsArr.length(); i++) {
            JSONObject item = resultsArr.optJSONObject(i);
            if (item == null) continue;
            String key = item.optString("mutationId", item.optString("id", ""));
            if (!key.isEmpty()) {
                resultMap.put(key, item);
            }
        }
    }

    private static void mergeMonthsData(JSONObject target, JSONObject source) {
        if (source == null) return;
        JSONArray names = source.names();
        if (names == null) return;
        for (int i = 0; i < names.length(); i++) {
            String key = names.optString(i, "");
            if (!key.isEmpty()) {
                try {
                    target.put(key, source.get(key));
                } catch (JSONException ignored) {}
            }
        }
    }

    private static List<String> collectUnresolvedMutationIds(JSONArray tasks, Map<String, JSONObject> resultMap) {
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject t = tasks.optJSONObject(i);
            if (t == null) continue;
            String key = taskKey(t);
            if (!key.isEmpty() && !resultMap.containsKey(key)) {
                ids.add(key);
            }
        }
        return ids;
    }

    private static List<JSONObject> filterPendingTasks(JSONArray tasks, Map<String, JSONObject> resultMap) {
        List<JSONObject> pending = new ArrayList<>();
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject t = tasks.optJSONObject(i);
            if (t == null) continue;
            String key = taskKey(t);
            JSONObject existing = resultMap.get(key);
            if (existing == null || "failed".equals(existing.optString("status"))) {
                // No reintentar automáticamente fallos de negocio definitivos en el mismo intento;
                // solo enviamos tareas sin resultado aún.
                if (existing == null) pending.add(t);
            }
        }
        return pending;
    }

    private static int countConfirmed(JSONArray tasks, Map<String, JSONObject> resultMap) {
        int count = 0;
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject t = tasks.optJSONObject(i);
            if (t == null) continue;
            JSONObject res = resultMap.get(taskKey(t));
            if (res != null) {
                String st = res.optString("status", "");
                if ("applied".equals(st) || "duplicate".equals(st)) count++;
            }
        }
        return count;
    }

    private static String taskKey(JSONObject task) {
        if (task == null) return "";
        String mId = task.optString("mutationId", "");
        if (!mId.isEmpty()) return mId;
        return task.optString("id", "");
    }

    private static int tasksLength(JSONArray tasks) {
        return tasks != null ? tasks.length() : 0;
    }

    private static int indexOfMonth(String month) {
        if (month == null) return 8;
        for (int i = 0; i < SyncConstants.ALL_MONTHS.length; i++) {
            if (SyncConstants.ALL_MONTHS[i].equalsIgnoreCase(month.trim())) return i;
        }
        return 8;
    }

    private static String buildUrl(String baseUrl, String query) {
        return baseUrl + (baseUrl.contains("?") ? "&" : "?") + query;
    }

    private static String encodeUrl(String value) {
        try {
            return URLEncoder.encode(value != null ? value : "", "UTF-8");
        } catch (UnsupportedEncodingException e) {
            return value != null ? value : "";
        }
    }

    private static String safeMsg(Throwable t) {
        if (t == null || t.getMessage() == null || t.getMessage().trim().isEmpty()) {
            return t != null ? t.getClass().getSimpleName() : "Error desconocido";
        }
        return t.getMessage();
    }

    private boolean isStopped(CancellationSignal cancellation, String requestId) {
        if (cancellation != null && cancellation.isStopped()) {
            repository.markCancelled(requestId);
            notifyCurrent(requestId);
            return true;
        }
        JSONObject cur = repository.getRequest(requestId);
        return cur != null && SyncConstants.STATUS_CANCELLED.equals(cur.optString("status"));
    }

    private void updateProgress(String requestId, int current, int total, String msg) {
        updateAndNotify(requestId, obj -> {
            obj.put("status", SyncConstants.STATUS_RUNNING);
            obj.put("progressCurrent", current);
            obj.put("progressTotal", total);
            obj.put("progressMessage", msg);
        });
    }

    private void finishWithSuccess(
            String requestId,
            String status,
            int current,
            int total,
            String msg,
            JSONObject result
    ) {
        updateAndNotify(requestId, obj -> {
            obj.put("status", status);
            obj.put("progressCurrent", current);
            obj.put("progressTotal", total);
            obj.put("progressMessage", msg);
            obj.put("result", result);
            obj.remove("errorCode");
            obj.remove("errorMessage");
        });
    }

    private void finishWithPartialOrError(
            String requestId,
            String status,
            String errorCode,
            String errorMessage,
            int current,
            int total,
            JSONObject result
    ) {
        updateAndNotify(requestId, obj -> {
            obj.put("status", status);
            obj.put("progressCurrent", current);
            obj.put("progressTotal", total);
            obj.put("progressMessage", errorMessage);
            obj.put("errorCode", errorCode);
            obj.put("errorMessage", errorMessage);
            if (result != null) obj.put("result", result);
        });
    }

    private void finishWithError(String requestId, String status, String errorCode, String errorMessage) {
        updateAndNotify(requestId, obj -> {
            obj.put("status", status);
            obj.put("progressMessage", errorMessage);
            obj.put("errorCode", errorCode);
            obj.put("errorMessage", errorMessage);
        });
    }

    private JSONObject updateAndNotify(String requestId, SyncRequestRepository.Mutator mutator) {
        JSONObject updated = repository.updateRequest(requestId, mutator);
        if (updated != null && listener != null) {
            listener.onStateChanged(updated);
        }
        return updated;
    }

    private void notifyCurrent(String requestId) {
        JSONObject current = repository.getRequest(requestId);
        if (current != null && listener != null) {
            listener.onStateChanged(current);
        }
    }
}
