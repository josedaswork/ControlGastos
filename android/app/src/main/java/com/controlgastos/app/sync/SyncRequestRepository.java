package com.controlgastos.app.sync;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Repositorio nativo persistente (en archivos internos de la app, no en localStorage ni
 * en los límites de WorkManager Data) para almacenar solicitudes, progreso, tareas y resultados.
 */
public class SyncRequestRepository {

    private static final Object FILE_LOCK = new Object();
    private final File storageDir;

    public SyncRequestRepository(Context context) {
        this(new File(context.getApplicationContext().getFilesDir(), SyncConstants.STORAGE_DIR_NAME));
    }

    public SyncRequestRepository(File storageDir) {
        this.storageDir = storageDir;
        if (!this.storageDir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            this.storageDir.mkdirs();
        }
    }

    public JSONObject saveNewRequest(JSONObject request) throws IOException, JSONException {
        synchronized (FILE_LOCK) {
            long now = System.currentTimeMillis();
            if (!request.has("createdAt")) request.put("createdAt", now);
            request.put("updatedAt", now);
            if (!request.has("acknowledged")) request.put("acknowledged", false);
            if (!request.has("attemptCount")) request.put("attemptCount", 0);
            if (!request.has("confirmedTaskIds")) request.put("confirmedTaskIds", new JSONObject());
            writeFileAtomic(request.getString("requestId"), request);
            return new JSONObject(request.toString());
        }
    }

    public JSONObject findActiveDuplicate(String type, String targetMonth, JSONArray tasks) {
        synchronized (FILE_LOCK) {
            List<JSONObject> all = listAllUnlocked();
            Set<String> newMutationSet = extractMutationSet(tasks);

            for (JSONObject req : all) {
                String status = req.optString("status", "");
                if (!SyncConstants.isActiveStatus(status)) continue;
                if (!type.equals(req.optString("type", ""))) continue;

                if (SyncConstants.TYPE_PULL_FULL.equals(type)) {
                    String existingMonth = req.optString("targetMonth", "");
                    if (existingMonth.equals(targetMonth != null ? targetMonth : "")) {
                        return req;
                    }
                } else if (SyncConstants.TYPE_PULL_MONTH.equals(type)) {
                    String existingMonth = req.optString("targetMonth", "");
                    if (existingMonth.equals(targetMonth != null ? targetMonth : "")) {
                        return req;
                    }
                } else if (SyncConstants.TYPE_PUSH.equals(type)) {
                    Set<String> existingSet = extractMutationSet(req.optJSONArray("tasks"));
                    if (!newMutationSet.isEmpty() && newMutationSet.equals(existingSet)) {
                        return req;
                    }
                }
            }
            return null;
        }
    }

    public JSONObject getRequest(String requestId) {
        if (requestId == null || requestId.trim().isEmpty()) return null;
        synchronized (FILE_LOCK) {
            return readFileUnlocked(requestId);
        }
    }

    public JSONObject updateRequest(String requestId, Mutator mutator) {
        synchronized (FILE_LOCK) {
            JSONObject current = readFileUnlocked(requestId);
            if (current == null) return null;
            try {
                mutator.mutate(current);
                current.put("updatedAt", System.currentTimeMillis());
                writeFileAtomic(requestId, current);
                return new JSONObject(current.toString());
            } catch (Exception e) {
                return current;
            }
        }
    }

    public List<JSONObject> listUnacknowledgedOrActive() {
        synchronized (FILE_LOCK) {
            List<JSONObject> all = listAllUnlocked();
            List<JSONObject> filtered = new ArrayList<>();
            for (JSONObject obj : all) {
                String status = obj.optString("status", "");
                boolean acknowledged = obj.optBoolean("acknowledged", false);
                if (!acknowledged || SyncConstants.isActiveStatus(status)) {
                    filtered.add(obj);
                }
            }
            return filtered;
        }
    }

    public boolean acknowledgeRequest(String requestId) {
        if (requestId == null || requestId.trim().isEmpty()) return false;
        synchronized (FILE_LOCK) {
            File target = fileFor(requestId);
            if (!target.exists()) return false;
            return target.delete();
        }
    }

    public void markCancelled(String requestId) {
        updateRequest(requestId, obj -> {
            String status = obj.optString("status", "");
            if (SyncConstants.isActiveStatus(status)) {
                obj.put("status", SyncConstants.STATUS_CANCELLED);
                obj.put("progressMessage", "Sincronización cancelada por el usuario");
            }
        });
    }

    private static Set<String> extractMutationSet(JSONArray tasks) {
        Set<String> set = new HashSet<>();
        if (tasks == null) return set;
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject t = tasks.optJSONObject(i);
            if (t == null) continue;
            String mId = t.optString("mutationId", t.optString("id", ""));
            if (!mId.isEmpty()) set.add(mId);
        }
        return set;
    }

    private List<JSONObject> listAllUnlocked() {
        List<JSONObject> list = new ArrayList<>();
        if (!storageDir.exists()) return list;
        File[] files = storageDir.listFiles((dir, name) -> name.endsWith(".json") && !name.endsWith(".tmp.json"));
        if (files == null) return list;

        for (File f : files) {
            JSONObject obj = readRawFile(f);
            if (obj != null) list.add(obj);
        }

        Collections.sort(list, Comparator.comparingLong(o -> o.optLong("createdAt", 0L)));
        return list;
    }

    private File fileFor(String requestId) {
        String safe = requestId.replaceAll("[^a-zA-Z0-9_\\-.]", "_");
        return new File(storageDir, safe + ".json");
    }

    private JSONObject readFileUnlocked(String requestId) {
        File file = fileFor(requestId);
        if (!file.exists()) return null;
        return readRawFile(file);
    }

    private JSONObject readRawFile(File file) {
        try (FileInputStream fis = new FileInputStream(file);
             ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096];
            int n;
            while ((n = fis.read(buf)) != -1) {
                baos.write(buf, 0, n);
            }
            String json = baos.toString(StandardCharsets.UTF_8.name());
            return new JSONObject(json);
        } catch (Exception e) {
            return null;
        }
    }

    private void writeFileAtomic(String requestId, JSONObject obj) throws IOException {
        if (!storageDir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            storageDir.mkdirs();
        }
        File target = fileFor(requestId);
        File temp = new File(storageDir, target.getName() + ".tmp");
        byte[] bytes = obj.toString().getBytes(StandardCharsets.UTF_8);
        try (FileOutputStream fos = new FileOutputStream(temp)) {
            fos.write(bytes);
            fos.getFD().sync();
        }
        if (target.exists() && !target.delete()) {
            // Fall back to direct overwrite if rename cannot replace
            try (FileOutputStream fos = new FileOutputStream(target)) {
                fos.write(bytes);
                fos.getFD().sync();
            }
            //noinspection ResultOfMethodCallIgnored
            temp.delete();
            return;
        }
        if (!temp.renameTo(target)) {
            try (FileOutputStream fos = new FileOutputStream(target)) {
                fos.write(bytes);
                fos.getFD().sync();
            }
            //noinspection ResultOfMethodCallIgnored
            temp.delete();
        }
    }

    public interface Mutator {
        void mutate(JSONObject request) throws JSONException;
    }
}
