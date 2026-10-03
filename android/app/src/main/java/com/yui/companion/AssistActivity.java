package com.yui.companion;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

public class AssistActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("trigger_assistant", true);
        startActivity(intent);
        finish();
    }
}
