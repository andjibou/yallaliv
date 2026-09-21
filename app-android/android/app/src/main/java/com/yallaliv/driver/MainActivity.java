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

    // 🔙 Bouton RETOUR du téléphone : navigue en arrière dans l'app (comme le bouton
    // retour de l'interface). S'il n'y a plus rien à quoi revenir : l'app passe en
    // arrière-plan SANS être quittée (le suivi GPS et la notification restent actifs).
    @Override
    public void onBackPressed() {
        android.webkit.WebView wv = (bridge != null) ? bridge.getWebView() : null;
        if (wv != null && wv.canGoBack()) {
            wv.goBack();
        } else {
            moveTaskToBack(true); // ne tue PAS l'app : arrière-plan propre
        }
    }
}
