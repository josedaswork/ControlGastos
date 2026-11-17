package com.controlgastos.app;

import android.os.Bundle;
import com.controlgastos.app.sync.BackgroundSyncPlugin;
import com.controlgastos.app.widget.WidgetBridgePlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundSyncPlugin.class);
        registerPlugin(WidgetBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
