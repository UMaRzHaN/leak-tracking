package com.leak.tracking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.pm.PackageManager;
import android.content.Context;
import android.view.View;
import android.view.accessibility.AccessibilityWindowInfo;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class NativeFileOperationsInstrumentedTest {
    @Test
    public void capacitorFilesystemRenamesAndDeletesProjectWithPhoto() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        launchActivityFromShell(context);
        Activity activity = waitForActivity();

        try {
            WebView webView = waitForWebView(activity);
            waitForFilesystemBridge(webView);

            String suffix = UUID.randomUUID().toString().replace("-", "");
            String oldRoot = "LeakReports/instrumented_old_" + suffix;
            String newRoot = "LeakReports/instrumented_new_" + suffix;
            String script = buildFileScenario(oldRoot, newRoot);
            evaluate(webView, script);

            JSONObject result = waitForScenarioResult(webView);
            assertTrue(result.optString("error"), result.getBoolean("ok"));
            assertEquals("photo-bytes", result.getString("photo"));
            assertTrue(result.getString("data").contains(newRoot));
            assertTrue(result.getBoolean("oldMissing"));
            assertTrue(result.getBoolean("newMissingAfterDelete"));
        } finally {
            activity.runOnUiThread(activity::finish);
        }
    }

    private static String buildFileScenario(String oldRoot, String newRoot) {
        return "window.__nativeFileScenario = null;" +
            "(async()=>{" +
            "const fs=window.Capacitor.Plugins.Filesystem;" +
            "try{" +
            "await fs.mkdir({path:'" + oldRoot + "/data',directory:'DATA',recursive:true});" +
            "await fs.mkdir({path:'" + oldRoot + "/photos',directory:'DATA',recursive:true});" +
            "await fs.writeFile({path:'" + oldRoot + "/data/data.json',directory:'DATA',encoding:'utf8'," +
            "data:JSON.stringify([{id:'native',photo:'data://" + oldRoot + "/photos/a.jpg'}])});" +
            "await fs.writeFile({path:'" + oldRoot + "/photos/a.jpg',directory:'DATA',data:'cGhvdG8tYnl0ZXM='});" +
            "await fs.rename({from:'" + oldRoot + "',to:'" + newRoot + "',directory:'DATA'});" +
            "const moved=await fs.readFile({path:'" + newRoot + "/data/data.json',directory:'DATA',encoding:'utf8'});" +
            "await fs.writeFile({path:'" + newRoot + "/data/data.json',directory:'DATA',encoding:'utf8'," +
            "data:moved.data.split('" + oldRoot + "').join('" + newRoot + "')});" +
            "const stored=await fs.readFile({path:'" + newRoot + "/data/data.json',directory:'DATA',encoding:'utf8'});" +
            "const photo=await fs.readFile({path:'" + newRoot + "/photos/a.jpg',directory:'DATA'});" +
            "let oldMissing=false;try{await fs.stat({path:'" + oldRoot + "',directory:'DATA'});}catch(e){oldMissing=true;}" +
            "await fs.rmdir({path:'" + newRoot + "',directory:'DATA',recursive:true});" +
            "let newMissing=false;try{await fs.stat({path:'" + newRoot + "',directory:'DATA'});}catch(e){newMissing=true;}" +
            "window.__nativeFileScenario=JSON.stringify({ok:true,data:stored.data,photo:atob(photo.data)," +
            "oldMissing:oldMissing,newMissingAfterDelete:newMissing});" +
            "}catch(e){window.__nativeFileScenario=JSON.stringify({ok:false,error:String(e&&e.message||e)});}" +
            "})();'started';";
    }

    private static void launchActivityFromShell(Context context) throws Exception {
        String component = context.getPackageName() + "/" + MainActivity.class.getName();
        try (
            android.os.ParcelFileDescriptor descriptor = InstrumentationRegistry
                .getInstrumentation()
                .getUiAutomation()
                .executeShellCommand("am start -W -n " + component);
            java.io.FileInputStream output = new java.io.FileInputStream(
                descriptor.getFileDescriptor()
            )
        ) {
            byte[] buffer = new byte[1024];
            while (output.read(buffer) != -1) {
                // Drain command output so the activity launch completes before polling lifecycle.
            }
        }
    }

    private static Activity waitForActivity() throws Exception {
        AtomicReference<Activity> found = new AtomicReference<>();
        long deadline = System.currentTimeMillis() + 20_000;
        while (System.currentTimeMillis() < deadline) {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                for (Activity activity : ActivityLifecycleMonitorRegistry.getInstance()
                    .getActivitiesInStage(Stage.RESUMED)) {
                    if (activity instanceof MainActivity) found.set(activity);
                }
            });
            if (found.get() != null) return found.get();
            Thread.sleep(100);
        }
        throw new AssertionError("MainActivity did not reach RESUMED state");
    }

    private static WebView waitForWebView(Activity activity) throws Exception {
        AtomicReference<WebView> found = new AtomicReference<>();
        long deadline = System.currentTimeMillis() + 20_000;
        while (System.currentTimeMillis() < deadline) {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                found.set(findWebView(activity.getWindow().getDecorView()))
            );
            if (found.get() != null) return found.get();
            Thread.sleep(100);
        }
        throw new AssertionError("App WebView was not created");
    }

    private static WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (!(view instanceof ViewGroup)) return null;
        ViewGroup group = (ViewGroup) view;
        for (int index = 0; index < group.getChildCount(); index++) {
            WebView found = findWebView(group.getChildAt(index));
            if (found != null) return found;
        }
        return null;
    }

    private static void waitForFilesystemBridge(WebView webView) throws Exception {
        long deadline = System.currentTimeMillis() + 20_000;
        while (System.currentTimeMillis() < deadline) {
            if ("object".equals(evaluate(webView, "typeof window.Capacitor?.Plugins?.Filesystem"))) return;
            Thread.sleep(100);
        }
        throw new AssertionError("Capacitor Filesystem bridge was not ready");
    }

    private static JSONObject waitForScenarioResult(WebView webView) throws Exception {
        long deadline = System.currentTimeMillis() + 20_000;
        while (System.currentTimeMillis() < deadline) {
            String value = evaluate(webView, "window.__nativeFileScenario");
            if (value != null && !"null".equals(value)) return new JSONObject(value);
            Thread.sleep(100);
        }
        throw new AssertionError("Native file scenario timed out");
    }

    private static String evaluate(WebView webView, String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
            webView.evaluateJavascript(script, value -> {
                result.set(value);
                latch.countDown();
            })
        );
        if (!latch.await(10, TimeUnit.SECONDS)) throw new AssertionError("JavaScript evaluation timed out");
        Object decoded = new JSONTokener(result.get()).nextValue();
        return decoded == JSONObject.NULL ? null : String.valueOf(decoded);
    }
}
