package com.leak.tracking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class SyncArchiveFilesTest {

    private static final long TTL_MS = TimeUnit.MINUTES.toMillis(15);

    @Rule
    public TemporaryFolder cache = new TemporaryFolder();

    private File archive(String name, int bytes, long modifiedAt) throws IOException {
        File file = cache.newFile(name);
        byte[] payload = new byte[bytes];
        Files.write(file.toPath(), payload);
        assertTrue(file.setLastModified(modifiedAt));
        return file;
    }

    @Test
    public void recognisesEveryRoleItSweeps() {
        for (String prefix : SyncArchiveFiles.PREFIXES) {
            assertTrue(prefix, SyncArchiveFiles.isTemporaryArchiveName(prefix + "1" + SyncArchiveFiles.SUFFIX));
        }
        assertFalse(SyncArchiveFiles.isTemporaryArchiveName("photo.jpg"));
        assertFalse(SyncArchiveFiles.isTemporaryArchiveName("local-sync.zip"));
        assertFalse(SyncArchiveFiles.isTemporaryArchiveName(null));
    }

    @Test
    public void listsOnlyItsOwnFilesFromTheCache() throws Exception {
        long now = System.currentTimeMillis();
        archive("local-sync-outgoing-1.zip", 10, now);
        archive("local-sync-import-2.zip", 20, now);
        archive("photo.jpg", 999, now);
        cache.newFolder("local-sync-outgoing-dir.zip");

        List<File> found = SyncArchiveFiles.onDisk(cache.getRoot());

        assertEquals(2, found.size());
        assertEquals(30L, TempFilePolicy.aggregateSize(found));
    }

    @Test
    public void countsWhatIsOnDiskTogetherWithWhatIsReserved() throws Exception {
        archive("local-sync-outgoing-1.zip", 100, System.currentTimeMillis());

        assertFalse(SyncArchiveFiles.wouldExceedQuota(cache.getRoot(), 50L, 50L, 200L));
        assertTrue(SyncArchiveFiles.wouldExceedQuota(cache.getRoot(), 50L, 51L, 200L));
    }

    /**
     * Бронь, ушедшая в минус или за край `long`, прошла бы любую проверку и
     * сняла бы ограничение вовсе — поэтому и то и другое считается
     * превышением, а не поводом продолжить.
     */
    @Test
    public void treatsNegativeAndOverflowingReservationsAsExhausted() {
        assertTrue(SyncArchiveFiles.wouldExceedQuota(cache.getRoot(), -1L, 1L, 1024L));
        assertTrue(SyncArchiveFiles.wouldExceedQuota(cache.getRoot(), 1L, -1L, 1024L));
        assertTrue(SyncArchiveFiles.wouldExceedQuota(cache.getRoot(), Long.MAX_VALUE, 1L, 1024L));
    }

    @Test
    public void survivesACacheDirectoryThatIsNotThere() {
        assertTrue(SyncArchiveFiles.onDisk(null).isEmpty());
        assertTrue(SyncArchiveFiles.wouldExceedQuota(null, 0L, 2048L, 1024L));
        SyncArchiveFiles.sweepOrphans(null, Collections.emptyList(), System.currentTimeMillis(), TTL_MS);
    }

    @Test
    public void sweepsAbandonedArchivesButSparesThePromisedOnes() throws Exception {
        long now = System.currentTimeMillis();
        File abandoned = archive("local-sync-incoming-1.zip", 10, now - TTL_MS - 1);
        File promised = archive("local-sync-outgoing-2.zip", 10, now - TTL_MS - 1);
        File fresh = archive("local-sync-response-3.zip", 10, now);
        File foreign = archive("notes.txt", 10, now - TTL_MS - 1);

        ArrayList<File> promisedFiles = new ArrayList<>();
        promisedFiles.add(promised);
        SyncArchiveFiles.sweepOrphans(cache.getRoot(), promisedFiles, now, TTL_MS);

        assertFalse(abandoned.exists());
        assertTrue(promised.exists());
        assertTrue(fresh.exists());
        assertTrue(foreign.exists());
    }

    @Test
    public void dropsEntriesWhoseArchiveOutlivedItsTtl() throws Exception {
        long now = System.currentTimeMillis();
        File expired = archive("local-sync-outgoing-1.zip", 10, now - TTL_MS - 1);
        File alive = archive("local-sync-outgoing-2.zip", 10, now);
        ConcurrentHashMap<String, File> archives = new ConcurrentHashMap<>();
        archives.put("expired", expired);
        archives.put("alive", alive);

        SyncArchiveFiles.sweepExpiredEntries(archives, now, TTL_MS);

        assertEquals(Collections.singleton("alive"), archives.keySet());
        assertFalse(expired.exists());
        assertTrue(alive.exists());
    }

    /**
     * Запись могли подменить между проверкой срока и удалением. Безусловное
     * удаление унесло бы только что положенный архив вместе с ключом.
     */
    @Test
    public void leavesAnEntryThatWasReplacedWhileItWasBeingSwept() throws Exception {
        long now = System.currentTimeMillis();
        File expired = archive("local-sync-outgoing-1.zip", 10, now - TTL_MS - 1);
        File replacement = archive("local-sync-outgoing-2.zip", 10, now);
        ConcurrentHashMap<String, File> archives = new ConcurrentHashMap<String, File>() {
            @Override
            public boolean remove(Object key, Object value) {
                put((String) key, replacement);
                return false;
            }
        };
        archives.put("token", expired);

        SyncArchiveFiles.sweepExpiredEntries(archives, now, TTL_MS);

        assertEquals(replacement, archives.get("token"));
        assertTrue(replacement.exists());
        assertTrue(expired.exists());
    }

    @Test
    public void readsAnEmptyCacheAsNothingToSweep() throws Exception {
        Files.write(cache.newFile("keep.me").toPath(), "x".getBytes(StandardCharsets.UTF_8));

        assertTrue(SyncArchiveFiles.onDisk(cache.getRoot()).isEmpty());
        assertFalse(SyncArchiveFiles.wouldExceedQuota(cache.getRoot(), 0L, 1L, 1024L));
    }
}
