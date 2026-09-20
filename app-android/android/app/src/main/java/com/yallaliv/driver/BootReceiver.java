package com.yallaliv.driver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * Redémarrage automatique après extinction du téléphone : si le livreur était
 * « En ligne » quand le téléphone s'est éteint (batterie vide, panne, redémarrage),
 * le service GPS repart dès le démarrage du téléphone — SANS ouvrir l'application.
 * Permission système : RECEIVE_BOOT_COMPLETED (accordée automatiquement à l'installation,
 * listée comme autorisation ⑤ dans l'app).
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : "";
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !"android.intent.action.QUICKBOOT_POWERON".equals(action)) return;

        android.content.SharedPreferences prefs =
                context.getSharedPreferences(GpsService.PREFS, Context.MODE_PRIVATE);
        boolean wasRunning = prefs.getBoolean("running", false);
        String url = prefs.getString("url", null);
        String token = prefs.getString("token", null);
        if (!wasRunning || url == null || token == null) return; // le livreur n'était pas en service

        Intent i = new Intent(context, GpsService.class);
        i.putExtra("url", url);
        i.putExtra("token", token);
        if (Build.VERSION.SDK_INT >= 26) {
            context.startForegroundService(i);
        } else {
            context.startService(i);
        }
    }
}
