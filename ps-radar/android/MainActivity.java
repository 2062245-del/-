package com.seungho.psradar;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final String HOME = "https://appassets.androidplatform.net/assets/ps-radar/index.html";
    private static final String IMAGE_PREFS = "psradar-art-cache-v1742";
    private static final String IMAGE_API_HOST = "image.api.playstation.com";
    private static final int NOTIFICATION_PERMISSION_REQUEST = 1750;
    private WebView webView;
    private final ExecutorService imageExecutor = Executors.newFixedThreadPool(4);
    private SharedPreferences imagePrefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.parseColor("#0B1020"));
        getWindow().setNavigationBarColor(Color.parseColor("#0B1020"));
        getWindow().getDecorView().setSystemUiVisibility(0);
        imagePrefs = getSharedPreferences(IMAGE_PREFS, MODE_PRIVATE);
        createWatchChannel();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#0B1020"));
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                if ("appassets.androidplatform.net".equalsIgnoreCase(host)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                catch (Exception ignored) { }
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient());

        if (savedInstanceState == null) webView.loadUrl(HOME);
        else webView.restoreState(savedInstanceState);
    }

    private void createWatchChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        NotificationChannel channel = new NotificationChannel(DealWatchWorker.CHANNEL_ID, "PS Radar 관심 게임", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("찜 게임의 가격, 할인, PS Plus 및 출시일 변화를 알려드립니다.");
        manager.createNotificationChannel(channel);
    }

    private void scheduleWatch(boolean immediate) {
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest periodic = new PeriodicWorkRequest.Builder(DealWatchWorker.class, 6, TimeUnit.HOURS).setConstraints(constraints).build();
        WorkManager.getInstance(this).enqueueUniquePeriodicWork("psradar-watch-v177", ExistingPeriodicWorkPolicy.UPDATE, periodic);
        if (immediate) {
            OneTimeWorkRequest once = new OneTimeWorkRequest.Builder(DealWatchWorker.class).setConstraints(constraints).build();
            WorkManager.getInstance(this).enqueueUniqueWork("psradar-watch-now-v177", ExistingWorkPolicy.REPLACE, once);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) { webView.saveState(outState); super.onSaveInstanceState(outState); }

    @Override
    public void onBackPressed() {
        if (webView == null) { super.onBackPressed(); return; }
        webView.evaluateJavascript("(function(){try{return !!(window.__PSRADAR_ANDROID_BACK__&&window.__PSRADAR_ANDROID_BACK__())}catch(e){return false}})()", value -> {
            if ("true".equals(value)) return;
            if (webView != null && webView.canGoBack()) webView.goBack();
            else MainActivity.super.onBackPressed();
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) scheduleWatch(true);
    }

    @Override
    protected void onDestroy() { imageExecutor.shutdownNow(); if (webView != null) webView.destroy(); super.onDestroy(); }

    public class AndroidBridge {
        @JavascriptInterface
        public void resolveStoreImage(String id, String storeUrl) {
            if (id == null || id.isEmpty() || storeUrl == null || storeUrl.isEmpty()) return;
            Uri storeUri = Uri.parse(storeUrl);
            if (!"https".equalsIgnoreCase(storeUri.getScheme()) || !"store.playstation.com".equalsIgnoreCase(storeUri.getHost())) return;
            String cacheKey = "art_" + id.replaceAll("[^A-Za-z0-9._-]", "_");
            String cached = imagePrefs.getString(cacheKey, null);
            if (cached != null && !cached.isEmpty()) { postImage(id, cached); return; }
            imageExecutor.submit(() -> {
                String image = fetchOfficialImage(storeUrl);
                if (image == null || image.isEmpty()) { postImageFailure(id); return; }
                imagePrefs.edit().putString(cacheKey, image).apply(); postImage(id, image);
            });
        }

        @JavascriptInterface
        public void syncWatchlist(String json) {
            try {
                JSONArray list = new JSONArray(json == null ? "[]" : json);
                SharedPreferences prefs = getSharedPreferences(DealWatchWorker.PREFS, MODE_PRIVATE);
                prefs.edit().putString(DealWatchWorker.WATCHLIST_KEY, list.toString()).apply();
                if (list.length() > 0) scheduleWatch(false);
            } catch (Exception ignored) { }
        }

        @JavascriptInterface
        public void syncReleaseWatchlist(String json) {
            try {
                JSONArray list = new JSONArray(json == null ? "[]" : json);
                SharedPreferences prefs = getSharedPreferences(DealWatchWorker.PREFS, MODE_PRIVATE);
                prefs.edit().putString(DealWatchWorker.RELEASE_WATCHLIST_KEY, list.toString()).apply();
                if (list.length() > 0) scheduleWatch(false);
            } catch (Exception ignored) { }
        }

        @JavascriptInterface
        public void enableNativeNotifications() {
            runOnUiThread(() -> {
                createWatchChannel();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(MainActivity.this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
                    return;
                }
                scheduleWatch(true);
            });
        }
    }

    private void postImage(String id, String imageUrl) {
        runOnUiThread(() -> {
            if (webView == null) return;
            String js = "window.__PSRADAR_SET_IMAGE__ && window.__PSRADAR_SET_IMAGE__(" + JSONObject.quote(id) + "," + JSONObject.quote(imageUrl) + ");";
            webView.evaluateJavascript(js, null);
        });
    }

    private void postImageFailure(String id) {
        runOnUiThread(() -> {
            if (webView == null) return;
            String js = "window.__PSRADAR_IMAGE_FAILED__ && window.__PSRADAR_IMAGE_FAILED__(" + JSONObject.quote(id) + ");";
            webView.evaluateJavascript(js, null);
        });
    }

    private boolean isPlayStationImage(String image) {
        try {
            if (image == null || image.isEmpty()) return false;
            if (image.startsWith("//")) image = "https:" + image;
            Uri uri = Uri.parse(image.replace("\\/", "/"));
            if (!"https".equalsIgnoreCase(uri.getScheme())) return false;
            String host = uri.getHost();
            if (host == null) return false;
            return host.equalsIgnoreCase(IMAGE_API_HOST) || host.endsWith("playstation.com") || host.endsWith("playstation.net");
        } catch (Exception ignored) { return false; }
    }

    private String normalizeImage(String image) {
        if (image == null) return null;
        String out = image.replace("\\u002F", "/").replace("\\/", "/").replace("&amp;", "&").trim();
        if (out.startsWith("//")) out = "https:" + out;
        return out;
    }

    private String fetchOfficialImage(String storeUrl) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(storeUrl).openConnection();
            conn.setConnectTimeout(9000); conn.setReadTimeout(9000); conn.setInstanceFollowRedirects(true); conn.setUseCaches(false);
            conn.setRequestProperty("Cache-Control", "no-cache");
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36");
            conn.setRequestProperty("Accept-Language", "ko-KR,ko;q=0.9,en;q=0.7"); conn.setRequestProperty("Accept", "text/html,application/xhtml+xml");
            if (conn.getResponseCode() < 200 || conn.getResponseCode() >= 400) return null;
            StringBuilder html = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                char[] buf = new char[8192]; int n; while ((n = reader.read(buf)) > 0 && html.length() < 3_000_000) html.append(buf, 0, n);
            }
            Pattern[] metaPatterns = new Pattern[] {
                Pattern.compile("<meta[^>]+(?:property|name)=[\\\"'](?:og:image|twitter:image)[\\\"'][^>]+content=[\\\"']([^\\\"']+)[\\\"']", Pattern.CASE_INSENSITIVE),
                Pattern.compile("<meta[^>]+content=[\\\"']([^\\\"']+)[\\\"'][^>]+(?:property|name)=[\\\"'](?:og:image|twitter:image)[\\\"']", Pattern.CASE_INSENSITIVE)
            };
            for (Pattern pattern : metaPatterns) { Matcher m = pattern.matcher(html); if (!m.find()) continue; String image = normalizeImage(m.group(1)); if (isPlayStationImage(image)) return image; }
            Pattern[] cdnPatterns = new Pattern[] {
                Pattern.compile("https:(?:\\\\/|/){2}image\\.api\\.playstation\\.com[^\\\"'<>\\s]+", Pattern.CASE_INSENSITIVE),
                Pattern.compile("https:(?:\\\\/|/){2}gmedia\\.playstation\\.com[^\\\"'<>\\s]+", Pattern.CASE_INSENSITIVE)
            };
            for (Pattern pattern : cdnPatterns) { Matcher m = pattern.matcher(html); while (m.find()) { String image = normalizeImage(m.group()); if (isPlayStationImage(image)) return image; } }
        } catch (Exception ignored) { } finally { if (conn != null) conn.disconnect(); }
        return null;
    }
}
