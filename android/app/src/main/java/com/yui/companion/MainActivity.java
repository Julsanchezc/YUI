package com.yui.companion;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

public class MainActivity extends BridgeActivity {

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
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra("trigger_assistant", false)) {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().post(() -> {
                    getBridge().getWebView().evaluateJavascript(
                        "window.kalaTriggerAssistantVoice && window.kalaTriggerAssistantVoice(); " +
                        "window.yuiTriggerVoiceAssistant && window.yuiTriggerVoiceAssistant();", 
                        null
                    );
                });
            }
        }
    }
}
