package com.controlgastos.app.sync;

import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.OutOfQuotaPolicy;
import androidx.work.WorkManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * Plugin local de Capacitor que expone el encolado persistente en WorkManager y la recuperación
 * de operaciones push y pull tras cambio de app, bloqueo o muerte del proceso.
 */
@CapacitorPlugin(name = "BackgroundSync")
public class BackgroundSyncPlugin extends Plugin {

    private static WeakReference<BackgroundSyncPlugin> activeInstance = new WeakReference<>(null);
    private SyncRequestRepository repository;

    @Override
    public void load() {
        super.load();
        repository = new SyncRequestRepository(getContext());
        activeInstance = new WeakReference<>(this);
    }

    @Override
    protected void handleOnDestroy() {
        BackgroundSyncPlugin cur = activeInstance.get();
        if (cur == this) {
            activeInstance = new WeakReference<>(null);
        }
        super.handleOnDestroy();
    }

    public static void notifyStateChanged(JSONObject requestJson) {
        BackgroundSyncPlugin plugin = activeInstance.get();
        if (plugin == null || requestJson == null) return;
        try {
            JSObject payload = JSObject.fromJSONObject(sanitizeForBridge(requestJson));
            plugin.notifyListeners("syncStateChanged", payload);
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void enqueuePush(PluginCall call) {
        String scriptUrl = call.getString("scriptUrl", "").trim();
        JSArray rawTasks = call.getArray("tasks");
        if (scriptUrl.isEmpty()) {
            call.reject("URL de Apps Script requerida");
            return;
        }
        if (rawTasks == null || rawTasks.length() == 0) {
            call.reject("No hay tareas para encolar");
            return;
        }

        try {
            JSONArray tasks = new JSONArray(rawTasks.toString());
            JSONObject existing = repository.findActiveDuplicate(SyncConstants.TYPE_PUSH, "", tasks);
            if (existing != null) {
                JSObject response = JSObject.fromJSONObject(sanitizeForBridge(existing));
                response.put("deduplicated", true);
                call.resolve(response);
                return;
            }

            String requestId = "sync_push_" + UUID.randomUUID().toString().replace("-", "");
            JSONArray months = new JSONArray();
            for (int i = 0; i < tasks.length(); i++) {
                JSONObject t = tasks.optJSONObject(i);
                if (t == null) continue;
                String m = t.optString("month", "");
                if (!m.isEmpty() && !jsonArrayContains(months, m)) {
                    months.put(m);
                }
            }

            JSONObject request = new JSONObject();
            request.put("requestId", requestId);
            request.put("type", SyncConstants.TYPE_PUSH);
            request.put("status", SyncConstants.STATUS_QUEUED);
            request.put("scriptUrl", scriptUrl);
            request.put("tasks", tasks);
            request.put("months", months);
            request.put("progressCurrent", 0);
            request.put("progressTotal", tasks.length());
            request.put("progressMessage", "En cola (esperando red o ejecución)…");

            // Persistir SIEMPRE antes de confirmar el inicio o encolar en WorkManager
            JSONObject saved = repository.saveNewRequest(request);
            enqueueWork(requestId);

            JSObject response = JSObject.fromJSONObject(sanitizeForBridge(saved));
            response.put("deduplicated", false);
            call.resolve(response);
        } catch (Exception e) {
            call.reject("No se pudo encolar la subida: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void enqueuePullMonth(PluginCall call) {
        String scriptUrl = call.getString("scriptUrl", "").trim();
        String month = call.getString("month", "").trim();
        if (scriptUrl.isEmpty() || month.isEmpty()) {
            call.reject("scriptUrl y month son obligatorios");
            return;
        }

        try {
            JSONObject existing = repository.findActiveDuplicate(SyncConstants.TYPE_PULL_MONTH, month, null);
            if (existing != null) {
                JSObject response = JSObject.fromJSONObject(sanitizeForBridge(existing));
                response.put("deduplicated", true);
                call.resolve(response);
                return;
            }

            String requestId = "sync_pullm_" + UUID.randomUUID().toString().replace("-", "");
            JSONArray months = new JSONArray();
            months.put(month);

            JSONObject request = new JSONObject();
            request.put("requestId", requestId);
            request.put("type", SyncConstants.TYPE_PULL_MONTH);
            request.put("status", SyncConstants.STATUS_QUEUED);
            request.put("scriptUrl", scriptUrl);
            request.put("targetMonth", month);
            request.put("months", months);
            request.put("progressCurrent", 0);
            request.put("progressTotal", 2);
            request.put("progressMessage", "Descarga de " + month + " en cola…");

            JSONObject saved = repository.saveNewRequest(request);
            enqueueWork(requestId);

            JSObject response = JSObject.fromJSONObject(sanitizeForBridge(saved));
            response.put("deduplicated", false);
            call.resolve(response);
        } catch (Exception e) {
            call.reject("No se pudo encolar la descarga: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void enqueueFullSync(PluginCall call) {
        String scriptUrl = call.getString("scriptUrl", "").trim();
        String month = call.getString("month", "Septiembre").trim();
        if (scriptUrl.isEmpty()) {
            call.reject("scriptUrl es obligatorio");
            return;
        }

        try {
            JSONObject existing = repository.findActiveDuplicate(SyncConstants.TYPE_PULL_FULL, month, null);
            if (existing != null) {
                JSObject response = JSObject.fromJSONObject(sanitizeForBridge(existing));
                response.put("deduplicated", true);
                call.resolve(response);
                return;
            }

            String requestId = "sync_pullf_" + UUID.randomUUID().toString().replace("-", "");
            JSONArray months = new JSONArray();
            months.put(month);

            JSONObject request = new JSONObject();
            request.put("requestId", requestId);
            request.put("type", SyncConstants.TYPE_PULL_FULL);
            request.put("status", SyncConstants.STATUS_QUEUED);
            request.put("scriptUrl", scriptUrl);
            request.put("targetMonth", month);
            request.put("months", months);
            request.put("progressCurrent", 0);
            request.put("progressTotal", 5);
            request.put("progressMessage", "Descarga completa en cola…");

            JSONObject saved = repository.saveNewRequest(request);
            enqueueWork(requestId);

            JSObject response = JSObject.fromJSONObject(sanitizeForBridge(saved));
            response.put("deduplicated", false);
            call.resolve(response);
        } catch (Exception e) {
            call.reject("No se pudo encolar la sincronización completa: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getSyncStates(PluginCall call) {
        try {
            List<JSONObject> list = repository.listUnacknowledgedOrActive();
            JSArray arr = new JSArray();
            for (JSONObject item : list) {
                arr.put(JSObject.fromJSONObject(sanitizeForBridge(item)));
            }
            JSObject result = new JSObject();
            result.put("requests", arr);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Error leyendo estados de sincronización: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void acknowledgeSync(PluginCall call) {
        String requestId = call.getString("requestId", "").trim();
        if (requestId.isEmpty()) {
            call.reject("requestId requerido");
            return;
        }
        boolean removed = repository.acknowledgeRequest(requestId);
        JSObject res = new JSObject();
        res.put("acknowledged", true);
        res.put("removed", removed);
        call.resolve(res);
    }

    @PluginMethod
    public void cancelSync(PluginCall call) {
        String requestId = call.getString("requestId", "").trim();
        if (requestId.isEmpty()) {
            call.reject("requestId requerido");
            return;
        }
        WorkManager.getInstance(getContext()).cancelAllWorkByTag(SyncConstants.WORK_TAG_PREFIX + requestId);
        repository.markCancelled(requestId);
        JSONObject updated = repository.getRequest(requestId);
        if (updated != null) {
            notifyStateChanged(updated);
        }
        JSObject res = new JSObject();
        res.put("cancelled", true);
        call.resolve(res);
    }

    private void enqueueWork(String requestId) {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        OneTimeWorkRequest workRequest = new OneTimeWorkRequest.Builder(BackgroundSyncWorker.class)
                .setConstraints(constraints)
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
                .setInputData(new Data.Builder()
                        .putString(SyncConstants.INPUT_REQUEST_ID, requestId)
                        .build())
                .addTag(SyncConstants.WORK_TAG_PREFIX + requestId)
                .build();

        WorkManager.getInstance(getContext()).enqueueUniqueWork(
                SyncConstants.UNIQUE_WORK_NAME,
                ExistingWorkPolicy.APPEND_OR_REPLACE,
                workRequest
        );
    }

    private static boolean jsonArrayContains(JSONArray arr, String val) {
        for (int i = 0; i < arr.length(); i++) {
            if (val.equals(arr.optString(i))) return true;
        }
        return false;
    }

    private static JSONObject sanitizeForBridge(JSONObject full) throws JSONException {
        JSONObject copy = new JSONObject(full.toString());
        // Evitar devolver campos internos pesados si no hace falta (mantenemos tasks para conciliación exacta)
        copy.remove("monthsDataCache");
        return copy;
    }
}
