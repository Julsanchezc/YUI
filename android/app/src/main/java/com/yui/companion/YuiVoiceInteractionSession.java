package com.yui.companion;

import android.app.assist.AssistContent;
import android.app.assist.AssistStructure;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

public class YuiVoiceInteractionSession extends VoiceInteractionSession {

    public YuiVoiceInteractionSession(Context context) {
        super(context);
    }

    @Override
    public void onCreate() {
        super.onCreate();
    }

    @Override
    public View onCreateContentView() {
        FrameLayout layout = new FrameLayout(getContext());
        layout.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        layout.setBackgroundColor(0x66000000);
        layout.setOnClickListener(v -> hide());
        return layout;
    }

    @Override
    public void onShow(Bundle args, int showFlags) {
        super.onShow(args, showFlags);
        Intent intent = new Intent(getContext(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("trigger_assistant", true);
        getContext().startActivity(intent);
        hide();
    }

    @Override
    public void onHandleAssist(Bundle data, AssistStructure structure, AssistContent content) {
        super.onHandleAssist(data, structure, content);
    }
}
