package com.yallaliv.driver;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.URL;
import androidx.core.content.FileProvider;

/**
 * Plugin natif YallaGps — pont JS ↔ service GPS.
 * start({url, token}) : démarre le suivi (1 s) avec notification de premier plan.
 * stop()              : arrête le suivi.
 * requestPermission() : demande la permission de position.
 * openSettings()      : ouvre les réglages Android de l'app (batterie « Sans restriction »…).
 */
@CapacitorPlugin(name = "YallaGps", permissions = {
        @Permission(
                strings = {Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION},
                alias = "location"
        )
})
public class YallaGps extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String url = call.getString("url");
        String token = call.getString("token");
        if (url == null || token == null) {
            call.reject("MISSING_ARGS");
            return;
        }
        if (!hasLocationPermission()) {
            call.reject("PERMISSION");
            return;
        }
        Context ctx = getContext();
        Intent i = new Intent(ctx, GpsService.class);
        i.putExtra("url", url);
        i.putExtra("token", token);
        if (Build.VERSION.SDK_INT >= 26) {
            ctx.startForegroundService(i);
        } else {
            ctx.startService(i);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), GpsService.class));
        call.resolve();
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (hasLocationPermission()) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("location", call, "permCallback");
    }

    @ActivityCallback
    private void permCallback(PluginCall call, ActivityResult result) {
        JSObject r = new JSObject();
        r.put("granted", hasLocationPermission());
        call.resolve(r);
    }

    @PluginMethod
    public void status(PluginCall call) {
        android.content.SharedPreferences prefs = getContext().getSharedPreferences(GpsService.PREFS, Context.MODE_PRIVATE);
        JSObject r = new JSObject();
        r.put("version", prefs.getString("version", null));
        r.put("running", prefs.getBoolean("running", false));
        r.put("lastUploadAt", prefs.getLong("lastUploadAt", 0));
        r.put("permission", hasLocationPermission());
        try {
            android.os.PowerManager pm = (android.os.PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            r.put("battery", pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        } catch (Exception ignored) {
        }
        try {
            r.put("overlay", android.provider.Settings.canDrawOverlays(getContext()));
        } catch (Exception ignored) {
        }
        r.put("apkVersion", GpsService.VERSION);
        call.resolve(r);
    }

    /** ① Rester éveillé : exemption d'optimisation de batterie (« Sans restriction »).
     *  La boîte de dialogue SYSTÈME s'affiche — accordée une fois, valable pour toujours. */
    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        try {
            android.os.PowerManager pm = (android.os.PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            if (pm.isIgnoringBatteryOptimizations(getContext().getPackageName())) {
                call.resolve();
                return;
            }
            Intent i = new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("BATTERY_ERR");
        }
    }

    /** ② Afficher par-dessus les autres applications (écran de réglage Android). */
    @PluginMethod
    public void requestOverlay(PluginCall call) {
        try {
            if (android.provider.Settings.canDrawOverlays(getContext())) {
                call.resolve();
                return;
            }
            Intent i = new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("OVERLAY_ERR");
        }
    }

    /** 🔄 Mise à jour automatique : télécharge le nouvel APK (hébergé sur le site) et
     *  lance l'installation Android (une confirmation à l'écran, rien à réinstaller à la main). */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        final String apkUrl = call.getString("url");
        if (apkUrl == null) {
            call.reject("MISSING_URL");
            return;
        }
        final PluginCall fcall = call;
        new Thread(() -> {
            try {
                File out = new File(getContext().getCacheDir(), "yallaliv-update.apk");
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new URL(apkUrl).openConnection();
                c.setConnectTimeout(15000);
                c.setReadTimeout(60000);
                c.connect();
                try (InputStream in = c.getInputStream(); FileOutputStream fos = new FileOutputStream(out)) {
                    byte[] b = new byte[16384];
                    int n;
                    while ((n = in.read(b)) > 0) fos.write(b, 0, n);
                }
                c.disconnect();
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(FileProvider.getUriForFile(getContext(),
                        getContext().getPackageName() + ".fileprovider", out),
                        "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                fcall.resolve();
            } catch (Exception e) {
                fcall.reject("INSTALL_ERR: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent i = new Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", getContext().getPackageName(), null)
        );
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    private boolean hasLocationPermission() {
        return PackageManager.PERMISSION_GRANTED == ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                || PackageManager.PERMISSION_GRANTED == ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION);
    }
}
