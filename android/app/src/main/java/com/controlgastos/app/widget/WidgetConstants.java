package com.controlgastos.app.widget;

/**
 * Constantes y utilidades puras para los widgets nativos de Android.
 *
 * <p>Mantiene el almacenamiento nativo completamente separado del WebView / localStorage
 * y genera identificadores únicos por instancia ({@code appWidgetId}) y slot de acción
 * para evitar colisiones entre múltiples widgets en el launcher.
 */
public final class WidgetConstants {

    private WidgetConstants() {
        // Utility class
    }

    /** Nombre del fichero SharedPreferences exclusivo para el estado nativo de los widgets. */
    public static final String PREFS_NAME = "control_gastos_widget_prefs";

    /** Acción explícita de demostración: incrementa el contador nativo de una instancia concreta. */
    public static final String ACTION_DEMO_INCREMENT =
            "com.controlgastos.app.widget.ACTION_DEMO_INCREMENT";

    /**
     * Acción explícita reservada para refrescar todas las instancias activas del widget
     * (punto de entrada para un futuro plugin de Capacitor cuando sincronice datos desde React).
     */
    public static final String ACTION_REFRESH_ALL =
            "com.controlgastos.app.widget.ACTION_REFRESH_ALL";

    /** Número máximo de filas visibles en el diseño base 2x4. */
    public static final int MAX_VISIBLE_ROWS = 5;

    /** Slots de PendingIntent para aislar acciones por instancia sin colisión de requestCode. */
    public static final int REQUEST_SLOT_OPEN_APP = 1;
    public static final int REQUEST_SLOT_DEMO_INCREMENT = 2;

    /**
     * Construye una URI única por instancia y acción para que {@link android.content.Intent#filterEquals}
     * distinga los {@link android.app.PendingIntent} de múltiples instancias del mismo widget.
     */
    public static String buildWidgetActionUriString(int appWidgetId, String action) {
        String safeAction = action == null ? "default" : action;
        return "controlgastos://widget/" + appWidgetId + "/" + safeAction;
    }

    /**
     * Calcula un {@code requestCode} determinista y sin colisiones por par (instancia, slot).
     */
    public static int buildRequestCode(int appWidgetId, int actionSlot) {
        int normalizedId = appWidgetId & 0x0FFFFFFF;
        int normalizedSlot = Math.abs(actionSlot) % 10;
        return normalizedId * 10 + normalizedSlot;
    }
}
