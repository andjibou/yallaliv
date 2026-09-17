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
