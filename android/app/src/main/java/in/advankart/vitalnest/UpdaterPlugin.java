package in.advankart.vitalnest;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Downloads the new VitalNest APK inside the app and opens Android's installer (no browser needed). */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {

    /** Can this app open the installer? (Android 8+: "Install unknown apps" must be allowed for VitalNest.) */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject r = new JSObject();
        r.put("allowed", Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(r);
    }

    /** Opens the "Install unknown apps" setting for VitalNest. */
    @PluginMethod
    public void openInstallSetting(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 26) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    /** install({ url }) — downloads with "progress" events ({ pct }) and then opens the installer. */
    @PluginMethod
    public void install(PluginCall call) {
        final String url = call.getString("url");
        if (url == null) { call.reject("No URL"); return; }
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists()) dir.mkdirs();
                File apk = new File(dir, "VitalNest-update.apk");
                if (apk.exists()) apk.delete();

                String next = url;
                for (int hop = 0; hop < 6; hop++) {             // follow GitHub's redirects
                    c = (HttpURLConnection) new URL(next).openConnection();
                    c.setInstanceFollowRedirects(false);
                    c.setConnectTimeout(20000);
                    c.setReadTimeout(30000);
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400) { next = c.getHeaderField("Location"); c.disconnect(); c = null; continue; }
                    if (code != 200) throw new Exception("Download failed (" + code + ")");
                    break;
                }
                if (c == null) throw new Exception("Too many redirects");
                long total = c.getContentLengthLong();
                try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[64 * 1024];
                    long done = 0; int last = -1, n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : -1;
                        if (pct != last) { last = pct; JSObject p = new JSObject(); p.put("pct", pct); p.put("done", done); notifyListeners("progress", p); }
                    }
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Update failed");
            } finally {
                if (c != null) c.disconnect();
            }
        }).start();
    }
}
