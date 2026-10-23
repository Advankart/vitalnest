package in.advankart.vitalnest;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Opens Android's print screen (print to a printer or "Save as PDF") for an HTML report. */
@CapacitorPlugin(name = "Print")
public class PrintPlugin extends Plugin {
    private WebView printView; // kept alive until the print job has read the page

    @PluginMethod
    public void printHtml(PluginCall call) {
        final String html = call.getString("html", "");
        final String name = call.getString("name", "VitalNest report");
        getActivity().runOnUiThread(() -> {
            try {
                WebView wv = new WebView(getActivity());
                wv.getSettings().setJavaScriptEnabled(false);
                wv.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                        PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(name);
                        PrintAttributes attrs = new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build();
                        pm.print(name, adapter, attrs);
                        call.resolve();
                    }
                });
                printView = wv;
                wv.loadDataWithBaseURL("https://vitalnest.vercel.app/", html, "text/html", "UTF-8", null);
            } catch (Exception e) {
                call.reject("Printing is not available on this phone: " + e.getMessage());
            }
        });
    }
}
