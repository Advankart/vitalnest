package in.advankart.vitalnest;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Tells the web app the phone's "Font size" setting so it can scale the whole layout evenly. */
@CapacitorPlugin(name = "FontScale")
public class FontScalePlugin extends Plugin {
    @PluginMethod
    public void get(PluginCall call) {
        JSObject r = new JSObject();
        r.put("scale", getContext().getResources().getConfiguration().fontScale);
        call.resolve(r);
    }
}
