package com.leak.tracking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Drives the export bridge from the real WebView so the numeric arguments cross
 * the Capacitor JSON boundary exactly as they do in the app.
 *
 * <p>Regression guard: {@code expectedSize} arrives as an {@code Integer} for
 * every export below 2 GB, and reading it with {@code PluginCall#getLong} —
 * which only accepts {@code Long} — silently produced {@code null} and failed
 * every single export with "Unknown export token or missing fileName". A Java
 * unit test cannot catch that, because the defect lives in the serialization.
 */
@RunWith(AndroidJUnit4.class)
public class PublicFileWriterInstrumentedTest {
    private static final String EXPORT_CONTENT = "leak-tracking-export";

    @Test
    public void commitsExportWhoseSizeCrossesTheBridgeAsAnInteger() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        // A fixed folder with a unique file name: MediaStore can delete the
        // exported file but not the directory, so a per-run folder would leave
        // empty directories behind on the device.
        String folder = "LeakReports/instrumented";
        String fileName = "export_" + UUID.randomUUID().toString().replace("-", "") + ".bin";

        launchActivityFromShell(context);
        Activity activity = waitForActivity();

        try {
            WebView webView = waitForWebView(activity);
            waitForCapacitorRuntime(webView);
            evaluate(webView, buildExportScenario(folder, fileName));

            JSONObject result = waitForScenarioResult(webView);
            assertTrue(result.optString("error"), result.getBoolean("ok"));
            assertEquals("Documents/" + folder + "/" + fileName, result.getString("path"));
            assertTrue(
                "A size that does not match the streamed bytes must still be rejected",
                result.getBoolean("rejectedMismatchedSize")
            );

            byte[] written = readExport(context, folder, fileName);
            assertNotNull("Export file was not published to Documents", written);
            assertArrayEquals(EXPORT_CONTENT.getBytes(StandardCharsets.UTF_8), written);
        } finally {
            deleteExport(context, folder, fileName);
            activity.runOnUiThread(activity::finish);
        }
    }

    private static String buildExportScenario(String folder, String fileName) {
        // "leak-tracking-export" base64-encoded; 20 bytes, so expectedSize is a
        // plain JavaScript number that org.json parses as Integer.
        String chunkBase64 = "bGVhay10cmFja2luZy1leHBvcnQ=";
        int size = EXPORT_CONTENT.length();
        return "window.__publicFileWriterScenario = null;" +
            "(async()=>{" +
            "const writer=window.Capacitor.registerPlugin('PublicFileWriter');" +
            "try{" +
            "const prepared=await writer.prepare();" +
            "await writer.appendChunk({token:prepared.token,chunkBase64:'" + chunkBase64 + "'});" +
            "const committed=await writer.commit({token:prepared.token,expectedSize:" + size + "," +
            "folder:'" + folder + "',fileName:'" + fileName + "',mimeType:'application/octet-stream'});" +
            "const second=await writer.prepare();" +
            "await writer.appendChunk({token:second.token,chunkBase64:'" + chunkBase64 + "'});" +
            "let rejected=false;" +
            "try{await writer.commit({token:second.token,expectedSize:" + (size - 1) + "," +
            "folder:'" + folder + "',fileName:'mismatch_" + fileName + "',mimeType:'application/octet-stream'});}" +
            "catch(e){rejected=true;}" +
            "window.__publicFileWriterScenario=JSON.stringify({ok:true,path:committed.path," +
            "rejectedMismatchedSize:rejected});" +
            "}catch(e){window.__publicFileWriterScenario=JSON.stringify({ok:false," +
            "error:String(e&&e.message||e)});}" +
            "})();'started';";
    }

    private static byte[] readExport(Context context, String folder, String fileName)
        throws Exception {
        Uri item = findExport(context, folder, fileName);
        if (item == null) return null;
        try (InputStream source = context.getContentResolver().openInputStream(item)) {
            if (source == null) return null;
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int read;
            while ((read = source.read(chunk)) >= 0) {
                buffer.write(chunk, 0, read);
            }
            return buffer.toByteArray();
        }
    }

    private static void deleteExport(Context context, String folder, String fileName) {
        try {
            Uri item = findExport(context, folder, fileName);
            if (item != null) context.getContentResolver().delete(item, null, null);
        } catch (Exception ignored) {
            // Leaving a temporary export behind must not fail the test run.
        }
    }

    private static Uri findExport(Context context, String folder, String fileName) {
        ContentResolver resolver = context.getContentResolver();
        Uri collection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        String relativePath = Environment.DIRECTORY_DOCUMENTS + "/" + folder + "/";
        String selection =
            MediaStore.MediaColumns.DISPLAY_NAME + "=? AND " +
            MediaStore.MediaColumns.RELATIVE_PATH + "=?";

        try (
            Cursor cursor = resolver.query(
                collection,
                new String[] { MediaStore.MediaColumns._ID },
                selection,
                new String[] { fileName, relativePath },
                null
            )
        ) {
            if (cursor == null || !cursor.moveToFirst()) return null;
            long id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID));
            return Uri.withAppendedPath(collection, String.valueOf(id));
        }
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

    private static void waitForCapacitorRuntime(WebView webView) throws Exception {
        long deadline = System.currentTimeMillis() + 20_000;
        while (System.currentTimeMillis() < deadline) {
            if ("function".equals(evaluate(webView, "typeof window.Capacitor?.registerPlugin"))) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("Capacitor runtime was not ready");
    }

    private static JSONObject waitForScenarioResult(WebView webView) throws Exception {
        long deadline = System.currentTimeMillis() + 20_000;
        while (System.currentTimeMillis() < deadline) {
            String value = evaluate(webView, "window.__publicFileWriterScenario");
            if (value != null && !"null".equals(value)) return new JSONObject(value);
            Thread.sleep(100);
        }
        throw new AssertionError("Public file writer scenario timed out");
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
