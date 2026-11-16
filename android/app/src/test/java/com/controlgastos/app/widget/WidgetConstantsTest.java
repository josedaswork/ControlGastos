package com.controlgastos.app.widget;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;

/**
 * Pruebas unitarias para garantizar que los requestCode y URIs de PendingIntent
 * no colisionen entre distintas instancias ni entre distintas acciones de un widget.
 */
public class WidgetConstantsTest {

    @Test
    public void requestCodesAreUniqueAcrossInstancesAndActions() {
        int id1 = 10;
        int id2 = 11;

        int id1Open = WidgetConstants.buildRequestCode(id1, WidgetConstants.REQUEST_SLOT_OPEN_APP);
        int id1Demo = WidgetConstants.buildRequestCode(id1, WidgetConstants.REQUEST_SLOT_DEMO_INCREMENT);
        int id2Open = WidgetConstants.buildRequestCode(id2, WidgetConstants.REQUEST_SLOT_OPEN_APP);
        int id2Demo = WidgetConstants.buildRequestCode(id2, WidgetConstants.REQUEST_SLOT_DEMO_INCREMENT);

        assertNotEquals(id1Open, id1Demo);
        assertNotEquals(id1Open, id2Open);
        assertNotEquals(id1Demo, id2Demo);
        assertNotEquals(id2Open, id2Demo);
    }

    @Test
    public void actionUrisIncludeAppWidgetIdAndAction() {
        String uri1 = WidgetConstants.buildWidgetActionUriString(
                101,
                WidgetConstants.ACTION_DEMO_INCREMENT
        );
        String uri2 = WidgetConstants.buildWidgetActionUriString(
                202,
                WidgetConstants.ACTION_DEMO_INCREMENT
        );
        String uriOpen = WidgetConstants.buildWidgetActionUriString(101, "open_app");

        assertEquals(
                "controlgastos://widget/101/com.controlgastos.app.widget.ACTION_DEMO_INCREMENT",
                uri1
        );
        assertNotEquals(uri1, uri2);
        assertNotEquals(uri1, uriOpen);
    }
}
