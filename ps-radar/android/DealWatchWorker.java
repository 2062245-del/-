package com.seungho.psradar;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

public class DealWatchWorker extends Worker {
    public static final String PREFS = "psradar-native-watch-v175";
    public static final String WATCHLIST_KEY = "watchlist";
    public static final String RELEASE_WATCHLIST_KEY = "releaseWatchlist";
    public static final String BASELINE_KEY = "baseline";
    public static final String RELEASE_NOTIFIED_KEY = "releaseNotified";
    public static final String CHANNEL_ID = "psradar_watch";
    private static final String DEALS_URL = "https://raw.githubusercontent.com/2062245-del/-/main/ps-radar/data/deals-auto.json";
    private static final String STORE_URL = "https://raw.githubusercontent.com/2062245-del/-/main/ps-radar/data/store-auto.json";
    private static final String UPCOMING_URL = "https://raw.githubusercontent.com/2062245-del/-/main/ps-radar/data/upcoming.json";

    public DealWatchWorker(@NonNull Context context, @NonNull WorkerParameters params) { super(context, params); }

    @NonNull
    @Override
    public Result doWork() {
        try {
            SharedPreferences prefs = getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray watchlist = new JSONArray(prefs.getString(WATCHLIST_KEY, "[]"));
            JSONArray releaseWatch = new JSONArray(prefs.getString(RELEASE_WATCHLIST_KEY, "[]"));
            if (watchlist.length() == 0 && releaseWatch.length() == 0) return Result.success();

            int notifications = 0;
            if (watchlist.length() > 0) {
                JSONObject deals = fetchJson(DEALS_URL);
                JSONObject store = fetchJson(STORE_URL);
                JSONArray dealItems = deals != null ? deals.optJSONArray("items") : null;
                JSONArray storeItems = store != null ? store.optJSONArray("items") : null;
                if (dealItems == null && storeItems == null && releaseWatch.length() == 0) return Result.retry();
                notifications += checkGameChanges(prefs, watchlist, dealItems, storeItems, 4);
            }
            if (releaseWatch.length() > 0 && notifications < 4) {
                JSONObject upcomingPayload = fetchJson(UPCOMING_URL);
                JSONArray upcomingItems = upcomingPayload != null ? upcomingPayload.optJSONArray("items") : null;
                if (upcomingItems != null) notifications += checkReleaseAlerts(prefs, releaseWatch, upcomingItems, 4 - notifications);
            }
            return Result.success();
        } catch (Exception e) { return Result.retry(); }
    }

    private int checkGameChanges(SharedPreferences prefs, JSONArray watchlist, JSONArray dealItems, JSONArray storeItems, int limit) throws Exception {
        JSONObject previous = new JSONObject(prefs.getString(BASELINE_KEY, "{}"));
        JSONObject next = new JSONObject();
        int notifications = 0;
        for (int i = 0; i < watchlist.length(); i++) {
            JSONObject watch = watchlist.optJSONObject(i); if (watch == null) continue;
            String key = watch.optString("id", "watch-" + i);
            JSONObject deal = findMatch(dealItems, watch), benefit = findMatch(storeItems, watch);
            JSONObject now = new JSONObject();
            double currentPrice = deal != null ? deal.optDouble("currentPrice", Double.NaN) : Double.NaN;
            int discount = deal != null ? deal.optInt("discountPercent", 0) : 0;
            boolean plusIncluded = benefit != null ? benefit.optBoolean("plusIncluded", watch.optBoolean("plusIncluded", false)) : watch.optBoolean("plusIncluded", false);
            String plusTier = benefit != null ? benefit.optString("plusTier", watch.optString("plusTier", "")) : watch.optString("plusTier", "");
            if (!Double.isNaN(currentPrice) && currentPrice > 0) now.put("currentPrice", currentPrice);
            now.put("discountPercent", discount); now.put("plusIncluded", plusIncluded); now.put("plusTier", plusTier); next.put(key, now);

            JSONObject before = previous.optJSONObject(key);
            if (before == null) {
                before = new JSONObject(); double seeded = watch.optDouble("currentPrice", Double.NaN);
                if (!Double.isNaN(seeded) && seeded > 0) before.put("currentPrice", seeded);
                before.put("discountPercent", watch.optInt("discountPercent", 0)); before.put("plusIncluded", watch.optBoolean("plusIncluded", false)); before.put("plusTier", watch.optString("plusTier", ""));
            }
            double oldPrice = before.optDouble("currentPrice", Double.NaN); int oldDiscount = before.optInt("discountPercent", 0); boolean oldPlus = before.optBoolean("plusIncluded", false);
            StringBuilder change = new StringBuilder();
            if (!Double.isNaN(currentPrice) && currentPrice > 0 && !Double.isNaN(oldPrice) && oldPrice > 0 && currentPrice < oldPrice) change.append(won(oldPrice)).append(" → ").append(won(currentPrice));
            else if (discount > oldDiscount && discount > 0) change.append(discount).append("% 할인 시작");
            if (plusIncluded && !oldPlus) { if (change.length()>0) change.append(" · "); change.append(plusTier.isEmpty()?"PS Plus 포함":"PS Plus "+plusTier+" 포함"); }
            else if (!plusIncluded && oldPlus) { if (change.length()>0) change.append(" · "); change.append("PS Plus 제외"); }
            if (change.length()>0 && notifications<limit) { notifyChange(watch.optString("title",key),change.toString(),Math.abs(key.hashCode())); notifications++; }
        }
        prefs.edit().putString(BASELINE_KEY,next.toString()).apply();
        return notifications;
    }

