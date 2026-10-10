package com.leak.tracking;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.util.List;
import org.junit.Before;
import org.junit.Test;

public class CorruptDatabaseQuarantineTest {
    @Before
    public void reset() {
        CorruptDatabaseQuarantine.resetForTests();
    }

    @Test
    public void copiesTheDatabaseAndItsJournalWithoutDeletingThem() throws Exception {
        File directory = Files.createTempDirectory("quarantine").toFile();
        File database = new File(directory, "leak_tracking.db");
        File wal = new File(directory, "leak_tracking.db-wal");
        Files.write(database.toPath(), new byte[] { 1, 2, 3 });
        Files.write(wal.toPath(), new byte[] { 4, 5 });

        List<File> copies = CorruptDatabaseQuarantine.preserve(database, 42L);

        assertEquals(2, copies.size());
        assertTrue(database.isFile());
        assertTrue(wal.isFile());
        assertArrayEquals(
            new byte[] { 1, 2, 3 },
            Files.readAllBytes(new File(directory, "leak_tracking.db.corrupt-42").toPath())
        );
        assertArrayEquals(
            new byte[] { 4, 5 },
            Files.readAllBytes(new File(directory, "leak_tracking.db.corrupt-42-wal").toPath())
        );
    }

    @Test
    public void copiesOnlyOncePerRun() throws Exception {
        File directory = Files.createTempDirectory("quarantine").toFile();
        File database = new File(directory, "leak_tracking.db");
        Files.write(database.toPath(), new byte[] { 1 });

        assertEquals(1, CorruptDatabaseQuarantine.preserve(database, 1L).size());
        assertEquals(0, CorruptDatabaseQuarantine.preserve(database, 2L).size());
        assertTrue(!new File(directory, "leak_tracking.db.corrupt-2").exists());
    }

    @Test
    public void ignoresAMissingDatabase() throws Exception {
        File directory = Files.createTempDirectory("quarantine").toFile();

        assertEquals(
            0,
            CorruptDatabaseQuarantine.preserve(new File(directory, "absent.db"), 1L).size()
        );
        assertEquals(0, CorruptDatabaseQuarantine.preserve((File) null, 1L).size());
        assertEquals(0, CorruptDatabaseQuarantine.preserve((String) null, 1L).size());
        assertEquals(0, CorruptDatabaseQuarantine.preserve(":memory:", 1L).size());
    }

    @Test
    public void acceptsThePathTheDatabaseReports() throws Exception {
        File directory = Files.createTempDirectory("quarantine").toFile();
        File database = new File(directory, "leak_tracking.db");
        Files.write(database.toPath(), new byte[] { 7 });

        assertEquals(1, CorruptDatabaseQuarantine.preserve(database.getPath(), 5L).size());
        assertTrue(new File(directory, "leak_tracking.db.corrupt-5").isFile());
        assertTrue(database.isFile());
    }
}
