package com.yallaliv.driver;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Service de premier plan YallaLiv — GPS toutes les secondes + envoi DIRECT au serveur.
 * ⚠️ v3.1.1 = RESTAURATION EXACTE de la v3.1 (validée sur le terrain) :
 * pas de mécanisme de redémarrage, pas d'alarme, pas de drapeau d'arrêt —
 * uniquement le service simple qui a fait ses preuves.
 */
public class GpsService extends Service {
    private LocationManager lm;
    private LocationListener listener;
    private String apiUrl;
    private String token;
    private long lastUp = 0;
    private double lastLat = 1e9;
    private double lastLng = 1e9;

    static final String CH_ID = "yallaliv_gps";
    static final String PREFS = "yallaliv_gps_prefs";
    static final String VERSION = "3.1.2";
    private PowerManager.WakeLock wl;

    @Override
    public void onCreate() {
        super.onCreate();
        startForeground(1, buildNotification());
        // Wakelock partiel : garde le CPU (et le GPS) actif écran éteint.
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "yallaliv:gps");
            wl.acquire();
        } catch (Exception ignored) {
        }
        setStatus(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (intent != null) {
            apiUrl = intent.getStringExtra("url");
            token = intent.getStringExtra("token");
            if (apiUrl != null && token != null) {
                prefs.edit().putString("url", apiUrl).putString("token", token).apply();
            }
        } else {
            // Redémarrage système (START_STICKY) : reprendre les derniers réglages connus
            apiUrl = prefs.getString("url", null);
            token = prefs.getString("token", null);
        }
        if (apiUrl == null || token == null) {
            stopSelf();
            return START_STICKY;
        }
        if (lm != null && listener != null) {
            try { lm.removeUpdates(listener); } catch (Exception ignored) {} // pas d'écouteur en double
        }
        lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        listener = new LocationListener() {
            @Override
            public void onLocationChanged(Location loc) {
                maybeUpload(loc.getLatitude(), loc.getLongitude());
            }

            @Override
            public void onStatusChanged(String provider, int status, Bundle extras) {
            }

            @Override
            public void onProviderEnabled(String provider) {
            }

            @Override
            public void onProviderDisabled(String provider) {
            }
        };
        try {
            // GPS toutes les 1000 ms + position réseau (bâtiments) en secours
            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0, listener, Looper.getMainLooper());
            lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 2000, 0, listener, Looper.getMainLooper());
        } catch (SecurityException e) {
            stopSelf();
        }
        return START_STICKY;
    }

    /**
     * Envoi au maximum 1 fois par seconde ; livreur immobile → battement de cœur toutes les 8 s.
     */
    private void maybeUpload(double lat, double lng) {
        long now = System.currentTimeMillis();
        boolean moved = lastLat > 1e8 || (Math.abs(lat - lastLat) + Math.abs(lng - lastLng)) > 0.00002; // ~2 m
        if (now - lastUp < 900) return;
        if (!moved && now - lastUp < 8000) return;
        lastUp = now;
        lastLat = lat;
        lastLng = lng;
        final double la = lat;
        final double ln = lng;
        new Thread(() -> upload(la, ln)).start();
    }

    private void setStatus(boolean running) {
        try {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                    .putBoolean("running", running)
                    .putString("version", VERSION)
                    .apply();
        } catch (Exception ignored) {
        }
    }

    private void upload(double lat, double lng) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(apiUrl).openConnection();
            c.setRequestMethod("PUT");
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Authorization", "Bearer " + token);
            c.setConnectTimeout(5000);
            c.setReadTimeout(5000);
            c.setDoOutput(true);
            JSONObject o = new JSONObject();
            o.put("lat", lat);
            o.put("lng", lng);
            try (OutputStream os = c.getOutputStream()) {
                os.write(o.toString().getBytes("UTF-8"));
            }
            c.getResponseCode();
            c.disconnect();
            getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                    .putLong("lastUploadAt", System.currentTimeMillis())
                    .putFloat("lastLat", (float) lat)
                    .putFloat("lastLng", (float) lng)
                    .apply();
        } catch (Exception ignored) {
        }
    }

    private Notification buildNotification() {
        Intent i = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CH_ID, "Suivi GPS YallaLiv", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(ch);
            return new Notification.Builder(this, CH_ID)
                    .setContentTitle("YallaLiv Livreur")
                    .setContentText("Suivi de position actif pendant votre service — ne fermez pas l'application")
                    .setSmallIcon(getApplicationInfo().icon)
                    .setOngoing(true)
                    .setContentIntent(pi)
                    .build();
        }
        return new Notification.Builder(this)
                .setContentTitle("YallaLiv Livreur")
                .setContentText("Suivi de position actif pendant votre service")
                .setSmallIcon(getApplicationInfo().icon)
                .setOngoing(true)
                .setContentIntent(pi)
                .build();
    }

    @Override
    public void onDestroy() {
        setStatus(false);
        try {
            if (wl != null && wl.isHeld()) wl.release();
        } catch (Exception ignored) {
        }
        if (lm != null && listener != null) {
            try {
                lm.removeUpdates(listener);
            } catch (Exception ignored) {
            }
        }
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // App fermée en glissant : le livreur est TOUJOURS « En ligne » → on relance le service
        // tout de suite. ⚠️ getForegroundService (et PAS getService) : seule cette API a le
        // droit de démarrer un service en arrière-plan depuis Android 8 — c'était le défaut
        // des tentatives v3.2-3.4 (erreur silencieuse, service jamais relancé).
        try {
            Intent i = new Intent(this, GpsService.class);
            i.putExtra("url", apiUrl);
            i.putExtra("token", token);
            android.app.PendingIntent pi = android.app.PendingIntent.getForegroundService(
                    this, 1, i, android.app.PendingIntent.FLAG_IMMUTABLE);
            pi.send();
        } catch (Exception ignored) {
        }
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
