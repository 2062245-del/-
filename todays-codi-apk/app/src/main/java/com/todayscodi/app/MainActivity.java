package com.todayscodi.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.Address;
import android.location.Geocoder;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends Activity {
    private static final int LOCATION_REQUEST_CODE = 2301;
    private WebView webView;
    private LocationManager locationManager;
    private boolean pendingLocationRequest = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(18, 16, 13));
        getWindow().setNavigationBarColor(Color.rgb(18, 16, 13));
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(18, 16, 13));
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);

        webView.addJavascriptInterface(new NativeBridge(), "AndroidApp");
        webView.setWebViewClient(new WebViewClient());
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        webView.loadUrl("file:///android_asset/index.html");
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void startLocationRequest() {
        if (!hasLocationPermission()) {
            pendingLocationRequest = true;
            requestPermissions(new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
            }, LOCATION_REQUEST_CODE);
            return;
        }
        findLocation();
    }

    private void findLocation() {
        try {
            List<String> providers = locationManager.getProviders(true);
            Location best = null;
            for (String provider : providers) {
                Location loc = locationManager.getLastKnownLocation(provider);
                if (loc != null && (best == null || loc.getTime() > best.getTime())) best = loc;
            }
            if (best != null && System.currentTimeMillis() - best.getTime() < 15 * 60 * 1000L) {
                sendLocation(best);
                return;
            }

            String provider = null;
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) provider = LocationManager.NETWORK_PROVIDER;
            else if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) provider = LocationManager.GPS_PROVIDER;

            if (provider == null) {
                if (best != null) sendLocation(best);
                else sendLocationError("휴대폰 위치 서비스가 꺼져 있습니다.");
                return;
            }

            Location finalBest = best;
            LocationListener listener = new LocationListener() {
                @Override public void onLocationChanged(Location location) {
                    locationManager.removeUpdates(this);
                    sendLocation(location != null ? location : finalBest);
                }
                @Override public void onProviderEnabled(String provider) {}
                @Override public void onProviderDisabled(String provider) {}
                @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
            };
            locationManager.requestSingleUpdate(provider, listener, Looper.getMainLooper());
        } catch (SecurityException e) {
            sendLocationError("위치 권한을 확인해 주세요.");
        } catch (Exception e) {
            sendLocationError("현재 위치를 확인하지 못했습니다.");
        }
    }

    private String reverseGeocode(Location location) {
        if (location == null || !Geocoder.isPresent()) return "";
        try {
            Geocoder geocoder = new Geocoder(this, Locale.KOREA);
            List<Address> addresses = geocoder.getFromLocation(location.getLatitude(), location.getLongitude(), 1);
            if (addresses == null || addresses.isEmpty()) return "";
            Address a = addresses.get(0);
            Set<String> parts = new LinkedHashSet<>();
            addPlacePart(parts, a.getAdminArea());
            addPlacePart(parts, a.getSubAdminArea());
            addPlacePart(parts, a.getLocality());
            addPlacePart(parts, a.getSubLocality());

            if (parts.size() < 2 && a.getMaxAddressLineIndex() >= 0) {
                String line = a.getAddressLine(0);
                if (line != null) {
                    Pattern p = Pattern.compile("([가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도|시|군|구|읍|면|동|리))");
                    Matcher m = p.matcher(line.replace("대한민국", ""));
                    while (m.find() && parts.size() < 3) addPlacePart(parts, m.group(1));
                }
            }
            if (parts.size() < 3) addPlacePart(parts, a.getThoroughfare());
            return String.join(" ", parts);
        } catch (Exception e) {
            return "";
        }
    }

    private void addPlacePart(Set<String> parts, String value) {
        if (value == null) return;
        String v = value.trim();
        if (v.isEmpty() || "대한민국".equals(v)) return;
        parts.add(v);
    }

    private void sendLocation(Location location) {
        if (location == null) {
            sendLocationError("현재 위치를 확인하지 못했습니다.");
            return;
        }
        new Thread(() -> {
            String placeName = reverseGeocode(location);
            final String js = "window.__nativeGeoSuccess && window.__nativeGeoSuccess(" +
                    location.getLatitude() + "," + location.getLongitude() + "," + location.getAccuracy() + "," +
                    JSONObject.quote(placeName) + ");";
            runOnUiThread(() -> webView.evaluateJavascript(js, null));
        }).start();
    }

    private void sendLocationError(String message) {
        final String js = "window.__nativeGeoError && window.__nativeGeoError(" + JSONObject.quote(message) + ");";
        runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_REQUEST_CODE && pendingLocationRequest) {
            pendingLocationRequest = false;
            if (hasLocationPermission()) findLocation();
            else sendLocationError("위치 권한이 허용되지 않았습니다.");
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidApp");
            webView.destroy();
        }
        super.onDestroy();
    }

    private String readAssetText(String name) {
        StringBuilder out = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(getAssets().open(name), "UTF-8"))) {
            String line;
            while ((line = reader.readLine()) != null) out.append(line.trim());
            return out.toString();
        } catch (Exception e) {
            return "";
        }
    }

    public class NativeBridge {
        @JavascriptInterface public void requestLocation() { runOnUiThread(() -> startLocationRequest()); }
        @JavascriptInterface public boolean isNativeApp() { return true; }
        @JavascriptInterface public String platform() { return "android"; }

        @JavascriptInterface
        public String getAssetPart(int part) {
            if (part < 1 || part > 10) return "";
            return readAssetText("part" + part + ".txt");
        }

        @JavascriptInterface
        public String getUpgradePart(int part) {
            if (part < 1 || part > 6) return "";
            return readAssetText("upgrade" + part + ".txt");
        }
    }
}
