package com.leak.tracking;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public class ReplacingExportTest {
    /** Ничем не перехватываемый обрыв — как убитый посреди записи процесс. */
    private static final class ProcessKilled extends Error {}

    /** Папка Documents в памяти: имя, содержимое, опубликован ли файл. */
    private static class FakeStore implements ReplacingExport.Store<FakeStore.Entry> {
        static final class Entry {
            String name;
            byte[] content = new byte[0];
            boolean pending = true;
            boolean deletable = true;
        }

        final List<Entry> entries = new ArrayList<>();
        final List<String> log = new ArrayList<>();
        int failWriteAfterBytes = -1;
        boolean failPublish;

        Entry existing(String name, byte[] content) {
            Entry entry = new Entry();
            entry.name = name;
            entry.content = content;
            entry.pending = false;
            entries.add(entry);
            return entry;
        }

        @Override
        public Entry createPending(String name) {
            log.add("create");
            Entry entry = new Entry();
            entry.name = name;
            entries.add(entry);
            return entry;
        }

        @Override
        public void write(Entry item, InputStream source) throws Exception {
            log.add("write");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            int read;
            while ((read = source.read()) >= 0) {
                if (failWriteAfterBytes >= 0 && out.size() >= failWriteAfterBytes) {
                    item.content = out.toByteArray();
                    throw new IOException("ENOSPC (No space left on device)");
                }
                out.write(read);
            }
            item.content = out.toByteArray();
        }

        @Override
        public void publish(Entry item) throws Exception {
            log.add("publish");
            if (failPublish) throw new Exception("Unable to publish export file");
            item.pending = false;
        }

        @Override
        public void deleteOthersNamed(String name, Entry keep) {
            log.add("delete-old");
            entries.removeIf(entry -> entry != keep && entry.deletable && entry.name.equals(name));
        }

        @Override
        public String renameTo(Entry item, String name) {
            log.add("rename");
            boolean taken = entries.stream().anyMatch(entry -> entry != item && entry.name.equals(name));
            item.name = taken ? name.replace(".zip", " (1).zip") : name;
            return item.name;
        }

        @Override
        public void discard(Entry item) {
            log.add("discard");
            entries.remove(item);
        }

        Entry visible(String name) {
            for (Entry entry : entries) {
                if (!entry.pending && entry.name.equals(name)) return entry;
            }
            return null;
        }
    }

    private static final byte[] OLD = { 1, 1, 1 };
    private static final byte[] NEW = { 2, 2, 2, 2, 2 };

    @Test
    public void replacesPreviousBackupOnlyAfterTheNewOneIsPublished() throws Exception {
        FakeStore store = new FakeStore();
        store.existing("project.zip", OLD);

        String name = ReplacingExport.write(store, "project.zip", new ByteArrayInputStream(NEW));

        assertEquals("project.zip", name);
        assertEquals(1, store.entries.size());
        assertArrayEquals(NEW, store.visible("project.zip").content);
        assertEquals(
            List.of("create", "write", "publish", "delete-old", "rename"),
            store.log
        );
    }

    @Test
    public void failedWriteKeepsThePreviousBackup() {
        FakeStore store = new FakeStore();
        store.existing("project.zip", OLD);
        store.failWriteAfterBytes = 2;

        try {
            ReplacingExport.write(store, "project.zip", new ByteArrayInputStream(NEW));
            fail("write must fail");
        } catch (Exception error) {
            assertTrue(error.getMessage().contains("ENOSPC"));
        }

        assertEquals(1, store.entries.size());
        assertArrayEquals(OLD, store.visible("project.zip").content);
        assertFalse(store.log.contains("delete-old"));
    }

    @Test
    public void failedPublishKeepsThePreviousBackup() {
        FakeStore store = new FakeStore();
        store.existing("project.zip", OLD);
        store.failPublish = true;

        try {
            ReplacingExport.write(store, "project.zip", new ByteArrayInputStream(NEW));
            fail("publish must fail");
        } catch (Exception expected) {
            // Ожидаемо.
        }

        assertEquals(1, store.entries.size());
        assertArrayEquals(OLD, store.visible("project.zip").content);
    }

    @Test
    public void processKilledMidWriteLeavesOnlyAHiddenTemporaryBesideTheOldFile() {
        FakeStore store = new FakeStore() {
            @Override
            public void write(Entry item, InputStream source) {
                throw new ProcessKilled();
            }

            @Override
            public void discard(Entry item) {
                // Убитый процесс уже ничего не убирает.
            }
        };
        store.existing("project.zip", OLD);

        try {
            ReplacingExport.write(store, "project.zip", new ByteArrayInputStream(NEW));
            fail("write must not return");
        } catch (ProcessKilled expected) {
            // Ожидаемо.
        } catch (Exception unexpected) {
            fail(unexpected.toString());
        }

        assertArrayEquals(OLD, store.visible("project.zip").content);
        FakeStore.Entry temporary = store.entries.get(1);
        assertTrue(temporary.pending);
        assertTrue(temporary.name.endsWith("-project.zip"));
    }

    @Test
    public void undeletableOldFileLeavesTheNewOneUnderTheNameItGot() throws Exception {
        FakeStore store = new FakeStore();
        store.existing("project.zip", OLD).deletable = false;

        String name = ReplacingExport.write(store, "project.zip", new ByteArrayInputStream(NEW));

        assertEquals("project (1).zip", name);
        assertArrayEquals(OLD, store.visible("project.zip").content);
        assertArrayEquals(NEW, store.visible("project (1).zip").content);
    }

    @Test
    public void temporaryNameKeepsTheExtensionAndDiffersFromTheTarget() {
        String first = ReplacingExport.temporaryName("project.zip");
        String second = ReplacingExport.temporaryName("project.zip");

        assertTrue(first.endsWith(".zip"));
        assertFalse(first.equals("project.zip"));
        assertFalse(first.equals(second));
    }
}
