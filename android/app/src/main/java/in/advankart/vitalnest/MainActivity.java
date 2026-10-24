package in.advankart.vitalnest;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FontScalePlugin.class);
        registerPlugin(PrintPlugin.class);
        super.onCreate(savedInstanceState);
        // Stop the WebView from enlarging text on its own (it breaks the layout).
        // The app reads the phone's font size via FontScalePlugin and scales everything evenly instead.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setTextZoom(100);
        }
        // Solid status / navigation bar area (the web app keeps it in sync with its light/dark theme)
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        paintBars(getWindow(), Color.parseColor(night ? "#070c17" : "#f4f6fa"), night);
    }

    /** The app content sits between the system bars; this paints the bar areas and picks icon colours. */
    static void paintBars(Window w, int color, boolean dark) {
        w.getDecorView().setBackgroundColor(color);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
        c.setAppearanceLightStatusBars(!dark);
        c.setAppearanceLightNavigationBars(!dark);
    }
}
