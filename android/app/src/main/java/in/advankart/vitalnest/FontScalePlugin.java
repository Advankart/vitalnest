package in.advankart.vitalnest;

import android.graphics.Color;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tells the web app the phone's "Font size" setting so it can scale the whole layout evenly,
 * and paints the status bar / navigation bar area in the app's background colour.
 */
@CapacitorPlugin(name = "FontScale")
public class FontScalePlugin extends Plugin {
    @PluginMethod
    public void get(PluginCall call) {
        JSObject r = new JSObject();
        r.put("scale", getContext().getResources().getConfiguration().fontScale);
        call.resolve(r);
    }

    /** setBars({ color: "#f4f6fa", dark: false }) — solid bar background with dark or light icons. */
    @PluginMethod
    public void setBars(PluginCall call) {
        final String color = call.getString("color", "#f4f6fa");
        final boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getActivity().runOnUiThread(() -> {
            try {
                MainActivity.paintBars(getActivity().getWindow(), Color.parseColor(color), dark);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }
}
