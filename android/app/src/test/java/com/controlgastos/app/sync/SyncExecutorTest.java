package com.controlgastos.app.sync;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * Pruebas unitarias de SyncExecutor:
 * - Rechazo seguro de Apps Script antiguo sin idempotencia
 * - Lote parcial con resultados por tarea
 * - Recuperación tras pérdida de respuesta usando getTaskStatuses sin duplicar altas
 * - Lote exhausto de red -> STATUS_UNCERTAIN
 * - Pull completo con fallo parcial en fallback modular -> STATUS_PARTIAL
 */
public class SyncExecutorTest {

    @Rule
    public TemporaryFolder tempFolder = new TemporaryFolder();

    private static final class StubTransport implements AppsScriptHttpClient.Transport {
        interface Responder {
            String respond(String method, String url, String body) throws IOException;
        }

        private final Responder responder;
        final List<String> calls = new ArrayList<>();

        StubTransport(Responder responder) {
            this.responder = responder;
        }

        @Override
        public String get(String url) throws IOException {
            calls.add("GET " + url);
            return responder.respond("GET", url, null);
        }

        @Override
        public String postJson(String url, String jsonBody) throws IOException {
            calls.add("POST " + jsonBody);
            return responder.respond("POST", url, jsonBody);
        }
    }

    @Test
    public void rejectsLegacyBackendWithoutIdempotencyCapability() throws Exception {
        SyncRequestRepository repo = new SyncRequestRepository(tempFolder.newFolder("legacy"));
        JSONArray tasks = new JSONArray().put(new JSONObject()
                .put("id", "t1")
                .put("mutationId", "mut_1")
                .put("action", "addExpense")
                .put("month", "Abril")
                .put("payload", new JSONObject().put("category", "Café").put("amount", 2.5)));

        repo.saveNewRequest(new JSONObject()
                .put("requestId", "req_legacy")
                .put("type", SyncConstants.TYPE_PUSH)
                .put("status", SyncConstants.STATUS_QUEUED)
                .put("scriptUrl", "https://script.google.com/macros/s/test/exec")
                .put("tasks", tasks));

        StubTransport transport = new StubTransport((method, url, body) -> {
            if (url.contains("action=ping")) {
                return "{\"status\":\"ok\",\"version\":\"4.0.2\"}";
            }
            throw new AssertionError("No debe enviarse pushBatchChanges a un backend sin idempotencia");
        });

        SyncExecutor executor = new SyncExecutor(repo, transport, null);
        SyncExecutor.Outcome outcome = executor.execute("req_legacy", () -> false, 1);

        assertEquals(SyncExecutor.Outcome.FAILED, outcome);
        JSONObject req = repo.getRequest("req_legacy");
        assertEquals(SyncConstants.STATUS_FAILED, req.getString("status"));
        assertEquals(SyncConstants.ERROR_BACKEND_INCOMPATIBLE, req.getString("errorCode"));
        assertEquals(1, transport.calls.size());
    }

