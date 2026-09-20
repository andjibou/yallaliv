package com.yallaliv.driver;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * Redémarrage automatique après extinction du téléphone : si le livreur était
 * « En ligne » quand le téléphone s'est éteint (batterie vide, panne, redémarrage),
 * le service GPS repart dès le démarrage du téléphone — SANS ouvrir l'application.
 *
 * v3.1.5 — correctif important : on lit « wanted » (VOLONTÉ du livreur d'être suivi,
 * effacée uniquement par le bouton Hors ligne) et non plus « running » (état technique,
 * effacé par onDestroy() à l'extinction du téléphone → le redémarrage ne se faisait jamais).
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : "";
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !"android.intent.action.QUICKBOOT_POWERON".equals(action)) return;

        android.content.SharedPreferences prefs =
                context.getSharedPreferences(GpsService.PREFS, Context.MODE_PRIVATE);
        boolean wanted = prefs.getBoolean("wanted", false);
        String url = prefs.getString("url", null);
        String token = prefs.getString("token", null);
        if (!wanted || url == null || token == null) return; // le livreur n'était pas en service

        if (startGps(context, url, token)) return;
        scheduleRetry(context, url, token, 20000); // bloqué par le système ? 2ᵉ chance +20 s
    }

    static boolean startGps(Context context, String url, String token) {
        try {
            Intent i = new Intent(context, GpsService.class);
            i.putExtra("url", url);
            i.putExtra("token", token);
            if (Build.VERSION.SDK_INT >= 26) {
                context.startForegroundService(i);
            } else {
                context.startService(i);
            }
            return true;
        } catch (Exception ignored) {
            return false; // restriction Android 12+ parfois → alarme de secours
        }
    }

    static void scheduleRetry(Context context, String url, String token, long delayMs) {
        try {
            Intent i = new Intent(context, GpsService.class);
            i.putExtra("url", url);
            i.putExtra("token", token);
            PendingIntent pi = Build.VERSION.SDK_INT >= 26
                    ? PendingIntent.getForegroundService(context, 5, i,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)
                    : PendingIntent.getService(context, 5, i,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    android.os.SystemClock.elapsedRealtime() + delayMs, pi);
        } catch (Exception ignored) {
        }
    }
}
