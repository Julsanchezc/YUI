package com.yui.companion;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.util.Log;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private static final int PERMISSION_REQ_CODE = 1001;

    @CapacitorPlugin(name = "KalaAssistant")
    public static class KalaAssistantPlugin extends Plugin {

        @PluginMethod
        public void startWakeWord(PluginCall call) {
            try {
                Context context = getContext();
                Intent intent = new Intent(context, KalaWakeWordService.class);
                intent.setAction(KalaWakeWordService.ACTION_START);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    ContextCompat.startForegroundService(context, intent);
                } else {
                    context.startService(intent);
                }
                JSObject ret = new JSObject();
                ret.put("running", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Error al iniciar servicio de escucha: " + e.getMessage());
            }
        }

        @PluginMethod
        public void stopWakeWord(PluginCall call) {
            try {
                Context context = getContext();
                Intent intent = new Intent(context, KalaWakeWordService.class);
                intent.setAction(KalaWakeWordService.ACTION_STOP);
                context.startService(intent);
                JSObject ret = new JSObject();
                ret.put("running", false);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Error al detener servicio de escucha: " + e.getMessage());
            }
        }

        @PluginMethod
        public void isWakeWordActive(PluginCall call) {
            JSObject ret = new JSObject();
            ret.put("running", KalaWakeWordService.isServiceRunning());
            call.resolve(ret);
        }

        @PluginMethod
        public void pauseWakeWord(PluginCall call) {
            KalaWakeWordService.pauseListeningFromApp();
            call.resolve();
        }

        @PluginMethod
        public void resumeWakeWord(PluginCall call) {
            if (KalaWakeWordService.isServiceRunning()) {
                KalaWakeWordService.resumeListeningFromApp();
            }
            call.resolve();
        }

        @PluginMethod
        public void triggerHaptic(PluginCall call) {
            try {
                Vibrator vibrator = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
                if (vibrator != null && vibrator.hasVibrator()) {
                    int duration = call.getInt("duration", 60);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        vibrator.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE));
                    } else {
                        vibrator.vibrate(duration);
                    }
                }
                call.resolve();
            } catch (Exception e) {
                call.resolve();
            }
        }

        @PluginMethod
        public void openAssistantSettings(PluginCall call) {
            Intent intent = new Intent(Settings.ACTION_VOICE_INPUT_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(intent);
                call.resolve();
            } catch (Exception e) {
                Intent fallback = new Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    getContext().startActivity(fallback);
                    call.resolve();
                } catch (Exception e2) {
                    call.reject("No se pudo abrir la configuración del asistente.");
                }
            }
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KalaAssistantPlugin.class);
        super.onCreate(savedInstanceState);
        checkAndRequestPermissions();
        handleIntent(getIntent());
    }

    @Override
    public void onResume() {
        super.onResume();
        // Mantener escucha continua de "Oye Kala" activa tanto en primer plano como en segundo plano
        if (KalaWakeWordService.isServiceRunning()) {
            KalaWakeWordService.resumeListeningFromApp();
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Reanudar la escucha del wake word cuando la app pase a segundo plano si el servicio está activo
        if (KalaWakeWordService.isServiceRunning()) {
            KalaWakeWordService.resumeListeningFromApp();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void checkAndRequestPermissions() {
        List<String> permissionsNeeded = new ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            permissionsNeeded.add(Manifest.permission.RECORD_AUDIO);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                permissionsNeeded.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }
        if (!permissionsNeeded.isEmpty()) {
            ActivityCompat.requestPermissions(this, permissionsNeeded.toArray(new String[0]), PERMISSION_REQ_CODE);
        }
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;

        String spokenQuery = intent.getStringExtra("spoken_query");
        boolean triggerAssistant = intent.getBooleanExtra("trigger_assistant", false);

        if (spokenQuery != null && !spokenQuery.trim().isEmpty()) {
            final String cleanQuery = spokenQuery.trim()
                .replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\n", " ");
            postToWebView("if (window.kalaProcessSpokenQuery) { window.kalaProcessSpokenQuery('" + cleanQuery + "'); }");
        } else if (triggerAssistant) {
            postToWebView("if (window.kalaTriggerAssistantVoice) { window.kalaTriggerAssistantVoice(); }");
        }
    }

    private void postToWebView(String jsCode) {
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().postDelayed(() -> {
                try {
                    getBridge().getWebView().evaluateJavascript(jsCode, null);
                } catch (Exception e) {
                    Log.e(TAG, "Error evaluating JS in WebView", e);
                }
            }, 300);
        }
    }
}