    @Test
    public void handlesPartialBatchFailureExplicitly() throws Exception {
        SyncRequestRepository repo = new SyncRequestRepository(tempFolder.newFolder("partial"));
        JSONArray tasks = new JSONArray()
                .put(new JSONObject().put("id", "t1").put("mutationId", "mut_1").put("action", "addExpense").put("month", "Abril"))
                .put(new JSONObject().put("id", "t2").put("mutationId", "mut_2").put("action", "addExpense").put("month", "Abril"));

        repo.saveNewRequest(new JSONObject()
                .put("requestId", "req_partial")
                .put("type", SyncConstants.TYPE_PUSH)
                .put("status", SyncConstants.STATUS_QUEUED)
                .put("scriptUrl", "https://script.google.com/macros/s/test/exec")
                .put("tasks", tasks));

        StubTransport transport = new StubTransport((method, url, body) -> {
            if ("GET".equals(method) && url.contains("action=ping")) {
                return "{\"status\":\"ok\",\"version\":\"4.1.0\",\"capabilities\":{\"idempotency\":true,\"taskIds\":true}}";
            }
            return "{\"success\":false,\"partial\":true,\"processed\":1,\"appliedCount\":1,\"failedCount\":1," +
                    "\"results\":[{\"id\":\"t1\",\"mutationId\":\"mut_1\",\"status\":\"applied\",\"row\":13}," +
                    "{\"id\":\"t2\",\"mutationId\":\"mut_2\",\"status\":\"failed\",\"error\":\"Límite de filas alcanzado\"}]}";
        });

        SyncExecutor executor = new SyncExecutor(repo, transport, null);
        SyncExecutor.Outcome outcome = executor.execute("req_partial", () -> false, 1);

        assertEquals(SyncExecutor.Outcome.PARTIAL, outcome);
        JSONObject saved = repo.getRequest("req_partial");
        assertEquals(SyncConstants.STATUS_PARTIAL, saved.getString("status"));
        assertEquals(1, saved.getJSONObject("result").getInt("processed"));
        assertEquals(1, saved.getJSONObject("result").getInt("failedCount"));
    }

    @Test
    public void recoversFromLostPostResponseUsingGetTaskStatusesWithoutDuplicating() throws Exception {
        SyncRequestRepository repo = new SyncRequestRepository(tempFolder.newFolder("recover"));
        JSONArray tasks = new JSONArray()
                .put(new JSONObject().put("id", "t1").put("mutationId", "mut_1").put("action", "addExpense").put("month", "Abril"))
                .put(new JSONObject().put("id", "t2").put("mutationId", "mut_2").put("action", "addExpense").put("month", "Abril"));

        repo.saveNewRequest(new JSONObject()
                .put("requestId", "req_rec")
                .put("type", SyncConstants.TYPE_PUSH)
                .put("status", SyncConstants.STATUS_QUEUED)
                .put("scriptUrl", "https://script.google.com/macros/s/test/exec")
                .put("tasks", tasks));

        final int[] pushPostCount = {0};
        StubTransport transport = new StubTransport((method, url, body) -> {
            if ("GET".equals(method) && url.contains("action=ping")) {
                return "{\"status\":\"ok\",\"version\":\"4.1.0\",\"capabilities\":{\"idempotency\":true,\"taskIds\":true}}";
            }
            JSONObject reqBody = new JSONObject(body);
            String action = reqBody.optString("action");
            if ("pushBatchChanges".equals(action)) {
                pushPostCount[0]++;
                if (pushPostCount[0] == 1) {
                    // Primer POST escribió mut_1 en servidor pero se corta la respuesta
                    throw new IOException("Connection reset by peer");
                }
                // En el segundo intento SOLO debe venir mut_2
                JSONArray sent = new JSONArray(reqBody.getString("tasks"));
                assertEquals(1, sent.length());
                assertEquals("mut_2", sent.getJSONObject(0).getString("mutationId"));
                return "{\"success\":true,\"results\":[{\"id\":\"t2\",\"mutationId\":\"mut_2\",\"status\":\"applied\",\"row\":14}]}";
            }
            if ("getTaskStatuses".equals(action)) {
                return "{\"success\":true,\"statuses\":{\"mut_1\":{\"status\":\"applied\",\"row\":13},\"mut_2\":{\"status\":\"unknown\"}}}";
            }
            throw new AssertionError("Acción inesperada: " + action);
        });

        SyncExecutor executor = new SyncExecutor(repo, transport, null);

        // Intento 1: falla la red durante POST, reconcilia mut_1 vía getTaskStatuses y pide retry
        SyncExecutor.Outcome first = executor.execute("req_rec", () -> false, 1);
        assertEquals(SyncExecutor.Outcome.RETRY_NEEDED, first);

        // Intento 2 (reintento de WorkManager): solo envía mut_2 y concluye SUCCEEDED
        SyncExecutor.Outcome second = executor.execute("req_rec", () -> false, 2);
        assertEquals(SyncExecutor.Outcome.SUCCEEDED, second);

        JSONObject finalReq = repo.getRequest("req_rec");
        assertEquals(SyncConstants.STATUS_SUCCEEDED, finalReq.getString("status"));
        assertEquals(2, finalReq.getJSONObject("result").getInt("processed"));
    }

