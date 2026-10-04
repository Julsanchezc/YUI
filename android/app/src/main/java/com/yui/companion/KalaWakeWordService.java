package com.yui.companion;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import java.util.ArrayList;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class KalaWakeWordService extends Service {
    private static final String TAG = "KalaWakeWordService";
    private static final String CHANNEL_ID = "kala_wake_word_channel";
    private static final int NOTIFICATION_ID = 20261;

    public static final String ACTION_START = "com.yui.companion.ACTION_START_WAKE_WORD";
    public static final String ACTION_STOP = "com.yui.companion.ACTION_STOP_WAKE_WORD";

    private static KalaWakeWordService instance = null;
    private static boolean isRunning = false;
    private boolean isPaused = false;
    private boolean isTriggering = false;

    private SpeechRecognizer speechRecognizer;
    private Intent recognizerIntent;
    private Handler handler;
    private PowerManager.WakeLock wakeLock;

    public static boolean isServiceRunning() {
        return isRunning;
    }

    public static void pauseListeningFromApp() {
        if (instance != null) {
            instance.pauseListening();
        }
    }

    public static void resumeListeningFromApp() {
        if (instance != null) {
            instance.resumeListening();
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        handler = new Handler(Looper.getMainLooper());
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopListening();
            stopForeground(true);
            stopSelf();
            isRunning = false;
            instance = null;
            return START_NOT_STICKY;
        }

        isPaused = false;
        isTriggering = false;
        startForegroundServiceNotification();
        startListening();
        isRunning = true;
        return START_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Kala Asistente de Voz",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Permite a Kala responder a 'Oye Kala' en segundo plano");
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void startForegroundServiceNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Kala está escuchando")
            .setContentText("Di \"Oye Kala\" en cualquier momento")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    public synchronized void pauseListening() {
        Log.d(TAG, "Pausando escucha nativa para liberar el micrófono.");
        isPaused = true;
        if (handler != null) {
            handler.removeCallbacksAndMessages(null);
        }
        stopListening();
    }

    public synchronized void resumeListening() {
        if (!isRunning) return;
        Log.d(TAG, "Reanudando escucha nativa de wake word.");
        isPaused = false;
        isTriggering = false;
        restartListeningDelayed(150);
    }

    private void startListening() {
        if (!isRunning && instance == null) return;
        if (isPaused) {
            Log.d(TAG, "startListening omitido porque el servicio está pausado.");
            return;
        }

        handler.post(() -> {
            if (isPaused) return;

            try {
                if (speechRecognizer != null) {
                    speechRecognizer.destroy();
                    speechRecognizer = null;
                }

                if (!SpeechRecognizer.isRecognitionAvailable(this)) {
                    Log.w(TAG, "SpeechRecognizer no disponible en este dispositivo.");
                    return;
                }

                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
                recognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-ES");
                recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "es-ES");
                recognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
                recognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);

                speechRecognizer.setRecognitionListener(new RecognitionListener() {
                    @Override
                    public void onReadyForSpeech(Bundle params) {
                        Log.d(TAG, "SpeechRecognizer listo para escuchar 'Oye Kala'...");
                    }

                    @Override
                    public void onBeginningOfSpeech() {}

                    @Override
                    public void onRmsChanged(float rmsdB) {}

                    @Override
                    public void onBufferReceived(byte[] buffer) {}

                    @Override
                    public void onEndOfSpeech() {}

                    @Override
                    public void onError(int error) {
                        Log.d(TAG, "SpeechRecognizer status/error: " + error);
                        if (!isPaused && isRunning) {
                            long delay = (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) ? 150 : 500;
                            restartListeningDelayed(delay);
                        }
                    }

                    @Override
                    public void onResults(Bundle results) {
                        ArrayList<String> matches = results != null 
                            ? results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) 
                            : null;
                        if (checkWakeWord(matches)) {
                            String query = extractSpokenQuery(matches);
                            triggerKalaActivation(query);
                        } else {
                            if (!isPaused && isRunning) {
                                restartListeningDelayed(200);
                            }
                        }
                    }

                    @Override
                    public void onPartialResults(Bundle partialResults) {
                        ArrayList<String> matches = partialResults != null 
                            ? partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) 
                            : null;
                        if (checkWakeWord(matches)) {
                            String query = extractSpokenQuery(matches);
                            triggerKalaActivation(query);
                        }
                    }

                    @Override
                    public void onEvent(int eventType, Bundle params) {}
                });

                speechRecognizer.startListening(recognizerIntent);
            } catch (Exception e) {
                Log.e(TAG, "Error iniciando SpeechRecognizer", e);
                if (!isPaused && isRunning) {
                    restartListeningDelayed(1000);
                }
            }
        });
    }

    private boolean checkWakeWord(ArrayList<String> matches) {
        if (matches == null || matches.isEmpty()) return false;
        for (String phrase : matches) {
            if (phrase == null) continue;
            String lower = phrase.toLowerCase(Locale.ROOT)
                .replace("á", "a")
                .replace("é", "e")
                .replace("í", "i")
                .replace("ó", "o")
                .replace("ú", "u");
            if (lower.contains("kala") || lower.contains("cala") || lower.contains("calla") || 
                lower.contains("kayla") || lower.contains("cayla") || lower.contains("oye cala") ||
                lower.contains("oye kala")) {
                Log.i(TAG, "Wake word detectada en frase: " + phrase);
                return true;
            }
        }
        return false;
    }

    private String extractSpokenQuery(ArrayList<String> matches) {
        if (matches == null || matches.isEmpty()) return null;
        Pattern pattern = Pattern.compile("(?i)^(?:oye|hey|ok|hola|oie)?\\s*(?:kala|cala|calla|calá|kayla|cayla)\\s*(.+)$");
        for (String phrase : matches) {
            if (phrase == null) continue;
            String trimmed = phrase.trim();
            Matcher matcher = pattern.matcher(trimmed);
            if (matcher.find()) {
                String query = matcher.group(1);
                if (query != null && !query.trim().isEmpty()) {
                    Log.i(TAG, "Comando de voz continuo detectado: " + query.trim());
                    return query.trim();
                }
            }
        }
        return null;
    }

    private synchronized void triggerKalaActivation(String spokenQuery) {
        if (isTriggering) return;
        isTriggering = true;

        // Liberar el micrófono inmediatamente para el WebView
        pauseListening();

        // 1. Respuesta Háptica
        try {
            Vibrator vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createOneShot(120, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    vibrator.vibrate(120);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "No se pudo vibrar", e);
        }

        // 2. Encender pantalla si está apagada
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isInteractive()) {
                wakeLock = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "Kala:WakeWordActivation"
                );
                wakeLock.acquire(3000);
            }
        } catch (Exception e) {
            Log.w(TAG, "No se pudo adquirir WakeLock", e);
        }

        // 3. Traer MainActivity al frente
        try {
            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            intent.putExtra("trigger_assistant", true);
            if (spokenQuery != null && !spokenQuery.trim().isEmpty()) {
                intent.putExtra("spoken_query", spokenQuery.trim());
            }

            PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
                this,
                (int) System.currentTimeMillis(),
                intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
            );

            Notification wakeNotification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentTitle("Kala")
                .setContentText(spokenQuery != null ? spokenQuery : "Escuchando...")
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .setAutoCancel(true)
                .build();

            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.notify(NOTIFICATION_ID + 1, wakeNotification);
            }

            startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "Error lanzando MainActivity", e);
        }

        if (handler != null) {
            handler.postDelayed(() -> {
                isTriggering = false;
            }, 1500);
        }
    }

    private void restartListeningDelayed(long delayMs) {
        if (!isRunning || isPaused) return;
        if (handler != null) {
            handler.removeCallbacksAndMessages(null);
            handler.postDelayed(() -> {
                if (isRunning && !isPaused) {
                    startListening();
                }
            }, delayMs);
        }
    }

    private void stopListening() {
        if (handler != null) {
            handler.post(() -> {
                try {
                    if (speechRecognizer != null) {
                        speechRecognizer.stopListening();
                        speechRecognizer.cancel();
                        speechRecognizer.destroy();
                        speechRecognizer = null;
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error deteniendo SpeechRecognizer", e);
                }
            });
        }
    }

    @Override
    public void onDestroy() {
        isRunning = false;
        instance = null;
        stopListening();
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
