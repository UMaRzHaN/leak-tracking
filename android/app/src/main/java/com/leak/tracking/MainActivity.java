package com.leak.tracking;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PublicFileWriterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
