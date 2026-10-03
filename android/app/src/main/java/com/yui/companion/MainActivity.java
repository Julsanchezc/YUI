package com.yui.companion;

import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

public class MainActivity extends BridgeActivity {

    @CapacitorPlugin(name = "YuiAssistant")
    public static class YuiAssistantPlugin extends Plugin {

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
        registerPlugin(YuiAssistantPlugin.class);
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
                        "window.yuiTriggerVoiceAssistant && window.yuiTriggerVoiceAssistant();", 
                        null
                    );
                });
            }
        }
    }
}
