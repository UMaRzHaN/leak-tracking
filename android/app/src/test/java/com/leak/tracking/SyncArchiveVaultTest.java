package com.leak.tracking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class SyncArchiveVaultTest {

    private static final long TTL_MS = TimeUnit.MINUTES.toMillis(15);
    private static final long DELIVERED_TTL_MS = TimeUnit.MINUTES.toMillis(10);
    private static final long QUOTA = 1024L;
    private static final long MAX_ARCHIVE = 512L;
    private static final long MAX_CHUNK = 64L;

    @Rule
    public TemporaryFolder cache = new TemporaryFolder();

    private final AtomicReference<File> hosted = new AtomicReference<>();
    private SyncArchiveVault vault;

    @Before
    public void setUp() {
        vault = newVault(QUOTA, 3, 3);
    }

    private SyncArchiveVault newVault(long quota, int maxPrepared, int maxDelivered) {
        return new SyncArchiveVault(
            new SyncArchiveVault.Environment() {
                @Override
                public File cacheDir() {
                    return cache.getRoot();
                }

                @Override
                public File hostedArchive() {
                    return hosted.get();
                }
            },
            quota,
            TTL_MS,
            DELIVERED_TTL_MS,
            maxPrepared,
            maxDelivered
        );
    }

    private static byte[] bytes(int size) {
        return new byte[size];
    }

    private static long now() {
        return System.currentTimeMillis();
    }

    @Test
    public void handsOutAPreparedArchiveThatIsReadyToBeWrittenTo() throws Exception {
        String token = vault.prepare("local-sync-outgoing", now());

        assertTrue(vault.hasPrepared(token));
        File archive = vault.prepared(token);
        assertNotNull(archive);
        assertTrue(archive.exists());
        assertEquals(0L, archive.length());
        assertEquals(16L, vault.append(archive, bytes(16), MAX_CHUNK, MAX_ARCHIVE, now()));
        assertEquals(32L, vault.append(archive, bytes(16), MAX_CHUNK, MAX_ARCHIVE, now()));
    }

    @Test
    public void refusesAChunkBiggerThanTheLimitWithoutWritingIt() throws Exception {
        String token = vault.prepare("local-sync-outgoing", now());
        File archive = vault.prepared(token);

        assertThrows(Exception.class, () -> vault.append(archive, bytes((int) MAX_CHUNK + 1), MAX_CHUNK, MAX_ARCHIVE, now()));

        assertEquals(0L, archive.length());
    }

    @Test
    public void stopsWritingWhenTheArchiveWouldOutgrowItsOwnLimit() throws Exception {
        String token = vault.prepare("local-sync-outgoing", now());
        File archive = vault.prepared(token);
        for (int written = 0; written < MAX_ARCHIVE; written += MAX_CHUNK) {
            vault.append(archive, bytes((int) MAX_CHUNK), MAX_CHUNK, MAX_ARCHIVE, now());
        }

        assertThrows(Exception.class, () -> vault.append(archive, bytes(1), MAX_CHUNK, MAX_ARCHIVE, now()));

        assertEquals(MAX_ARCHIVE, archive.length());
    }

    /**
     * Просроченный архив дописывать нельзя: уборщик уже вправе его унести, и
     * дописанное ушло бы в файл, которого через мгновение не будет.
     */
    @Test
    public void refusesToAppendToAnArchiveThatHasExpired() throws Exception {
        String token = vault.prepare("local-sync-outgoing", now());
        File archive = vault.prepared(token);

        LocalSyncException error = assertThrows(
            LocalSyncException.class,
            () -> vault.append(archive, bytes(1), MAX_CHUNK, MAX_ARCHIVE, now() + TTL_MS + 1)
        );

        assertEquals(LocalSyncFailure.SESSION_EXPIRED, error.getCode());
    }

    @Test
    public void countsPreparedArchivesAgainstTheirSessionLimit() throws Exception {
        SyncArchiveVault small = newVault(QUOTA, 2, 2);
        small.prepare("local-sync-outgoing", now());
        small.prepare("local-sync-outgoing", now());

        assertThrows(Exception.class, () -> small.prepare("local-sync-outgoing", now()));
    }

    @Test
    public void refusesToPrepareWhenTheCacheIsAlreadyFull() throws Exception {
        String token = vault.prepare("local-sync-outgoing", now());
        vault.append(vault.prepared(token), bytes((int) MAX_CHUNK), MAX_CHUNK, MAX_ARCHIVE, now());
        SyncArchiveVault tight = newVault(8L, 3, 3);

        assertThrows(Exception.class, () -> tight.prepare("local-sync-outgoing", now()));
    }

    /**
     * Взять подготовленный и пометить занятым — одно действие. Между двумя
     * архив не принадлежал бы никому, и уборка унесла бы его из-под начавшейся
     * отправки: здесь она идёт ровно в этот промежуток.
     */
    @Test
    public void doesNotLetTheSweepTakeAnArchiveItHasJustHandedOver() throws Exception {
        long past = now() - TTL_MS - 1;
        String token = vault.prepare("local-sync-outgoing", now());
        File archive = vault.prepared(token);
        assertTrue(archive.setLastModified(past));

        File claimed = vault.claimPrepared(token, now());
        vault.sweep(now());

        assertNull("просроченный не выдаётся", claimed);
        assertFalse(archive.exists());

        String fresh = vault.prepare("local-sync-outgoing", now());
        File freshArchive = vault.prepared(fresh);
        assertTrue(freshArchive.setLastModified(past));
        File freshClaimed = vault.claimPrepared(fresh, past + 1);
        vault.sweep(now());

        assertEquals(freshArchive, freshClaimed);
        assertTrue("занятый переживает уборку", freshArchive.exists());
    }

    @Test
    public void hasNothingToHandOverTwice() throws Exception {
        String token = vault.prepare("local-sync-outgoing", now());

        assertNotNull(vault.claimPrepared(token, now()));
        assertNull(vault.claimPrepared(token, now()));
        assertFalse(vault.hasPrepared(token));
    }

    @Test
    public void keepsTheHostedArchiveOutOfTheSweep() throws Exception {
        File hostedArchive = cache.newFile("local-sync-outgoing-hosted.zip");
        assertTrue(hostedArchive.setLastModified(now() - TTL_MS - 1));
        hosted.set(hostedArchive);

        vault.sweep(now());

        assertTrue(hostedArchive.exists());

        hosted.set(null);
        vault.sweep(now());

        assertFalse(hostedArchive.exists());
    }

    @Test
    public void turnsAReceivedArchiveIntoAReceiptAndBack() throws Exception {
        File received = cache.newFile("local-sync-incoming-1.zip");
        vault.markActive(received);

        String token = vault.deliver(received, now());
        vault.sweep(now());

        assertTrue(received.exists());
        vault.discardDelivered(token);
        assertFalse(received.exists());
    }

    /**
     * Отказ в выдаче уносит файл: расписки никто не получил, а значит,
     * попросить убрать его тоже будет некому.
     */
    @Test
    public void deletesAnArchiveItCouldNotHandOver() throws Exception {
        SyncArchiveVault small = newVault(QUOTA, 3, 1);
        File first = cache.newFile("local-sync-incoming-1.zip");
        File second = cache.newFile("local-sync-incoming-2.zip");
        small.markActive(first);
        small.markActive(second);
        small.deliver(first, now());

        assertThrows(Exception.class, () -> small.deliver(second, now()));

        assertTrue(first.exists());
        assertFalse(second.exists());
    }

    @Test
    public void reservesSpaceBeforeTheBytesExist() throws Exception {
        vault.reserve(QUOTA - 1, now());

        assertThrows(Exception.class, () -> vault.reserve(2L, now()));
        vault.release(QUOTA - 1);
        vault.reserve(2L, now());
    }

    /**
     * Освободить больше, чем бронировали, нельзя: счётчик, ушедший в минус,
     * снял бы ограничение для всех последующих.
     */
    @Test
    public void doesNotLetAnOverReleaseUnlockTheQuota() throws Exception {
        vault.reserve(10L, now());
        vault.release(1000L);
        vault.reserve(QUOTA, now());

        assertThrows(Exception.class, () -> vault.reserve(1L, now()));
    }

    @Test
    public void sweepsWhatExpiredAndSparesWhatDidNot() throws Exception {
        String stale = vault.prepare("local-sync-outgoing", now() - TTL_MS - 1);
        File staleArchive = vault.prepared(stale);
        assertNotNull(staleArchive);
        String alive = vault.prepare("local-sync-outgoing", now());
        File aliveArchive = vault.prepared(alive);

        vault.sweep(now());

        assertFalse(vault.hasPrepared(stale));
        assertFalse(staleArchive.exists());
        assertTrue(vault.hasPrepared(alive));
        assertTrue(aliveArchive.exists());
    }

    @Test
    public void takesEverythingWithItWhenTheAppGoesAway() throws Exception {
        String prepared = vault.prepare("local-sync-outgoing", now());
        File preparedArchive = vault.prepared(prepared);
        File active = vault.createTemporary("local-sync-incoming");
        vault.markActive(active);
        File received = vault.createTemporary("local-sync-response");
        vault.markActive(received);
        vault.deliver(received, now());
        vault.reserve(100L, now());

        vault.clear();

        assertFalse(preparedArchive.exists());
        assertFalse(active.exists());
        assertFalse(received.exists());
        assertFalse(vault.hasPrepared(prepared));
        vault.reserve(QUOTA, now());
    }

    /**
     * Проверка квоты и запись — одно действие. Будь между ними промежуток, два
     * потока прошли бы проверку по очереди и записали бы вдвое больше
     * разрешённого.
     */
    @Test
    public void keepsTwoWritersWithinOneArchiveLimit() throws Exception {
        String token = vault.prepare("local-sync-outgoing", now());
        File archive = vault.prepared(token);
        int threads = 8;
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(threads);
        AtomicInteger accepted = new AtomicInteger();

        for (int index = 0; index < threads; index += 1) {
            new Thread(() -> {
                try {
                    start.await();
                    vault.append(archive, bytes((int) MAX_CHUNK), MAX_CHUNK, MAX_ARCHIVE, now());
                    accepted.incrementAndGet();
                } catch (Exception ignored) {
                    // Отказ по пределу — ожидаемый исход для части потоков.
                } finally {
                    done.countDown();
                }
            }).start();
        }
        start.countDown();
        assertTrue(done.await(10, TimeUnit.SECONDS));

        assertEquals(MAX_ARCHIVE / MAX_CHUNK, accepted.get());
        assertEquals(MAX_ARCHIVE, archive.length());
    }

    /**
     * Расписку получает ровно один: подготовленный архив уходит в передачу
     * один раз, сколько бы потоков за ним ни пришло.
     */
    @Test
    public void handsOnePreparedArchiveToExactlyOneCaller() throws Exception {
        String token = vault.prepare("local-sync-outgoing", now());
        int threads = 8;
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(threads);
        AtomicInteger claimed = new AtomicInteger();

        for (int index = 0; index < threads; index += 1) {
            new Thread(() -> {
                try {
                    start.await();
                    if (vault.claimPrepared(token, now()) != null) claimed.incrementAndGet();
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
            }).start();
        }
        start.countDown();
        assertTrue(done.await(10, TimeUnit.SECONDS));

        assertEquals(1, claimed.get());
    }

    @Test
    public void leavesFilesThatAreNotItsOwnAlone() throws Exception {
        File foreign = cache.newFile("notes.txt");
        Files.write(foreign.toPath(), "важное".getBytes(StandardCharsets.UTF_8));
        assertTrue(foreign.setLastModified(now() - TTL_MS - 1));

        vault.sweep(now());
        vault.clear();

        assertTrue(foreign.exists());
    }
}
