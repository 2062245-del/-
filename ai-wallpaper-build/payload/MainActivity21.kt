package com.seungho.ai_wallpaper_generator

import android.app.WallpaperManager
import android.graphics.BitmapFactory
import android.os.Build
import android.content.Intent
import android.net.Uri
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val channelName = "com.seungho.aiwallpaper/native"
    private val preferencesName = "ai_wallpaper_preferences"
    private val keyName = "pollinations_publishable_key"
    private val tokenName = "pollinations_user_access_token"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName).setMethodCallHandler { call, result ->
            when (call.method) {
                "getPublishableKey" -> {
                    val key = getSharedPreferences(preferencesName, MODE_PRIVATE).getString(keyName, null)
                    result.success(key)
                }

                "setPublishableKey" -> {
                    val key = call.argument<String>("key")?.trim().orEmpty()
                    if (!key.startsWith("pk_") || key.length < 8) {
                        result.error("INVALID_KEY", "Only pk_ publishable keys are allowed.", null)
                        return@setMethodCallHandler
                    }
                    val prefs = getSharedPreferences(preferencesName, MODE_PRIVATE)
                    val oldKey = prefs.getString(keyName, null)
                    val editor = prefs.edit().putString(keyName, key)
                    if (oldKey != key) editor.remove(tokenName)
                    editor.apply()
                    result.success(null)
                }

                "clearPublishableKey" -> {
                    getSharedPreferences(preferencesName, MODE_PRIVATE)
                        .edit()
                        .remove(keyName)
                        .remove(tokenName)
                        .apply()
                    result.success(null)
                }

                "getAccessToken" -> {
                    val token = getSharedPreferences(preferencesName, MODE_PRIVATE).getString(tokenName, null)
                    result.success(token)
                }

                "setAccessToken" -> {
                    val token = call.argument<String>("token")?.trim().orEmpty()
                    if (!token.startsWith("sk_") || token.length < 8) {
                        result.error("INVALID_TOKEN", "Invalid user authorization token.", null)
                        return@setMethodCallHandler
                    }
                    getSharedPreferences(preferencesName, MODE_PRIVATE)
                        .edit()
                        .putString(tokenName, token)
                        .apply()
                    result.success(null)
                }

                "clearAccessToken" -> {
                    getSharedPreferences(preferencesName, MODE_PRIVATE)
                        .edit()
                        .remove(tokenName)
                        .apply()
                    result.success(null)
                }

                "openExternalUrl" -> {
                    val url = call.argument<String>("url")?.trim().orEmpty()
                    val uri = runCatching { Uri.parse(url) }.getOrNull()
                    if (uri == null || (uri.scheme != "https" && uri.scheme != "http")) {
                        result.error("INVALID_URL", "Only http/https URLs are allowed.", null)
                        return@setMethodCallHandler
                    }
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, uri))
                        result.success(null)
                    } catch (e: Exception) {
                        result.error("OPEN_URL_FAILED", e.message ?: "Unable to open browser.", null)
                    }
                }

                "applyWallpaper" -> {
                    val bytes = call.argument<ByteArray>("bytes")
                    val target = call.argument<String>("target") ?: "both"
                    if (bytes == null || bytes.isEmpty()) {
                        result.error("INVALID_IMAGE", "Image data is empty.", null)
                        return@setMethodCallHandler
                    }

                    try {
                        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        if (bitmap == null) {
                            result.error("INVALID_IMAGE", "Unable to decode image.", null)
                            return@setMethodCallHandler
                        }

                        val wallpaperManager = WallpaperManager.getInstance(applicationContext)

                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                            when (target) {
                                "home" -> wallpaperManager.setBitmap(bitmap, null, true, WallpaperManager.FLAG_SYSTEM)
                                "lock" -> wallpaperManager.setBitmap(bitmap, null, true, WallpaperManager.FLAG_LOCK)
                                "both" -> wallpaperManager.setBitmap(
                                    bitmap,
                                    null,
                                    true,
                                    WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK
                                )
                                else -> {
                                    bitmap.recycle()
                                    result.error("INVALID_TARGET", "Unknown wallpaper target.", null)
                                    return@setMethodCallHandler
                                }
                            }
                        } else {
                            if (target != "home") {
                                bitmap.recycle()
                                result.error("UNSUPPORTED", "Lock-screen wallpaper requires Android 7.0 or newer.", null)
                                return@setMethodCallHandler
                            }
                            wallpaperManager.setBitmap(bitmap)
                        }

                        bitmap.recycle()
                        result.success(null)
                    } catch (e: Exception) {
                        result.error("APPLY_FAILED", e.message ?: "Wallpaper apply failed.", null)
                    }
                }

                else -> result.notImplemented()
            }
        }
    }
}
