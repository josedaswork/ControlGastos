package com.controlgastos.app.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import com.controlgastos.app.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * AppWidgetProvider base para el widget 2×4 redimensionable de Control Gastos.
 *
 * <p>Alcance actual: infraestructura nativa completa y widget de demostración interactivo
 * (sin lectura de Google Sheets, localStorage del WebView ni datos financieros reales).
 *
 * <p>Punto de integración futuro con React:
 * registrar un plugin nativo de Capacitor en {@link com.controlgastos.app.MainActivity}
 * (por ejemplo {@code WidgetBridgePlugin}) que reciba desde {@code src/lib/sheetsApi.js}
 * el recuento mensual de categorías ordenado de mayor a menor, lo persista en
 * {@link WidgetConstants#PREFS_NAME} y emita un broadcast explícito con
 * {@link WidgetConstants#ACTION_REFRESH_ALL}.
 */
public class CategoryCountWidgetProvider extends AppWidgetProvider {

    private static final int[] ROW_CONTAINER_IDS = new int[]{
            R.id.widget_row_1,
            R.id.widget_row_2,
            R.id.widget_row_3,
            R.id.widget_row_4,
            R.id.widget_row_5
    };

    private static final int[] ROW_LABEL_IDS = new int[]{
            R.id.widget_row_label_1,
            R.id.widget_row_label_2,
            R.id.widget_row_label_3,
            R.id.widget_row_label_4,
            R.id.widget_row_label_5
    };

    private static final int[] ROW_COUNT_IDS = new int[]{
            R.id.widget_row_count_1,
            R.id.widget_row_count_2,
            R.id.widget_row_count_3,
            R.id.widget_row_count_4,
            R.id.widget_row_count_5
    };

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        if (appWidgetIds == null) {
            return;
        }
        WidgetDemoStore store = new WidgetDemoStore(context);
        for (int appWidgetId : appWidgetIds) {
            if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                updateSingleWidget(context, appWidgetManager, store, appWidgetId);
            }
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(
            Context context,
            AppWidgetManager appWidgetManager,
            int appWidgetId,
            Bundle newOptions
    ) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions);
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            return;
        }
        WidgetDemoStore store = new WidgetDemoStore(context);
        if (newOptions != null) {
            int minHeightDp = newOptions.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
            store.saveCachedMinHeightDp(appWidgetId, minHeightDp);
        }
        updateSingleWidget(context, appWidgetManager, store, appWidgetId);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent == null || intent.getAction() == null) {
            return;
        }

        String action = intent.getAction();
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);

        if (WidgetConstants.ACTION_DEMO_INCREMENT.equals(action)) {
            int appWidgetId = intent.getIntExtra(
                    AppWidgetManager.EXTRA_APPWIDGET_ID,
                    AppWidgetManager.INVALID_APPWIDGET_ID
            );
            if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
                return;
            }
            WidgetDemoStore store = new WidgetDemoStore(context);
            store.incrementDemoTapCount(appWidgetId);
            updateSingleWidget(context, appWidgetManager, store, appWidgetId);
        } else if (WidgetConstants.ACTION_REFRESH_ALL.equals(action)) {
            ComponentName provider = new ComponentName(context, CategoryCountWidgetProvider.class);
            int[] activeIds = appWidgetManager.getAppWidgetIds(provider);
            onUpdate(context, appWidgetManager, activeIds);
        }
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        super.onDeleted(context, appWidgetIds);
        if (appWidgetIds == null) {
            return;
        }
        WidgetDemoStore store = new WidgetDemoStore(context);
        for (int appWidgetId : appWidgetIds) {
            store.clearWidgetState(appWidgetId);
        }
    }

    @Override
    public void onDisabled(Context context) {
        super.onDisabled(context);
    }

    static void updateSingleWidget(
            Context context,
            AppWidgetManager appWidgetManager,
            WidgetDemoStore store,
            int appWidgetId
    ) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_category_count);

        int cachedHeightDp = store.getCachedMinHeightDp(appWidgetId);
        int maxRows = WidgetDemoStore.resolveMaxVisibleRows(cachedHeightDp);

        SharedPreferences prefs = context.getApplicationContext()
                .getSharedPreferences(WidgetConstants.PREFS_NAME, Context.MODE_PRIVATE);
        String month = prefs.getString(WidgetConstants.KEY_CATEGORY_COUNTS_MONTH, "");
        long updatedAt = prefs.getLong(WidgetConstants.KEY_CATEGORY_COUNTS_UPDATED_AT, 0L);
        List<WidgetDemoStore.RankedEntry> entries = WidgetDemoStore.sortDescending(
                parseEntries(prefs.getString(WidgetConstants.KEY_CATEGORY_COUNTS_JSON, "[]"))
        );

        views.setViewVisibility(R.id.widget_demo_badge, View.GONE);
        views.setViewVisibility(R.id.widget_btn_demo_action, View.GONE);

        if (month.isEmpty()) {
            views.setTextViewText(R.id.widget_subtitle, "Abre la app para cargar datos");
        } else {
            views.setTextViewText(R.id.widget_subtitle, "Gastos por categoría · " + month);
        }

        if (updatedAt > 0) {
            String time = new SimpleDateFormat("dd/MM HH:mm", Locale.getDefault()).format(new Date(updatedAt));
            views.setTextViewText(R.id.widget_counter_status, "Actualizado " + time);
        } else {
            views.setTextViewText(R.id.widget_counter_status, "Sin datos");
        }

        for (int i = 0; i < ROW_CONTAINER_IDS.length; i++) {
            if (i < maxRows && i < entries.size()) {
                WidgetDemoStore.RankedEntry entry = entries.get(i);
                views.setViewVisibility(ROW_CONTAINER_IDS[i], View.VISIBLE);
                views.setTextViewText(ROW_LABEL_IDS[i], entry.label);
                views.setTextViewText(ROW_COUNT_IDS[i], String.valueOf(entry.count));
            } else {
                views.setViewVisibility(ROW_CONTAINER_IDS[i], View.GONE);
            }
        }

        PendingIntent openAppIntent = WidgetIntentFactory.createOpenAppPendingIntent(
                context,
                appWidgetId
        );
        views.setOnClickPendingIntent(R.id.widget_header, openAppIntent);
        views.setOnClickPendingIntent(R.id.widget_btn_open_app, openAppIntent);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    static List<WidgetDemoStore.RankedEntry> parseEntries(String json) {
        List<WidgetDemoStore.RankedEntry> result = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.optJSONObject(i);
                if (obj == null) continue;
                String label = obj.optString("label", "").trim();
                int count = obj.optInt("count", 0);
                if (!label.isEmpty() && count > 0) {
                    result.add(new WidgetDemoStore.RankedEntry(label, count, i));
                }
            }
        } catch (Exception ignored) {
        }
        return result;
    }
}
