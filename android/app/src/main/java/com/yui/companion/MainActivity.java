package com.yui.companion;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.AlarmClock;
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
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
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

        @PluginMethod
        public void setFlashlight(PluginCall call) {
            try {
                boolean enabled = call.getBoolean("enabled", true);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    CameraManager cameraManager = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
                    if (cameraManager != null) {
                        String cameraId = null;
                        for (String id : cameraManager.getCameraIdList()) {
                            CameraCharacteristics c = cameraManager.getCameraCharacteristics(id);
                            Boolean flashAvailable = c.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                            Integer facing = c.get(CameraCharacteristics.LENS_FACING);
                            if (flashAvailable != null && flashAvailable && facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
                                cameraId = id;
                                break;
                            }
                        }
                        if (cameraId == null && cameraManager.getCameraIdList().length > 0) {
                            cameraId = cameraManager.getCameraIdList()[0];
                        }
                        if (cameraId != null) {
                            cameraManager.setTorchMode(cameraId, enabled);
                            JSObject ret = new JSObject();
                            ret.put("enabled", enabled);
                            ret.put("success", true);
                            call.resolve(ret);
                            return;
                        }
                    }
                }
                call.reject("Dispositivo sin linterna o no soportada.");
            } catch (Exception e) {
                call.reject("Error al controlar la linterna: " + e.getMessage());
            }
        }

        @PluginMethod
        public void getBatteryInfo(PluginCall call) {
            try {
                Context context = getContext();
                IntentFilter ifilter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
                Intent batteryStatus = context.registerReceiver(null, ifilter);
                int level = -1;
                int scale = -1;
                int status = -1;
                int plugged = -1;
                if (batteryStatus != null) {
                    level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                    scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                    status = batteryStatus.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                    plugged = batteryStatus.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1);
                }
                float batteryPct = (level >= 0 && scale > 0) ? (level * 100 / (float) scale) : 50;
                boolean isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                                     status == BatteryManager.BATTERY_STATUS_FULL ||
                                     plugged > 0;
                String statusStr = isCharging ? "Cargando" : "Descargando";
                if (status == BatteryManager.BATTERY_STATUS_FULL) statusStr = "Completa";

                JSObject ret = new JSObject();
                ret.put("level", Math.round(batteryPct));
                ret.put("isCharging", isCharging);
                ret.put("status", statusStr);
                ret.put("pluggedType", plugged == BatteryManager.BATTERY_PLUGGED_AC ? "AC" : (plugged == BatteryManager.BATTERY_PLUGGED_USB ? "USB" : (plugged == BatteryManager.BATTERY_PLUGGED_WIRELESS ? "Wireless" : "None")));
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Error obteniendo batería: " + e.getMessage());
            }
        }

        @PluginMethod
        public void openApp(PluginCall call) {
            String appName = call.getString("appName", "").trim().toLowerCase();
            Context context = getContext();
            PackageManager pm = context.getPackageManager();
            Intent launchIntent = null;

            // Map common app aliases to package names
            String pkg = null;
            if (appName.contains("whatsapp")) {
                pkg = "com.whatsapp";
            } else if (appName.contains("spotify")) {
                pkg = "com.spotify.music";
            } else if (appName.contains("youtube") || appName.contains("yt")) {
                pkg = "com.google.android.youtube";
            } else if (appName.contains("telegram")) {
                pkg = "org.telegram.messenger";
            } else if (appName.contains("camara") || appName.contains("cámara") || appName.contains("camera")) {
                launchIntent = new Intent("android.media.action.IMAGE_CAPTURE");
            } else if (appName.contains("reloj") || appName.contains("alarma") || appName.contains("clock")) {
                launchIntent = new Intent(AlarmClock.ACTION_SHOW_ALARMS);
            } else if (appName.contains("ajustes") || appName.contains("configuracion") || appName.contains("configuración") || appName.contains("settings")) {
                launchIntent = new Intent(Settings.ACTION_SETTINGS);
            } else if (appName.contains("mapas") || appName.contains("maps") || appName.contains("gps")) {
                pkg = "com.google.android.apps.maps";
            } else if (appName.contains("chrome") || appName.contains("navegador") || appName.contains("browser")) {
                pkg = "com.android.chrome";
            } else if (appName.contains("instagram")) {
                pkg = "com.instagram.android";
            } else if (appName.contains("tiktok")) {
                pkg = "com.zhiliaoapp.musically";
            } else if (appName.contains("fotos") || appName.contains("galeria") || appName.contains("galería")) {
                launchIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("content://media/internal/images/media"));
            } else if (appName.contains("calculadora") || appName.contains("calculator")) {
                pkg = "com.google.android.calculator";
            }

            if (pkg != null) {
                launchIntent = pm.getLaunchIntentForPackage(pkg);
                if (launchIntent == null && pkg.equals("com.whatsapp")) {
                    launchIntent = pm.getLaunchIntentForPackage("com.whatsapp.w4b");
                }
            }

            // Fallback: search installed packages matching name
            if (launchIntent == null && !appName.isEmpty()) {
                List<android.content.pm.ApplicationInfo> apps = pm.getInstalledApplications(PackageManager.GET_META_DATA);
                for (android.content.pm.ApplicationInfo info : apps) {
                    CharSequence label = pm.getApplicationLabel(info);
                    if (label != null && label.toString().toLowerCase().contains(appName)) {
                        launchIntent = pm.getLaunchIntentForPackage(info.packageName);
                        if (launchIntent != null) break;
                    }
                }
            }

            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(launchIntent);
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("app", appName);
                ret.put("message", "Abriendo " + appName);
                call.resolve(ret);
            } else {
                call.reject("No se encontró la aplicación: " + appName);
            }
        }

        @PluginMethod
        public void setTimer(PluginCall call) {
            try {
                int seconds = call.getInt("seconds", 60);
                String message = call.getString("message", "Temporizador Kala");
                Intent intent = new Intent(AlarmClock.ACTION_SET_TIMER);
                intent.putExtra(AlarmClock.EXTRA_LENGTH, seconds);
                intent.putExtra(AlarmClock.EXTRA_MESSAGE, message);
                intent.putExtra(AlarmClock.EXTRA_SKIP_UI, false);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("seconds", seconds);
                ret.put("message", message);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Error al configurar temporizador: " + e.getMessage());
            }
        }

        @PluginMethod
        public void setAlarm(PluginCall call) {
            try {
                int hour = call.getInt("hour", 7);
                int minutes = call.getInt("minutes", 0);
                String message = call.getString("message", "Alarma Kala");
                Intent intent = new Intent(AlarmClock.ACTION_SET_ALARM);
                intent.putExtra(AlarmClock.EXTRA_HOUR, hour);
                intent.putExtra(AlarmClock.EXTRA_MINUTES, minutes);
                intent.putExtra(AlarmClock.EXTRA_MESSAGE, message);
                intent.putExtra(AlarmClock.EXTRA_SKIP_UI, false);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("hour", hour);
                ret.put("minutes", minutes);
                ret.put("message", message);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Error al configurar alarma: " + e.getMessage());
            }
        }

        @PluginMethod
        public void sendWhatsApp(PluginCall call) {
            try {
                String phone = call.getString("phone", "").replaceAll("[^0-9+]", "");
                String message = call.getString("message", "");
                String encodedMsg = URLEncoder.encode(message, StandardCharsets.UTF_8.name());
                String url = "https://api.whatsapp.com/send?phone=" + phone + "&text=" + encodedMsg;
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.setPackage("com.whatsapp");
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                try {
                    getContext().startActivity(intent);
                } catch (Exception e) {
                    Intent fallback = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(fallback);
                }

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("message", message);
                ret.put("phone", phone);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Error al abrir WhatsApp: " + e.getMessage());
            }
        }

        @PluginMethod
        public void setVolume(PluginCall call) {
            try {
                AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
                if (audioManager != null) {
                    String direction = call.getString("direction", "up");
                    Integer level = call.getInt("level", -1);

                    int maxVol = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                    if (level != null && level >= 0) {
                        int target = Math.min(maxVol, Math.max(0, (int) Math.round((level / 100.0) * maxVol)));
                        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, target, AudioManager.FLAG_SHOW_UI);
                    } else if ("mute".equalsIgnoreCase(direction)) {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            audioManager.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_TOGGLE_MUTE, AudioManager.FLAG_SHOW_UI);
                        } else {
                            audioManager.setStreamMute(AudioManager.STREAM_MUSIC, true);
                        }
                    } else if ("down".equalsIgnoreCase(direction)) {
                        audioManager.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI);
                    } else {
                        audioManager.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI);
                    }

                    int current = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
                    int currentPct = Math.round((current / (float) maxVol) * 100);

                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("volume", currentPct);
                    call.resolve(ret);
                    return;
                }
                call.reject("AudioManager no disponible");
            } catch (Exception e) {
                call.reject("Error al ajustar volumen: " + e.getMessage());
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
