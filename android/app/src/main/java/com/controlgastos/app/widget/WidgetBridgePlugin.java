package com.controlgastos.app.widget;

import android.content.Context;
import android.content.Intent;

import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    @PluginMethod
    public void updateCategoryCounts(PluginCall call) {
        String month = call.getString("month", "");
        JSArray entries = call.getArray("entries");
        String json = entries == null ? "[]" : entries.toString();

        Context context = getContext();
        context.getSharedPreferences(WidgetConstants.PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(WidgetConstants.KEY_CATEGORY_COUNTS_JSON, json)
                .putString(WidgetConstants.KEY_CATEGORY_COUNTS_MONTH, month)
                .putLong(WidgetConstants.KEY_CATEGORY_COUNTS_UPDATED_AT, System.currentTimeMillis())
                .apply();

        Intent refresh = new Intent(context, CategoryCountWidgetProvider.class);
        refresh.setAction(WidgetConstants.ACTION_REFRESH_ALL);
        context.sendBroadcast(refresh);

        call.resolve();
    }
}
