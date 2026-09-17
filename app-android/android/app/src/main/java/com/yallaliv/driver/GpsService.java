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

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Service de premier plan YallaLiv : GPS toutes les secondes + envoi DIRECT au serveur
 * (java.net, sans passer par le navigateur/WebView). Tourne même écran verrouillé
 * ou application en arrière-plan, tant que le livreur est « En ligne ».
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

    @Override
    public void onCreate() {
        super.onCreate();
        startForeground(1, buildNotification());
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
            // Redémarrage automatique (START_STICKY) après un arrêt système : on reprend les derniers réglages
            apiUrl = prefs.getString("url", null);
            token = prefs.getString("token", null);
        }
        if (apiUrl == null || token == null) {
            stopSelf();
            return START_STICKY;
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
     * Envoi au maximum 1 fois par seconde ; si le livreur ne bouge pas,
     * un « battement de cœur » toutes les 8 s suffit (économise batterie et serveur).
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
        if (lm != null && listener != null) {
            try {
                lm.removeUpdates(listener);
            } catch (Exception ignored) {
            }
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
