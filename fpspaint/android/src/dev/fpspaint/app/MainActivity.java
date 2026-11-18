package dev.fpspaint.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.widget.Toast;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private WebView web;
    private ValueCallback<Uri[]> fileCb;
    private byte[] pendingData;
    private static final int REQ_FILE = 11, REQ_SAVE = 12;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Window w = getWindow();
        w.setStatusBarColor(Color.rgb(20, 21, 23));
        w.setNavigationBarColor(Color.rgb(20, 21, 23));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(20, 21, 23));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(), "FPSAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("file".equals(u.getScheme())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                String[] acc = p.getAcceptTypes();
                boolean imagesOnly = acc != null && acc.length > 0 && acc[0] != null && acc[0].startsWith("image");
                if (imagesOnly) i.setType("image/*");
                if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try { startActivityForResult(Intent.createChooser(i, "Elegir archivo"), REQ_FILE); }
                catch (Exception e) { fileCb = null; return false; }
                return true;
            }
        });
        setContentView(web);
        if (b != null) web.restoreState(b);
        else web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); web.saveState(o); }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE) {
            Uri[] out = null;
            if (res == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    out = new Uri[n];
                    for (int k = 0; k < n; k++) out[k] = data.getClipData().getItemAt(k).getUri();
                } else if (data.getData() != null) out = new Uri[]{ data.getData() };
            }
            if (fileCb != null) fileCb.onReceiveValue(out);
            fileCb = null;
        } else if (req == REQ_SAVE) {
            if (res == RESULT_OK && data != null && data.getData() != null && pendingData != null) {
                try { OutputStream os = getContentResolver().openOutputStream(data.getData()); os.write(pendingData); os.close(); toast("Archivo guardado"); }
                catch (Exception e) { toast("No se pudo guardar"); }
            }
            pendingData = null;
        } else super.onActivityResult(req, res, data);
    }

    private void toast(final String m) { runOnUiThread(new Runnable() { public void run() { Toast.makeText(MainActivity.this, m, Toast.LENGTH_SHORT).show(); } }); }

    class Bridge {
        @JavascriptInterface
        public String save(String b64, String name, String mime) {
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            if (Build.VERSION.SDK_INT >= 29) {
                try {
                    ContentResolver cr = getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    Uri col; String dir;
                    if (mime.startsWith("image/") && !mime.contains("photoshop")) { col = MediaStore.Images.Media.EXTERNAL_CONTENT_URI; dir = Environment.DIRECTORY_PICTURES + "/FPSpaint"; }
                    else if (mime.startsWith("video/")) { col = MediaStore.Video.Media.EXTERNAL_CONTENT_URI; dir = Environment.DIRECTORY_MOVIES + "/FPSpaint"; }
                    else { col = MediaStore.Downloads.EXTERNAL_CONTENT_URI; dir = Environment.DIRECTORY_DOWNLOADS + "/FPSpaint"; }
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, dir);
                    Uri u = cr.insert(col, v);
                    OutputStream os = cr.openOutputStream(u); os.write(bytes); os.close();
                    return dir;
                } catch (Exception e) { }
            }
            pendingData = bytes;
            final String n = name, m = mime;
            runOnUiThread(new Runnable() { public void run() {
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE); i.setType(m); i.putExtra(Intent.EXTRA_TITLE, n);
                try { startActivityForResult(i, REQ_SAVE); } catch (Exception e) { toast("No se pudo guardar"); }
            } });
            return "";
        }
        @JavascriptInterface
        public void exit() { runOnUiThread(new Runnable() { public void run() { finish(); } }); }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.fpsBack && fpsBack()) ? '1' : '0'", new ValueCallback<String>() {
            public void onReceiveValue(String r) { if (r == null || !r.contains("1")) MainActivity.super.onBackPressed(); }
        });
    }

    @Override protected void onPause() { super.onPause(); web.evaluateJavascript("window.fpsPause && fpsPause()", null); }
}
