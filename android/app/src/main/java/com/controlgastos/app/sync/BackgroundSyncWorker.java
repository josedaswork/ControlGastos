package com.controlgastos.app.sync;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.ServiceInfo;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Data;
import androidx.work.ForegroundInfo;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.controlgastos.app.R;

/**
 * Worker de AndroidX WorkManager que ejecuta operaciones push y pull contra Google Apps Script
 * completamente desacoplado de React y del WebView.
 */
public class BackgroundSyncWorker extends Worker {

    public BackgroundSyncWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        String requestId = getInputData().getString(SyncConstants.INPUT_REQUEST_ID);
        if (requestId == null || requestId.trim().isEmpty()) {
            return Result.failure();
        }

        SyncRequestRepository repository = new SyncRequestRepository(getApplicationContext());
        SyncExecutor executor = new SyncExecutor(
                repository,
                new AppsScriptHttpClient.HttpUrlConnectionTransport(),
                updatedRequest -> {
                    int cur = updatedRequest.optInt("progressCurrent", 0);
                    int tot = updatedRequest.optInt("progressTotal", 0);
                    String status = updatedRequest.optString("status", "");
                    setProgressAsync(new Data.Builder()
                            .putString(SyncConstants.INPUT_REQUEST_ID, requestId)
                            .putString("status", status)
                            .putInt("progressCurrent", cur)
                            .putInt("progressTotal", tot)
                            .build());
                    BackgroundSyncPlugin.notifyStateChanged(updatedRequest);
                }
        );

        SyncExecutor.Outcome outcome = executor.execute(
                requestId,
                this::isStopped,
                getRunAttemptCount() + 1
        );

        if (outcome == SyncExecutor.Outcome.RETRY_NEEDED) {
            return Result.retry();
        }
        if (outcome == SyncExecutor.Outcome.SUCCEEDED || outcome == SyncExecutor.Outcome.PARTIAL) {
            return Result.success();
        }
        return Result.failure();
    }

    @NonNull
    @Override
    public ForegroundInfo getForegroundInfo() {
        Context context = getApplicationContext();
        ensureNotificationChannel(context);

        Notification notification = new NotificationCompat.Builder(context, SyncConstants.NOTIFICATION_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(context.getString(R.string.sync_notification_title))
                .setContentText(context.getString(R.string.sync_notification_text))
                .setOngoing(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return new ForegroundInfo(
                    SyncConstants.NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            );
        }
        return new ForegroundInfo(SyncConstants.NOTIFICATION_ID, notification);
    }

    private static void ensureNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        if (manager.getNotificationChannel(SyncConstants.NOTIFICATION_CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
                SyncConstants.NOTIFICATION_CHANNEL_ID,
                context.getString(R.string.sync_notification_channel_name),
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }
}
