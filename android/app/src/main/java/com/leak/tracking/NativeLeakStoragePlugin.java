package com.leak.tracking;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "NativeLeakStorage")
public class NativeLeakStoragePlugin extends Plugin {
    private static final int MAX_JSON_CHARACTERS = 128 * 1024 * 1024;
    private final ExecutorService databaseExecutor = Executors.newSingleThreadExecutor();
    private LeakDatabaseStore store;

    @Override
    public void load() {
        store = new LeakDatabaseStore(getContext());
    }

    @PluginMethod
    public void load(PluginCall call) {
        execute(call, () -> {
            LeakDatabaseStore.ProjectData project = store.loadProject(
                requireProjectKey(call)
            );
            JSObject result = new JSObject();
            result.put("found", project.found);
            result.put("recordsJson", project.recordsJson);
            if (project.syncStateJson == null) result.put("syncStateJson", JSONObject.NULL);
            else result.put("syncStateJson", project.syncStateJson);
            result.put("updatedAt", project.updatedAt);
            LeakDatabaseStore.Diagnostics diagnostics = store.diagnostics(
                requireProjectKey(call)
            );
            result.put("databaseBytes", diagnostics.databaseBytes + diagnostics.walBytes);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void replaceAll(PluginCall call) {
        execute(call, () -> {
            String recordsJson = requireJson(call, "recordsJson");
            store.replaceAll(
                requireProjectKey(call),
                new JSONArray(recordsJson),
                optionalJson(call, "syncStateJson")
            );
            resolveDiagnostics(call, requireProjectKey(call));
        });
    }

    @PluginMethod
    public void applyChanges(PluginCall call) {
        execute(call, () -> {
            boolean applied = store.applyChanges(
                requireProjectKey(call),
                new JSONArray(requireJson(call, "upsertsJson")),
                new JSONArray(requireJson(call, "deletedIdsJson")),
                optionalJson(call, "syncStateJson")
            );
            if (!applied) {
                JSObject result = new JSObject();
                result.put("projectMissing", true);
                call.resolve(result);
                return;
            }
            resolveDiagnostics(call, requireProjectKey(call));
        });
    }

    @PluginMethod
    public void diagnostics(PluginCall call) {
        execute(call, () -> resolveDiagnostics(call, requireProjectKey(call)));
    }

    @PluginMethod
    public void deleteProject(PluginCall call) {
        execute(call, () -> {
            store.deleteProject(requireProjectKey(call));
            call.resolve();
        });
    }

    private void resolveDiagnostics(PluginCall call, String projectKey) throws Exception {
        LeakDatabaseStore.Diagnostics diagnostics = store.diagnostics(projectKey);
        JSObject result = new JSObject();
        result.put("found", diagnostics.found);
        result.put("recordCount", diagnostics.recordCount);
        result.put("updatedAt", diagnostics.updatedAt);
        if (diagnostics.lastWriteMode == null) result.put("lastWriteMode", JSONObject.NULL);
        else result.put("lastWriteMode", diagnostics.lastWriteMode);
        result.put("lastChangeCount", diagnostics.lastChangeCount);
        result.put("databaseBytes", diagnostics.databaseBytes);
        result.put("walBytes", diagnostics.walBytes);
        call.resolve(result);
    }

    private static String requireProjectKey(PluginCall call) {
        String value = call.getString("projectKey");
        if (value == null) throw new IllegalArgumentException("projectKey is required");
        return value;
    }

    private static String requireJson(PluginCall call, String name) {
        String value = call.getString(name);
        if (value == null) throw new IllegalArgumentException(name + " is required");
        if (value.length() > MAX_JSON_CHARACTERS) {
            throw new IllegalArgumentException(name + " exceeds the native storage limit");
        }
        return value;
    }

    private static String optionalJson(PluginCall call, String name) {
        if (!call.getData().has(name) || call.getData().isNull(name)) return null;
        return requireJson(call, name);
    }

    private void execute(PluginCall call, ThrowingOperation operation) {
        try {
            databaseExecutor.execute(() -> {
                try {
                    if (store == null) throw new IllegalStateException("SQLite store is not initialized");
                    operation.run();
                } catch (Exception error) {
                    call.reject(error.getMessage(), error);
                }
            });
        } catch (RejectedExecutionException error) {
            call.reject("Native SQLite storage is shutting down", error);
        }
    }

    @Override
    protected void handleOnDestroy() {
        databaseExecutor.shutdownNow();
        if (store != null) store.close();
        super.handleOnDestroy();
    }

    @FunctionalInterface
    private interface ThrowingOperation {
        void run() throws Exception;
    }
}
