package app.moontrace.pocket;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * 月隐 · Moontrace — a thin, dependency-free WebView shell.
 * The whole app lives in assets/www and is served from a private https origin
 * so localStorage persists exactly like a normal website. No network is used.
 */
public class MainActivity extends Activity {
    private static final String HOST = "app.moontrace.local";
    private static final String START = "https://" + HOST + "/index.html";
    private static final int REQ_SAVE = 41, REQ_OPEN = 42;

    private WebView web;
    private String pendingSave;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        web.setBackgroundColor(0xFF0F1320);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setTextZoom(100);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setMediaPlaybackRequiresUserGesture(false);

        web.addJavascriptInterface(new Bridge(this), "MoontraceNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (!HOST.equals(u.getHost())) {
                    // Offline app: nothing else is ever fetched.
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Blocked", new java.util.HashMap<String, String>(),
                            new ByteArrayInputStream(new byte[0]));
                }
                String path = u.getPath();
                if (path == null || path.equals("/")) path = "/index.html";
                try {
                    InputStream in = getAssets().open("www" + path);
                    return new WebResourceResponse(mime(path), "utf-8", in);
                } catch (IOException e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", new java.util.HashMap<String, String>(),
                            new ByteArrayInputStream(new byte[0]));
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
                try {
                    startActivityForResult(i, REQ_OPEN);
                } catch (Exception e) {
                    fileCallback = null;
                    cb.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });

        if (saved != null) web.restoreState(saved);
        if (web.getUrl() == null) web.loadUrl(START);
    }

    private static String mime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".json") || path.endsWith(".webmanifest")) return "application/json";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    /** Hardware back closes the top sheet / zoom / tab first; only an idle main screen exits. */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript(
                "(function(){try{return !!(window.Moontrace&&window.Moontrace.back())}catch(e){return false}})()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if (!"true".equals(value)) finish();
                    }
                });
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        Uri uri = (res == RESULT_OK && data != null) ? data.getData() : null;
        if (req == REQ_OPEN) {
            if (fileCallback != null) fileCallback.onReceiveValue(uri == null ? null : new Uri[]{uri});
            fileCallback = null;
        } else if (req == REQ_SAVE) {
            String text = pendingSave;
            pendingSave = null;
            if (uri == null || text == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
                Toast.makeText(this, "存档已保存", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "保存失败：" + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        }
    }

    /** Called from the page as MoontraceNative.saveFile(name, text) to export a save file. */
    public static class Bridge {
        private final MainActivity host;
        Bridge(MainActivity host) { this.host = host; }

        @JavascriptInterface
        public void saveFile(String name, String text) {
            host.pendingSave = text;
            final Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("application/json");
            i.putExtra(Intent.EXTRA_TITLE, name);
            host.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        host.startActivityForResult(i, REQ_SAVE);
                    } catch (Exception e) {
                        host.pendingSave = null;
                        Toast.makeText(host, "无法打开保存对话框", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }
    }
}
