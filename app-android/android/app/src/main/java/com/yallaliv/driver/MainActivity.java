package com.yallaliv.driver;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Plugin natif YallaGps : GPS arrière-plan + envoi direct au serveur
        registerPlugin(YallaGps.class);
    }
}
