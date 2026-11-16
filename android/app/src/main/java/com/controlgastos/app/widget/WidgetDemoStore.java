package com.controlgastos.app.widget;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * Persistencia nativa por instancia y lógica de ordenación para el widget de demostración.
 *
 * <p>No accede a localStorage ni a datos financieros de {@code sheetsApi.js}; guarda
 * exclusivamente el estado de demostración por {@code appWidgetId}.
 */
public class WidgetDemoStore {

    private static final String KEY_TAP_COUNT_PREFIX = "demo_tap_count_";
    private static final String KEY_HEIGHT_DP_PREFIX = "widget_height_dp_";

    public interface KeyValueStorage {
        int getInt(String key, int defaultValue);

        void putInt(String key, int value);

        void remove(String key);
    }

    public static final class SharedPreferencesStorage implements KeyValueStorage {
        private final SharedPreferences prefs;

        public SharedPreferencesStorage(Context context) {
            this.prefs = context.getApplicationContext()
                    .getSharedPreferences(WidgetConstants.PREFS_NAME, Context.MODE_PRIVATE);
        }

        @Override
        public int getInt(String key, int defaultValue) {
            return prefs.getInt(key, defaultValue);
        }

        @Override
        public void putInt(String key, int value) {
            prefs.edit().putInt(key, value).apply();
        }

        @Override
        public void remove(String key) {
            prefs.edit().remove(key).apply();
        }
    }

    public static final class RankedEntry {
        public final String label;
        public final int count;
        private final int originalOrder;

        public RankedEntry(String label, int count, int originalOrder) {
            this.label = label;
            this.count = count;
            this.originalOrder = originalOrder;
        }
    }

    private final KeyValueStorage storage;

    public WidgetDemoStore(Context context) {
        this(new SharedPreferencesStorage(context));
    }

    public WidgetDemoStore(KeyValueStorage storage) {
        this.storage = storage;
    }

    public int getDemoTapCount(int appWidgetId) {
        return Math.max(0, storage.getInt(tapCountKey(appWidgetId), 0));
    }

    public int incrementDemoTapCount(int appWidgetId) {
        int next = getDemoTapCount(appWidgetId) + 1;
        storage.putInt(tapCountKey(appWidgetId), next);
        return next;
    }

    public int getCachedMinHeightDp(int appWidgetId) {
        return storage.getInt(heightDpKey(appWidgetId), 0);
    }

    public void saveCachedMinHeightDp(int appWidgetId, int minHeightDp) {
        if (minHeightDp > 0) {
            storage.putInt(heightDpKey(appWidgetId), minHeightDp);
        }
    }

    public void clearWidgetState(int appWidgetId) {
        storage.remove(tapCountKey(appWidgetId));
        storage.remove(heightDpKey(appWidgetId));
    }

    /**
     * Genera entradas de demostración ordenadas de mayor a menor para validar
     * la disposición vertical 2×4 y la interacción nativa sin abrir la app.
     */
    public List<RankedEntry> buildDemoEntries(int tapCount) {
        int safeTaps = Math.max(0, tapCount);
        List<RankedEntry> entries = new ArrayList<>();
        entries.add(new RankedEntry("Muestra Alfa", 4 + safeTaps, 0));
        entries.add(new RankedEntry("Muestra Beta", 5, 1));
        entries.add(new RankedEntry("Muestra Gamma", 2, 2));
        entries.add(new RankedEntry("Muestra Delta", 7, 3));
        entries.add(new RankedEntry("Muestra Épsilon", 1, 4));
        return sortDescending(entries);
    }

    /**
     * Ordena cualquier lista de entradas de mayor a menor recuento manteniendo
     * un desempate determinista por orden original.
     */
    public static List<RankedEntry> sortDescending(List<RankedEntry> source) {
        List<RankedEntry> sorted = new ArrayList<>(source);
        Collections.sort(sorted, new Comparator<RankedEntry>() {
            @Override
            public int compare(RankedEntry a, RankedEntry b) {
                int countCmp = Integer.compare(b.count, a.count);
                if (countCmp != 0) {
                    return countCmp;
                }
                return Integer.compare(a.originalOrder, b.originalOrder);
            }
        });
        return sorted;
    }

    /**
     * Ajusta el número de filas visibles cuando el usuario redimensiona el widget
     * verticalmente en el launcher.
     */
    public static int resolveMaxVisibleRows(int minHeightDp) {
        if (minHeightDp <= 0) {
            return WidgetConstants.MAX_VISIBLE_ROWS;
        }
        if (minHeightDp < 150) {
            return 2;
        }
        if (minHeightDp < 200) {
            return 3;
        }
        if (minHeightDp < 245) {
            return 4;
        }
        return WidgetConstants.MAX_VISIBLE_ROWS;
    }

    static String tapCountKey(int appWidgetId) {
        return KEY_TAP_COUNT_PREFIX + appWidgetId;
    }

    static String heightDpKey(int appWidgetId) {
        return KEY_HEIGHT_DP_PREFIX + appWidgetId;
    }
}
