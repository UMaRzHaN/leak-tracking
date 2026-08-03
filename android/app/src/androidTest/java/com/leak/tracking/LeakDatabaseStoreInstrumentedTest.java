package com.leak.tracking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class LeakDatabaseStoreInstrumentedTest {
    private Context context;
    private LeakDatabaseStore store;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.deleteDatabase(LeakDatabaseStore.DATABASE_NAME);
        store = new LeakDatabaseStore(context);
    }

    @After
    public void tearDown() {
        if (store != null) store.close();
        context.deleteDatabase(LeakDatabaseStore.DATABASE_NAME);
    }

    @Test
    public void replaceLoadAndSyncStateAreAtomic() throws Exception {
        JSONArray records = new JSONArray()
            .put(new JSONObject().put("id", "a").put("status", "open"))
            .put(new JSONObject().put("id", 2).put("status", "resolved"));
        String syncState = new JSONObject().put("revision", 7).toString();

        store.replaceAll("project-a", records, syncState);
        LeakDatabaseStore.ProjectData loaded = store.loadProject("project-a");

        assertTrue(loaded.found);
        assertEquals(records.toString(), loaded.recordsJson);
        assertEquals(syncState, loaded.syncStateJson);
        LeakDatabaseStore.Diagnostics diagnostics = store.diagnostics("project-a");
        assertEquals(2, diagnostics.recordCount);
        assertEquals("replace", diagnostics.lastWriteMode);
        assertEquals(2, diagnostics.lastChangeCount);
    }

    @Test
    public void incrementalChangesUpdateDeleteAndAppendWithoutReordering() throws Exception {
        JSONArray initial = new JSONArray()
            .put(new JSONObject().put("id", "a").put("value", 1))
            .put(new JSONObject().put("id", "b").put("value", 1));
        store.replaceAll("project-a", initial, null);

        boolean applied = store.applyChanges(
            "project-a",
            new JSONArray()
                .put(new JSONObject().put("id", "a").put("value", 2))
                .put(new JSONObject().put("id", "c").put("value", 3)),
            new JSONArray().put("b"),
            new JSONObject().put("revision", 2).toString()
        );

        assertTrue(applied);
        JSONArray loaded = new JSONArray(store.loadProject("project-a").recordsJson);
        assertEquals(2, loaded.length());
        assertEquals("a", loaded.getJSONObject(0).getString("id"));
        assertEquals(2, loaded.getJSONObject(0).getInt("value"));
        assertEquals("c", loaded.getJSONObject(1).getString("id"));
        LeakDatabaseStore.Diagnostics diagnostics = store.diagnostics("project-a");
        assertEquals("incremental", diagnostics.lastWriteMode);
        assertEquals(3, diagnostics.lastChangeCount);
    }

    @Test
    public void invalidReplacementLeavesPreviousTransactionIntact() throws Exception {
        JSONArray safe = new JSONArray().put(
            new JSONObject().put("id", "safe").put("value", 1)
        );
        store.replaceAll("project-a", safe, null);
        JSONArray duplicate = new JSONArray()
            .put(new JSONObject().put("id", "same"))
            .put(new JSONObject().put("id", "same"));

        try {
            store.replaceAll("project-a", duplicate, null);
            fail("Duplicate identifiers must be rejected");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("unique"));
        }

        assertEquals(safe.toString(), store.loadProject("project-a").recordsJson);
    }

    @Test
    public void missingProjectCannotReceivePartialMutation() throws Exception {
        boolean applied = store.applyChanges(
            "missing",
            new JSONArray().put(new JSONObject().put("id", "only-change")),
            new JSONArray(),
            null
        );

        assertFalse(applied);
        assertFalse(store.loadProject("missing").found);
    }

    @Test
    public void projectsRemainIsolated() throws Exception {
        store.replaceAll(
            "first",
            new JSONArray().put(new JSONObject().put("id", "a")),
            null
        );
        store.replaceAll(
            "second",
            new JSONArray().put(new JSONObject().put("id", "b")),
            null
        );
        store.deleteProject("first");

        assertFalse(store.loadProject("first").found);
        assertTrue(store.loadProject("second").found);
        assertEquals(
            "b",
            new JSONArray(store.loadProject("second").recordsJson)
                .getJSONObject(0)
                .getString("id")
        );
    }
}
