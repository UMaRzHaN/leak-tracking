package com.leak.tracking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * Маршруты плагина целиком: от подготовки архива до его исчезновения.
 *
 * Проверяется не отдельная операция, а то, чем кончается путь. Синхронизацию
 * между двумя телефонами здесь не воспроизвести, но самое частое последствие
 * переноса состояния — забытый на полпути архив и не снятая бронь — видно и
 * отсюда: после каждого пути в кэше не должно остаться ни файла, ни занятого
 * места.
 *
 * Последовательности повторяют плагин один в один, включая порядок вызовов на
 * путях отказа: именно там раньше и терялись файлы.
 */
public class SyncArchiveVaultFlowsTest {

    private static final long QUOTA = 4096L;
    private static final long MAX_ARCHIVE = 1024L;
    private static final long MAX_CHUNK = 128L;
    private static final long TTL_MS = TimeUnit.MINUTES.toMillis(15);

    @Rule
    public TemporaryFolder cache = new TemporaryFolder();

    private final AtomicReference<File> hosted = new AtomicReference<>();
    private SyncArchiveVault vault;

    @Before
    public void setUp() {
        vault = new SyncArchiveVault(
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
            QUOTA,
            TTL_MS,
            TimeUnit.MINUTES.toMillis(10),
            3,
            3
        );
    }

    /** После любого завершённого пути кэш пуст, а квота свободна целиком. */
    @After
    public void nothingIsLeftBehind() throws Exception {
        hosted.set(null);
        assertEquals(
            "в кэше остались временные архивы: " + SyncArchiveFiles.onDisk(cache.getRoot()),
            0,
            SyncArchiveFiles.onDisk(cache.getRoot()).size()
        );
        // Бронь во всю квоту проходит только если предыдущая снята полностью.
        vault.reserve(QUOTA, now());
        vault.release(QUOTA);
    }

    private static long now() {
        return System.currentTimeMillis();
    }

    private String preparedWithBytes(int size) throws Exception {
        String token = vault.prepare("local-sync-outgoing", now());
        vault.append(vault.prepared(token), new byte[size], MAX_CHUNK, MAX_ARCHIVE, now());
        return token;
    }

    /** `prepareArchive` → `appendArchiveChunk` → `discardArchive`. */
    @Test
    public void aPreparedArchiveTheUserCancelledLeavesNothing() throws Exception {
        String token = preparedWithBytes((int) MAX_CHUNK);

        vault.discardPrepared(token);
    }

    /** `startHost`, отказ проверки: архив забран и тут же выброшен. */
    @Test
    public void aHostSessionRejectedOnItsArgumentsLeavesNothing() throws Exception {
        String token = preparedWithBytes(16);

        File claimed = vault.claimPrepared(token, now());
        assertNotNull(claimed);
        vault.discardActive(claimed);
    }

    /** `startHost`, успех: архив держит хост, `stopHost` его удаляет. */
    @Test
    public void aHostSessionThatRanAndStoppedLeavesNothing() throws Exception {
        String token = preparedWithBytes(16);

        File claimed = vault.claimPrepared(token, now());
        vault.releaseActive(claimed);
        hosted.set(claimed);
        // Пока сессия открыта, уборка архив не трогает.
        assertTrue(claimed.setLastModified(now() - TTL_MS - 1));
        vault.sweep(now());
        assertTrue(claimed.exists());

        hosted.set(null);
        claimed.delete();
    }

    /** `exchange`: отправили своё, приняли чужое, веб забрал принятое. */
    @Test
    public void aCompletedExchangeLeavesNothing() throws Exception {
        String token = preparedWithBytes(32);
        File outgoing = vault.claimPrepared(token, now());

        long incomingSize = 64L;
        vault.reserve(incomingSize, now());
        File received = vault.createTemporary("local-sync-incoming");
        vault.markActive(received);
        vault.release(incomingSize);

        String receipt = vault.deliver(received, now());
        vault.discardActive(outgoing);

        vault.discardDelivered(receipt);
    }

    /** `exchange`, обрыв посреди приёма: снимается и бронь, и оба архива. */
    @Test
    public void anExchangeThatDiedMidTransferLeavesNothing() throws Exception {
        String token = preparedWithBytes(32);
        File outgoing = vault.claimPrepared(token, now());

        long incomingSize = 128L;
        vault.reserve(incomingSize, now());
        File received = null;
        try {
            received = vault.createTemporary("local-sync-incoming");
            vault.markActive(received);
            throw new Exception("соединение оборвалось");
        } catch (Exception ignored) {
            vault.discardActive(received);
        } finally {
            vault.release(incomingSize);
        }
        vault.discardActive(outgoing);
    }

    /** Приём, которому отказали по квоте: файл не создаётся вовсе. */
    @Test
    public void aTransferRefusedOnQuotaLeavesNothing() throws Exception {
        assertThrows(Exception.class, () -> vault.reserve(QUOTA + 1, now()));
    }

    /**
     * Веб забыл сказать, что забрал принятое.
     *
     * Расписка живёт по своему сроку, и уборка по расписанию уносит архив без
     * чьей-либо просьбы — иначе один несостоявшийся импорт занимал бы место до
     * перезапуска приложения.
     */
    @Test
    public void aReceiptNobodyRedeemedIsSweptOnItsOwn() throws Exception {
        File received = vault.createTemporary("local-sync-response");
        vault.markActive(received);
        vault.deliver(received, now() - TimeUnit.MINUTES.toMillis(10) - 1);

        vault.sweep(now());
    }

    /** Хост принимает импорт: архив приходит, отдаётся вебу, забирается. */
    @Test
    public void anAcceptedImportLeavesNothing() throws Exception {
        long size = 256L;
        vault.reserve(size, now());
        File received = vault.createTemporary("local-sync-import");
        vault.markActive(received);
        vault.release(size);

        String receipt = vault.deliver(received, now());
        vault.discardDelivered(receipt);
    }

    /** Приложение закрыли посреди всего: не остаётся ничего. */
    @Test
    public void closingTheAppMidFlightLeavesNothing() throws Exception {
        preparedWithBytes(16);
        String second = vault.prepare("local-sync-outgoing", now());
        vault.claimPrepared(second, now());
        File received = vault.createTemporary("local-sync-incoming");
        vault.markActive(received);
        vault.deliver(received, now());
        vault.reserve(512L, now());

        vault.clear();
    }
}
