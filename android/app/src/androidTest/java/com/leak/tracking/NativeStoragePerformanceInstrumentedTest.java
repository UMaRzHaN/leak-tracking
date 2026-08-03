package com.leak.tracking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeTrue;

import android.app.Activity;
import android.content.Context;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class NativeStoragePerformanceInstrumentedTest {
    private static final String TAG = "NativeStoragePerf";

    @Test
    public void sqliteStorageMeetsBudgets() throws Exception {
        Bundle arguments = InstrumentationRegistry.getArguments();
        assumeTrue(
            "Run with nativeStoragePerformance=true after building with " +
                "VITE_ENABLE_NATIVE_STORAGE_PERFORMANCE=true",
            "true".equals(arguments.getString("nativeStoragePerformance"))
        );

        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        launchActivityFromShell(context);
        Activity activity = waitForActivity();

        try {
            WebView webView = waitForWebView(activity);
            waitForPerformanceHarness(webView);
            evaluate(webView, buildPerformanceScenario());

            JSONObject envelope = waitForScenarioResult(webView);
            assertTrue(envelope.optString("error"), envelope.getBoolean("ok"));
            JSONObject result = envelope.getJSONObject("result");
            assertTrue(result.optString("error"), result.getBoolean("ok"));
            JSONArray scenarios = result.getJSONArray("scenarios");
            assertEquals(2, scenarios.length());

            for (int index = 0; index < scenarios.length(); index++) {
                assertScenarioBudgets(scenarios.getJSONObject(index));
            }

            Log.i(TAG, result.toString());
        } finally {
            activity.runOnUiThread(activity::finish);
        }
    }

    private static String buildPerformanceScenario() {
        return "window.__nativeStoragePerformanceResult=null;" +
            "window.__nativeStoragePerformance.run({recordCounts:[2000,10000]})" +
            ".then(result=>{window.__nativeStoragePerformanceResult=" +
            "JSON.stringify({ok:true,result:result});})" +
            ".catch(error=>{window.__nativeStoragePerformanceResult=" +
            "JSON.stringify({ok:false,error:String(error&&error.stack||error)});});" +
            "'started';";
    }

    private static void assertScenarioBudgets(JSONObject scenario) throws Exception {
        int recordCount = scenario.getInt("recordCount");
        boolean large = recordCount > 2_000;
        assertTrue("Unexpected record count " + recordCount, recordCount == 2_000 || recordCount == 10_000);
        assertEquals("sqlite", scenario.getString("engine"));

        assertAtMost(scenario, "initialWriteMs", large ? 90_000 : 30_000);
        assertAtMost(scenario, "coldLoadMs", large ? 35_000 : 15_000);
        assertAtMost(scenario, "singleMutationMs", large ? 10_000 : 5_000);
        assertAtMost(scenario, "loadAfterSingleMs", large ? 35_000 : 15_000);
        assertAtMost(scenario, "bulkMutationMs", large ? 20_000 : 10_000);
        assertAtMost(scenario, "loadAfterBulkMs", large ? 35_000 : 15_000);

        assertTrue(
            "SQLite database must contain data for " + recordCount + " records",
            scenario.getLong("initialDatabaseBytes") > 0
        );
        assertEquals(1, scenario.getInt("singleChangedRows"));
        assertEquals(100, scenario.getInt("bulkMutationCount"));
        assertEquals(100, scenario.getInt("bulkChangedRows"));

        if (recordCount == 2_000) {
            JSONObject repeated = scenario.getJSONObject("repeatedMutations");
            assertNotNull(repeated);
            assertTrue(
                "Repeated SQLite mutations took too long",
                repeated.getLong("durationMs") <= 60_000
            );
            assertTrue(
                "One SQLite mutation took too long",
                repeated.getLong("maxMutationMs") <= 10_000
            );
            assertEquals(40, repeated.getInt("mutationCount"));
            assertTrue(repeated.getLong("databaseBytes") > 0);
        }
    }

    private static void assertAtMost(JSONObject source, String key, long budgetMs) throws Exception {
        long actualMs = source.getLong(key);
        assertTrue(
            key + " exceeded budget: " + actualMs + " ms > " + budgetMs + " ms",
            actualMs <= budgetMs
        );
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
                // Drain shell output so activity startup completes before polling lifecycle.
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

    private static void waitForPerformanceHarness(WebView webView) throws Exception {
        long deadline = System.currentTimeMillis() + 30_000;
        while (System.currentTimeMillis() < deadline) {
            if (
                "object".equals(
                    evaluate(webView, "typeof window.__nativeStoragePerformance")
                )
            ) return;
            Thread.sleep(100);
        }
        throw new AssertionError(
            "Native storage performance harness was not bundled into the app"
        );
    }

    private static JSONObject waitForScenarioResult(WebView webView) throws Exception {
        long deadline = System.currentTimeMillis() + 300_000;
        while (System.currentTimeMillis() < deadline) {
            String value = evaluate(webView, "window.__nativeStoragePerformanceResult");
            if (value != null && !"null".equals(value)) return new JSONObject(value);
            Thread.sleep(250);
        }
        throw new AssertionError("Native storage performance scenario timed out");
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
        if (!latch.await(10, TimeUnit.SECONDS)) {
            throw new AssertionError("JavaScript evaluation timed out");
        }
        Object decoded = new JSONTokener(result.get()).nextValue();
        return decoded == JSONObject.NULL ? null : String.valueOf(decoded);
    }
}