    private int checkReleaseAlerts(SharedPreferences prefs, JSONArray releaseWatch, JSONArray upcomingItems, int limit) throws Exception {
        JSONObject notified = new JSONObject(prefs.getString(RELEASE_NOTIFIED_KEY, "{}"));
        int count = 0; LocalDate today = LocalDate.now();
        for (int i=0;i<releaseWatch.length() && count<limit;i++) {
            JSONObject watch=releaseWatch.optJSONObject(i); if(watch==null)continue;
            JSONObject current=findMatch(upcomingItems,watch); if(current==null)current=watch;
            String releaseDate=current.optString("releaseDate",watch.optString("releaseDate","")); if(releaseDate.isEmpty())continue;
            try {
                LocalDate date=LocalDate.parse(releaseDate.substring(0,10)); long d=ChronoUnit.DAYS.between(today,date);
                if(d!=7 && d!=1 && d!=0)continue;
                String id=watch.optString("id",current.optString("id","release-"+i)); String marker=releaseDate+"|"+d;
                if(marker.equals(notified.optString(id,"")))continue;
                String text=d==0?"오늘 출시 예정입니다.":d==1?"내일 출시 예정입니다.":"출시까지 7일 남았습니다.";
                notifyChange(current.optString("title",watch.optString("title",id)),text,Math.abs(("release-"+id).hashCode()));
                notified.put(id,marker); count++;
            } catch (Exception ignored) { }
        }
        prefs.edit().putString(RELEASE_NOTIFIED_KEY,notified.toString()).apply();
        return count;
    }

    private JSONObject fetchJson(String url) {
        HttpURLConnection conn=null;
        try {
            conn=(HttpURLConnection)new URL(url+"?t="+System.currentTimeMillis()).openConnection(); conn.setConnectTimeout(12000); conn.setReadTimeout(16000); conn.setUseCaches(false);
            conn.setRequestProperty("Cache-Control","no-cache"); conn.setRequestProperty("User-Agent","PSRadar/17.7 Android"); int status=conn.getResponseCode(); if(status<200||status>=300)return null;
            StringBuilder body=new StringBuilder(); try(BufferedReader reader=new BufferedReader(new InputStreamReader(conn.getInputStream(),StandardCharsets.UTF_8))){char[] buf=new char[8192];int n;while((n=reader.read(buf))>0&&body.length()<14_000_000)body.append(buf,0,n);} return new JSONObject(body.toString());
        } catch(Exception ignored){return null;} finally{if(conn!=null)conn.disconnect();}
    }

    private JSONObject findMatch(JSONArray items, JSONObject watch) {
        if(items==null||watch==null)return null; String id=watch.optString("id",""); String store=cleanStore(watch.optString("store","")); String title=titleKey(watch.optString("title","")); JSONObject titleMatch=null;
        for(int i=0;i<items.length();i++){JSONObject item=items.optJSONObject(i);if(item==null)continue;if(!id.isEmpty()&&id.equals(item.optString("id","")))return item;String itemStore=cleanStore(item.optString("store",""));if(!store.isEmpty()&&store.equals(itemStore))return item;if(titleMatch==null&&!title.isEmpty()&&title.equals(titleKey(item.optString("title",""))))titleMatch=item;} return titleMatch;
    }
    private String cleanStore(String value){if(value==null)return "";int q=value.indexOf('?');String out=q>=0?value.substring(0,q):value;while(out.endsWith("/"))out=out.substring(0,out.length()-1);return out.toLowerCase(Locale.ROOT);}
    private String titleKey(String value){if(value==null)return "";return value.toLowerCase(Locale.ROOT).replaceAll("\\([^)]*(한국어|영어|일본어|중국어|korean|english|japanese|chinese)[^)]*\\)"," ").replaceAll("(?i)\\b(ps4|ps5)\\b|[™®]"," ").replaceAll("[^a-z0-9가-힣]+","");}
    private String won(double price){return String.format(Locale.KOREA,"%,.0f원",price);}

    private void notifyChange(String title,String text,int id){
        Context context=getApplicationContext();NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.O){NotificationChannel channel=new NotificationChannel(CHANNEL_ID,"PS Radar 관심 게임",NotificationManager.IMPORTANCE_DEFAULT);channel.setDescription("찜 게임의 가격, 할인, PS Plus 및 출시일 변화를 알려드립니다.");manager.createNotificationChannel(channel);}
        Intent intent=new Intent(context,MainActivity.class);intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);PendingIntent pending=PendingIntent.getActivity(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder=new NotificationCompat.Builder(context,CHANNEL_ID).setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(title).setContentText(text).setStyle(new NotificationCompat.BigTextStyle().bigText(text)).setAutoCancel(true).setContentIntent(pending).setPriority(NotificationCompat.PRIORITY_DEFAULT);manager.notify(id==0?177:id,builder.build());
    }
}
