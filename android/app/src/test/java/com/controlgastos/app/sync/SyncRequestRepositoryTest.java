package com.controlgastos.app.sync;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * Pruebas unitarias de persistencia nativa de solicitudes de sincronización,
 * deduplicación de envíos concurrentes y ciclo de confirmación (acknowledge).
 */
public class SyncRequestRepositoryTest {

    @Rule
    public TemporaryFolder tempFolder = new TemporaryFolder();

    @Test
    public void saveGetListAndAcknowledgeLifecycle() throws Exception {
        SyncRequestRepository repo = new SyncRequestRepository(tempFolder.newFolder("sync_store"));

        JSONArray tasks = new JSONArray();
        tasks.put(new JSONObject()
                .put("id", "t1")
                .put("mutationId", "mut_1")
                .put("action", "addExpense")
                .put("month", "Abril"));

        JSONObject req = new JSONObject()
                .put("requestId", "req_1")
                .put("type", SyncConstants.TYPE_PUSH)
                .put("status", SyncConstants.STATUS_QUEUED)
                .put("scriptUrl", "https://script.google.com/macros/s/demo/exec")
                .put("tasks", tasks);

        repo.saveNewRequest(req);

        JSONObject loaded = repo.getRequest("req_1");
        assertNotNull(loaded);
        assertEquals(SyncConstants.STATUS_QUEUED, loaded.getString("status"));
        assertFalse(loaded.getBoolean("acknowledged"));

        List<JSONObject> activeOrUnacked = repo.listUnacknowledgedOrActive();
        assertEquals(1, activeOrUnacked.size());
        assertEquals("req_1", activeOrUnacked.get(0).getString("requestId"));

        repo.updateRequest("req_1", obj -> obj.put("status", SyncConstants.STATUS_SUCCEEDED));
        assertEquals(SyncConstants.STATUS_SUCCEEDED, repo.getRequest("req_1").getString("status"));

        assertTrue(repo.acknowledgeRequest("req_1"));
        assertNull(repo.getRequest("req_1"));
        assertEquals(0, repo.listUnacknowledgedOrActive().size());
    }

    @Test
    public void findActiveDuplicateDetectsDoubleTapPushAndPull() throws Exception {
        SyncRequestRepository repo = new SyncRequestRepository(tempFolder.newFolder("sync_dedup"));

        JSONArray tasksA = new JSONArray();
        tasksA.put(new JSONObject().put("id", "slot_1").put("mutationId", "mut_100"));

        repo.saveNewRequest(new JSONObject()
                .put("requestId", "req_push_1")
                .put("type", SyncConstants.TYPE_PUSH)
                .put("status", SyncConstants.STATUS_RUNNING)
                .put("tasks", tasksA));

        JSONArray tasksSame = new JSONArray();
        tasksSame.put(new JSONObject().put("id", "slot_1").put("mutationId", "mut_100"));
        assertNotNull(repo.findActiveDuplicate(SyncConstants.TYPE_PUSH, "", tasksSame));

        // Si la tarea local se editó o se añadió otra (nuevo mutationId), NO debe deduplicar
        JSONArray tasksModified = new JSONArray();
        tasksModified.put(new JSONObject().put("id", "slot_1").put("mutationId", "mut_101"));
        assertNull(repo.findActiveDuplicate(SyncConstants.TYPE_PUSH, "", tasksModified));

        repo.saveNewRequest(new JSONObject()
                .put("requestId", "req_pull_1")
                .put("type", SyncConstants.TYPE_PULL_MONTH)
                .put("status", SyncConstants.STATUS_QUEUED)
                .put("targetMonth", "Abril"));

        assertNotNull(repo.findActiveDuplicate(SyncConstants.TYPE_PULL_MONTH, "Abril", null));
        assertNull(repo.findActiveDuplicate(SyncConstants.TYPE_PULL_MONTH, "Mayo", null));
    }
}
