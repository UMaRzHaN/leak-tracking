package com.leak.tracking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * Сторож неделимости выдачи.
 *
 * «Снять подготовленный с учёта» и «пометить занятым» — одно действие: между
 * двумя архив не принадлежит никому, и уборка уносит его из-под начавшейся
 * отправки. Саму гонку тестом не поймать — окно живёт микросекунды, и
 * прицельный тест на него оказался либо четырёхминутным, либо ничего не
 * проверяющим. Поэтому здесь сторожат не гонку, а два условия, при которых
 * она стала бы возможной: разорванная секция и новая щель в самом устройстве
 * хранилища.
 */
public class SyncArchiveVaultHandoverTest {

    private static final long TTL_MS = TimeUnit.MINUTES.toMillis(15);
    private static final Path SOURCE = Paths.get(
        "src/main/java/com/leak/tracking/SyncArchiveVault.java"
    );

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
            4096L,
            TTL_MS,
            TimeUnit.MINUTES.toMillis(10),
            3,
            3
        );
    }

    private static long now() {
        return System.currentTimeMillis();
    }

    /** Тело метода от его заголовка до закрывающей скобки. */
    private static String bodyOf(String source, String signature) {
        int start = source.indexOf(signature);
        assertTrue("метод не найден: " + signature, start >= 0);
        int depth = 0;
        for (int index = start; index < source.length(); index += 1) {
            char symbol = source.charAt(index);
            if (symbol == '{') depth += 1;
            if (symbol == '}') {
                depth -= 1;
                if (depth == 0) return source.substring(start, index + 1);
            }
        }
        throw new AssertionError("не закрылось тело метода: " + signature);
    }

    /**
     * Выдача — одна секция под замком, а не две.
     *
     * Проверка идёт по исходнику, потому что проверять тут нечего, кроме его
     * устройства: разорванная надвое, она ведёт себя так же во всём, кроме
     * промежутка, в который надо попасть.
     */
    @Test
    public void theHandoverIsASingleCriticalSection() throws Exception {
        // Путь считается от каталога модуля — так Gradle и запускает эти
        // тесты. Запущенный иначе, тест скажет об этом, а не притворится
        // проверкой.
        assertTrue(
            "исходник не найден по " + SOURCE.toAbsolutePath() +
            " — тест надо запускать из каталога модуля",
            Files.isReadable(SOURCE)
        );
        String body = bodyOf(
            new String(Files.readAllBytes(SOURCE), StandardCharsets.UTF_8),
            "File claimPrepared(String token, long now)"
        );

        assertEquals(
            "выдача разорвана на несколько секций — между ними архив ничей",
            1,
            body.split("synchronized \\(lock\\)", -1).length - 1
        );
        int section = body.indexOf("synchronized (lock)");
        String inside = body.substring(section);
        assertTrue("снятие с учёта ушло из секции", inside.contains("prepared.remove("));
        assertTrue("пометка занятым ушла из секции", inside.contains("active.add("));
    }

    /**
     * Способов получить файл наружу ровно три, и каждый проверен ниже. Новый
     * уронит этот тест и потребует решения: защищает ли он выданное.
     */
    @Test
    public void thereAreExactlyThreeWaysToGetAFileOut() {
        Set<String> found = new TreeSet<>();
        for (Method method : SyncArchiveVault.class.getDeclaredMethods()) {
            if (method.getReturnType() != File.class) continue;
            if (Modifier.isPrivate(method.getModifiers())) continue;
            found.add(method.getName());
        }

        assertEquals(
            "появился новый способ отдать файл — проверьте, переживает ли выданное уборку",
            new TreeSet<>(Arrays.asList("claimPrepared", "createTemporary", "prepared")),
            found
        );
    }

    /**
     * Свежесозданный временный файл ещё ничей — и это единственный случай,
     * когда уборка вправе его унести. Помечает его вызывающий, следующей
     * строкой.
     */
    @Test
    public void aFreshTemporaryFileIsProtectedOnceItIsMarkedActive() throws Exception {
        File archive = vault.createTemporary("local-sync-incoming");
        assertTrue(archive.setLastModified(now() - TTL_MS - 1));
        vault.markActive(archive);

        vault.sweep(now());

        assertTrue("занятый архив уборка не трогает", archive.exists());
    }

    /** Взятый по токену остаётся на учёте подготовленных. */
    @Test
    public void anArchiveLookedUpByTokenStaysProtected() throws Exception {
        String token = vault.prepare("local-sync-outgoing", now());
        File archive = vault.prepared(token);
        assertNotNull(archive);
        assertTrue(archive.setLastModified(now() - TTL_MS - 1));

        vault.sweep(now() - TTL_MS);

        assertTrue(archive.exists());
    }

    /**
     * Забранный в передачу переживает уборку: он больше не подготовленный, но
     * уже занятый — и ни на мгновение не был ни тем, ни другим.
     */
    @Test
    public void anArchiveHandedOverForTransferSurvivesTheSweep() throws Exception {
        String token = vault.prepare("local-sync-outgoing", now());
        File archive = vault.prepared(token);
        assertNotNull(archive);
        assertTrue(archive.setLastModified(now() - TTL_MS - 1));

        File claimed = vault.claimPrepared(token, now() - TTL_MS);
        assertEquals(archive, claimed);
        vault.sweep(now());

        assertTrue("забранный в передачу архив уборка унесла", archive.exists());
        vault.discardActive(claimed);
    }
}
