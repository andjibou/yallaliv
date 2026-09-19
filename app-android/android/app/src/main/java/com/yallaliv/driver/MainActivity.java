package com.yallaliv.driver;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // ⚠️ AVANT super.onCreate() : le pont natif est créé PENDANT super.onCreate()
        // et c'est lui qui expose le plugin à window.Capacitor.Plugins.
        // (Appelé après = plugin invisible pour le site = bug « APK ANCIEN » de la v3.)
        registerPlugin(YallaGps.class);
        super.onCreate(savedInstanceState);
    }
}
