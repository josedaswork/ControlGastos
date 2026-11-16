package com.controlgastos.app.widget;

import org.junit.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * Pruebas unitarias de persistencia nativa por instancia, aislamiento entre múltiples
 * widgets, ordenación descendente (mayor a menor) y adaptación al redimensionado.
 */
public class WidgetDemoStoreTest {

    private static final class InMemoryStorage implements WidgetDemoStore.KeyValueStorage {
        private final Map<String, Integer> map = new HashMap<>();

        @Override
        public int getInt(String key, int defaultValue) {
            Integer val = map.get(key);
            return val != null ? val : defaultValue;
        }

        @Override
        public void putInt(String key, int value) {
            map.put(key, value);
        }

        @Override
        public void remove(String key) {
            map.remove(key);
        }

        boolean containsKey(String key) {
            return map.containsKey(key);
        }
    }

    @Test
    public void multipleInstancesKeepIsolatedTapCountsAndHeights() {
        InMemoryStorage storage = new InMemoryStorage();
        WidgetDemoStore store = new WidgetDemoStore(storage);

        int widgetA = 101;
        int widgetB = 202;

        assertEquals(0, store.getDemoTapCount(widgetA));
        assertEquals(0, store.getDemoTapCount(widgetB));

        assertEquals(1, store.incrementDemoTapCount(widgetA));
        assertEquals(2, store.incrementDemoTapCount(widgetA));
        assertEquals(1, store.incrementDemoTapCount(widgetB));

        store.saveCachedMinHeightDp(widgetA, 140);
        store.saveCachedMinHeightDp(widgetB, 280);

        assertEquals(2, store.getDemoTapCount(widgetA));
        assertEquals(1, store.getDemoTapCount(widgetB));
        assertEquals(140, store.getCachedMinHeightDp(widgetA));
        assertEquals(280, store.getCachedMinHeightDp(widgetB));
    }

    @Test
    public void clearWidgetStateDeletesOnlyTargetInstance() {
        InMemoryStorage storage = new InMemoryStorage();
        WidgetDemoStore store = new WidgetDemoStore(storage);

        int widgetA = 11;
        int widgetB = 22;

        store.incrementDemoTapCount(widgetA);
        store.incrementDemoTapCount(widgetA);
        store.saveCachedMinHeightDp(widgetA, 250);

        store.incrementDemoTapCount(widgetB);
        store.saveCachedMinHeightDp(widgetB, 180);

        store.clearWidgetState(widgetA);

        assertFalse(storage.containsKey(WidgetDemoStore.tapCountKey(widgetA)));
        assertFalse(storage.containsKey(WidgetDemoStore.heightDpKey(widgetA)));
        assertEquals(0, store.getDemoTapCount(widgetA));

        assertTrue(storage.containsKey(WidgetDemoStore.tapCountKey(widgetB)));
        assertTrue(storage.containsKey(WidgetDemoStore.heightDpKey(widgetB)));
        assertEquals(1, store.getDemoTapCount(widgetB));
        assertEquals(180, store.getCachedMinHeightDp(widgetB));
    }

    @Test
    public void demoEntriesAreSortedDescendingAndReactToIncrements() {
        InMemoryStorage storage = new InMemoryStorage();
        WidgetDemoStore store = new WidgetDemoStore(storage);

        List<WidgetDemoStore.RankedEntry> initial = store.buildDemoEntries(0);
        assertEquals(5, initial.size());
        assertEquals("Muestra Delta", initial.get(0).label);
        assertEquals(7, initial.get(0).count);
        assertEquals("Muestra Beta", initial.get(1).label);
        assertEquals(5, initial.get(1).count);
        assertEquals("Muestra Alfa", initial.get(2).label);
        assertEquals(4, initial.get(2).count);
        assertEquals("Muestra Gamma", initial.get(3).label);
        assertEquals(2, initial.get(3).count);
        assertEquals("Muestra Épsilon", initial.get(4).label);
        assertEquals(1, initial.get(4).count);

        // Tras 4 toques (+4), Muestra Alfa pasa de 4 a 8 y sube al primer puesto
        List<WidgetDemoStore.RankedEntry> updated = store.buildDemoEntries(4);
        assertEquals("Muestra Alfa", updated.get(0).label);
        assertEquals(8, updated.get(0).count);
        assertEquals("Muestra Delta", updated.get(1).label);
        assertEquals(7, updated.get(1).count);
    }

    @Test
    public void resolveMaxVisibleRowsAdaptsToResizedWidgetHeight() {
        assertEquals(WidgetConstants.MAX_VISIBLE_ROWS, WidgetDemoStore.resolveMaxVisibleRows(0));
        assertEquals(2, WidgetDemoStore.resolveMaxVisibleRows(110));
        assertEquals(3, WidgetDemoStore.resolveMaxVisibleRows(170));
        assertEquals(4, WidgetDemoStore.resolveMaxVisibleRows(220));
        assertEquals(5, WidgetDemoStore.resolveMaxVisibleRows(250));
        assertEquals(5, WidgetDemoStore.resolveMaxVisibleRows(360));
    }
}
