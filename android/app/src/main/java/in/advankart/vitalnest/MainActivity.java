package in.advankart.vitalnest;

import android.os.Bundle;
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
    }
}