    @Test
    public void exhaustedNetworkRetriesDuringPushEndsAsUncertain() throws Exception {
        SyncRequestRepository repo = new SyncRequestRepository(tempFolder.newFolder("uncertain"));
        JSONArray tasks = new JSONArray()
                .put(new JSONObject().put("id", "t1").put("mutationId", "mut_1").put("action", "addExpense").put("month", "Abril"));

        repo.saveNewRequest(new JSONObject()
                .put("requestId", "req_unc")
                .put("type", SyncConstants.TYPE_PUSH)
                .put("status", SyncConstants.STATUS_QUEUED)
                .put("scriptUrl", "https://script.google.com/macros/s/test/exec")
                .put("tasks", tasks));

        StubTransport transport = new StubTransport((method, url, body) -> {
            if ("GET".equals(method) && url.contains("action=ping")) {
                return "{\"status\":\"ok\",\"version\":\"4.1.0\",\"capabilities\":{\"idempotency\":true,\"taskIds\":true}}";
            }
            throw new IOException("Timeout waiting for response");
        });

        SyncExecutor executor = new SyncExecutor(repo, transport, null);
        SyncExecutor.Outcome outcome = executor.execute("req_unc", () -> false, SyncConstants.MAX_WORK_ATTEMPTS);

        assertEquals(SyncExecutor.Outcome.UNCERTAIN, outcome);
        assertEquals(SyncConstants.STATUS_UNCERTAIN, repo.getRequest("req_unc").getString("status"));
    }

    @Test
    public void fullSyncFallbackMarksPartialWhenSecondarySectionFails() throws Exception {
        SyncRequestRepository repo = new SyncRequestRepository(tempFolder.newFolder("pull_partial"));
        repo.saveNewRequest(new JSONObject()
                .put("requestId", "req_pull")
                .put("type", SyncConstants.TYPE_PULL_FULL)
                .put("status", SyncConstants.STATUS_QUEUED)
                .put("targetMonth", "Abril")
                .put("scriptUrl", "https://script.google.com/macros/s/test/exec"));

        StubTransport transport = new StubTransport((method, url, body) -> {
            if (url.contains("action=getFullSyncData")) {
                return "{\"error\":\"Script function not found\"}";
            }
            if (url.contains("action=getControlPanelData")) {
                return "{\"error\":\"Fallo temporal en Panel de control\"}";
            }
            if (url.contains("action=getCategories")) {
                return "{\"categories\":[\"Supermercado\"],\"incomeCategories\":[\"Nómina\"]}";
            }
            return "{\"success\":true,\"month\":\"Abril\",\"summary\":{\"income\":1500,\"variableExpenses\":100},\"expenses\":[],\"fixedExpenses\":[]}";
        });

        SyncExecutor executor = new SyncExecutor(repo, transport, null);
        SyncExecutor.Outcome outcome = executor.execute("req_pull", () -> false, 1);

        assertEquals(SyncExecutor.Outcome.PARTIAL, outcome);
        JSONObject saved = repo.getRequest("req_pull");
        assertEquals(SyncConstants.STATUS_PARTIAL, saved.getString("status"));
        assertTrue(saved.getJSONObject("result").getBoolean("partial"));
        assertEquals(1, saved.getJSONObject("result").getJSONArray("failedParts").length());
        assertNotNull(saved.getJSONObject("result").getJSONObject("monthData"));
        assertFalse(saved.getJSONObject("result").getBoolean("success"));
    }
}
