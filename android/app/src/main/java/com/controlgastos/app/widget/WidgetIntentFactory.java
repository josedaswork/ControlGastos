package com.controlgastos.app.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import com.controlgastos.app.MainActivity;

/**
 * Factoría de {@link Intent} explícitos y {@link PendingIntent} seguros
 * compatibles con API 24–36 y aislados por instancia ({@code appWidgetId}).
 */
public final class WidgetIntentFactory {

    private WidgetIntentFactory() {
        // Utility class
    }

    public static PendingIntent createOpenAppPendingIntent(Context context, int appWidgetId) {
        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setAction(Intent.ACTION_MAIN);
        launchIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        launchIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_CLEAR_TOP
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP
        );
        launchIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        launchIntent.setData(Uri.parse(
                WidgetConstants.buildWidgetActionUriString(appWidgetId, "open_app")
        ));

        int requestCode = WidgetConstants.buildRequestCode(
                appWidgetId,
                WidgetConstants.REQUEST_SLOT_OPEN_APP
        );
        return PendingIntent.getActivity(context, requestCode, launchIntent, buildPendingIntentFlags());
    }

    public static PendingIntent createWidgetActionPendingIntent(
            Context context,
            int appWidgetId,
            String action,
            int actionSlot
    ) {
        Intent actionIntent = new Intent(context, CategoryCountWidgetProvider.class);
        actionIntent.setAction(action);
        actionIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        actionIntent.setData(Uri.parse(
                WidgetConstants.buildWidgetActionUriString(appWidgetId, action)
        ));

        int requestCode = WidgetConstants.buildRequestCode(appWidgetId, actionSlot);
        return PendingIntent.getBroadcast(context, requestCode, actionIntent, buildPendingIntentFlags());
    }

    private static int buildPendingIntentFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return flags;
    }
}
