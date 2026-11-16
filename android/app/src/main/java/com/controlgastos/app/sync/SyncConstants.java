package com.controlgastos.app.sync;

/**
 * Constantes compartidas para la infraestructura nativa de sincronización en segundo plano.
 */
public final class SyncConstants {

    private SyncConstants() {}

    public static final String TYPE_PUSH = "push";
    public static final String TYPE_PULL_MONTH = "pull_month";
    public static final String TYPE_PULL_FULL = "pull_full";

    public static final String STATUS_QUEUED = "queued";
    public static final String STATUS_RUNNING = "running";
    public static final String STATUS_SUCCEEDED = "succeeded";
    public static final String STATUS_PARTIAL = "partial";
    public static final String STATUS_FAILED = "failed";
    public static final String STATUS_UNCERTAIN = "uncertain";
    public static final String STATUS_CANCELLED = "cancelled";

    public static final String ERROR_BACKEND_INCOMPATIBLE = "BACKEND_INCOMPATIBLE";
    public static final String ERROR_NETWORK = "NETWORK_ERROR";
    public static final String ERROR_INVALID_REQUEST = "INVALID_REQUEST";
    public static final String ERROR_REMOTE_SCRIPT = "REMOTE_SCRIPT_ERROR";

    public static final String UNIQUE_WORK_NAME = "control_gastos_sync_serial";
    public static final String WORK_TAG_PREFIX = "sync_req_";
    public static final String INPUT_REQUEST_ID = "requestId";

    public static final String STORAGE_DIR_NAME = "bg_sync_requests";

    public static final String NOTIFICATION_CHANNEL_ID = "control_gastos_sync_channel";
    public static final int NOTIFICATION_ID = 4102;

    public static final int MAX_TASKS_PER_BATCH = 20;
    public static final int MAX_WORK_ATTEMPTS = 4;

    public static final String[] ALL_MONTHS = {
            "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    };

    public static boolean isTerminalStatus(String status) {
        return STATUS_SUCCEEDED.equals(status)
                || STATUS_PARTIAL.equals(status)
                || STATUS_FAILED.equals(status)
                || STATUS_UNCERTAIN.equals(status)
                || STATUS_CANCELLED.equals(status);
    }

    public static boolean isActiveStatus(String status) {
        return STATUS_QUEUED.equals(status) || STATUS_RUNNING.equals(status);
    }
}
