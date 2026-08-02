package com.leak.tracking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.util.Arrays;
import org.junit.Test;

public class TempFilePolicyTest {
    @Test
    public void aggregateSizeCountsExistingFiles() throws Exception {
        File directory = Files.createTempDirectory("temp-policy").toFile();
        File first = new File(directory, "first.tmp");
        File second = new File(directory, "second.tmp");
        try (FileOutputStream stream = new FileOutputStream(first)) {
            stream.write(new byte[] { 1, 2, 3 });
        }
        try (FileOutputStream stream = new FileOutputStream(second)) {
            stream.write(new byte[] { 4, 5 });
        }

        assertEquals(5L, TempFilePolicy.aggregateSize(Arrays.asList(first, second)));
    }

    @Test
    public void enforcesSessionCapacity() {
        assertTrue(TempFilePolicy.hasSessionCapacity(0, 3));
        assertTrue(TempFilePolicy.hasSessionCapacity(2, 3));
        assertFalse(TempFilePolicy.hasSessionCapacity(3, 3));
        assertFalse(TempFilePolicy.hasSessionCapacity(-1, 3));
        assertFalse(TempFilePolicy.hasSessionCapacity(0, 0));
    }

    @Test
    public void detectsPerFileAndAggregateQuotaOverflow() throws Exception {
        File directory = Files.createTempDirectory("temp-policy").toFile();
        File first = new File(directory, "first.tmp");
        File second = new File(directory, "second.tmp");
        try (FileOutputStream stream = new FileOutputStream(first)) {
            stream.write(new byte[] { 1, 2, 3 });
        }
        try (FileOutputStream stream = new FileOutputStream(second)) {
            stream.write(new byte[] { 4, 5 });
        }

        assertFalse(TempFilePolicy.wouldExceedFile(first, 2L, 5L));
        assertTrue(TempFilePolicy.wouldExceedFile(first, 3L, 5L));
        assertFalse(
            TempFilePolicy.wouldExceedAggregate(
                Arrays.asList(first, second),
                1L,
                6L
            )
        );
        assertTrue(
            TempFilePolicy.wouldExceedAggregate(
                Arrays.asList(first, second),
                2L,
                6L
            )
        );
        assertTrue(
            TempFilePolicy.wouldExceedAggregate(
                Arrays.asList(first, second),
                Long.MAX_VALUE,
                Long.MAX_VALUE
            )
        );
    }

    @Test
    public void touchExtendsLifetimeAndMissingFilesAreExpired() throws Exception {
        File directory = Files.createTempDirectory("temp-policy").toFile();
        File file = new File(directory, "active.tmp");
        assertTrue(file.createNewFile());
        long now = System.currentTimeMillis();
        file.setLastModified(now - 20_000L);
        assertTrue(TempFilePolicy.isExpired(file, now, 10_000L));

        TempFilePolicy.touch(file, now);
        assertFalse(TempFilePolicy.isExpired(file, now + 1_000L, 10_000L));
        assertTrue(
            TempFilePolicy.isExpired(
                new File(directory, "missing.tmp"),
                now,
                10_000L
            )
        );
    }

    @Test
    public void sweepExpiredDeletesOnlyMatchingOldFiles() throws Exception {
        File directory = Files.createTempDirectory("temp-policy").toFile();
        long now = System.currentTimeMillis();
        File expired = new File(directory, "public-export-old.pending");
        File current = new File(directory, "public-export-current.pending");
        File unrelated = new File(directory, "other.pending");
        assertTrue(expired.createNewFile());
        assertTrue(current.createNewFile());
        assertTrue(unrelated.createNewFile());
        expired.setLastModified(now - 20_000L);
        current.setLastModified(now);
        unrelated.setLastModified(now - 20_000L);

        assertEquals(
            1,
            TempFilePolicy.sweepExpired(
                directory,
                "public-export-",
                ".pending",
                now,
                10_000L
            )
        );
        assertFalse(expired.exists());
        assertTrue(current.exists());
        assertTrue(unrelated.exists());
    }

    @Test
    public void sweepExpiredKeepsProtectedActiveFiles() throws Exception {
        File directory = Files.createTempDirectory("temp-policy").toFile();
        long now = System.currentTimeMillis();
        File protectedFile = new File(
            directory,
            "public-export-active.pending"
        );
        File orphan = new File(directory, "public-export-orphan.pending");
        assertTrue(protectedFile.createNewFile());
        assertTrue(orphan.createNewFile());
        protectedFile.setLastModified(now - 20_000L);
        orphan.setLastModified(now - 20_000L);

        assertEquals(
            1,
            TempFilePolicy.sweepExpired(
                directory,
                "public-export-",
                ".pending",
                now,
                10_000L,
                Arrays.asList(new File(directory, protectedFile.getName()))
            )
        );
        assertTrue(protectedFile.exists());
        assertFalse(orphan.exists());
    }
}
