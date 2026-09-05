package com.leak.tracking;

import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Кто из временных архивов кому обещан и сколько места под них забронировано.
 *
 * Три множества и счётчик байт, которые прежде лежали в плагине и трогались
 * из тридцати мест протокольного кода под общим замком. Замок переехал сюда
 * целиком, вместе с состоянием: разделять их нельзя — смысл замка ровно в том,
 * что снаружи это состояние неделимо.
 *
 * Границы критических секций сохранены ровно те, что были. Это не мелочь:
 * «взять подготовленный и пометить занятым» — одно действие, потому что между
 * двумя уборщик увидел бы архив, который уже никому не принадлежит, и унёс бы
 * его из-под начавшейся передачи. Поэтому здесь нет методов, из которых такую
 * пару можно было бы собрать снаружи.
 *
 * Три роли, а не одна:
 *   подготовленный — лежит и ждёт, пока его отправят; живёт по своему сроку
 *   занятый        — прямо сейчас в передаче; неприкосновенен для уборки
 *   выданный       — отдан вебу и ждёт, пока тот скажет, что забрал
 */
final class SyncArchiveVault {

    /** Откуда брать каталог кэша и текущий архив хоста. */
    interface Environment {
        File cacheDir();

        /** Архив, который раздаёт хост, если сессия открыта. */
        File hostedArchive();
    }

    private final Environment environment;
    private final long maxTemporaryBytes;
    private final long preparedTtlMs;
    private final long deliveredTtlMs;
    private final int maxPrepared;
    private final int maxDelivered;

    private final ConcurrentHashMap<String, File> prepared = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, File> delivered = new ConcurrentHashMap<>();
    private final Set<File> active = ConcurrentHashMap.newKeySet();
    private final Object lock = new Object();
    private long reservedBytes;

    SyncArchiveVault(
        Environment environment,
        long maxTemporaryBytes,
        long preparedTtlMs,
        long deliveredTtlMs,
        int maxPrepared,
        int maxDelivered
    ) {
        this.environment = environment;
        this.maxTemporaryBytes = maxTemporaryBytes;
        this.preparedTtlMs = preparedTtlMs;
        this.deliveredTtlMs = deliveredTtlMs;
        this.maxPrepared = maxPrepared;
        this.maxDelivered = maxDelivered;
    }

    File createTemporary(String prefix) throws Exception {
        return File.createTempFile(prefix + "-", SyncArchiveFiles.SUFFIX, environment.cacheDir());
    }

    boolean hasPrepared(String token) {
        return prepared.containsKey(token);
    }

    File prepared(String token) {
        return prepared.get(token);
    }

    /**
     * Заводит подготовленный архив под квотой и счётом сессий.
     *
     * Файл создаётся внутри замка вместе с записью о нём: созданный снаружи, он
     * успел бы попасть под уборку брошенных прежде, чем стал чьим-то.
     */
    String prepare(String prefix, long now) throws Exception {
        synchronized (lock) {
            sweepExpiredLocked(now);
            if (!TempFilePolicy.hasSessionCapacity(prepared.size(), maxPrepared)) {
                throw new Exception("Too many prepared sync archives are active");
            }
            if (wouldExceedQuotaLocked(1L)) {
                throw new Exception("Temporary sync archive quota is exhausted");
            }
            String token = UUID.randomUUID().toString();
            File archive = createTemporary(prefix);
            TempFilePolicy.touch(archive, now);
            prepared.put(token, archive);
            return token;
        }
    }

    /**
     * Дописывает кусок к подготовленному архиву под всеми пределами сразу.
     *
     * Проверка и запись — одно действие: между ними два потока прошли бы
     * проверку по очереди и записали бы вдвое больше разрешённого.
     */
    long append(File archive, byte[] chunk, long maxChunkBytes, long maxArchiveBytes, long now)
        throws Exception {
        synchronized (lock) {
            if (TempFilePolicy.isExpired(archive, now, preparedTtlMs)) {
                throw new LocalSyncException(LocalSyncFailure.SESSION_EXPIRED, "Archive token has expired");
            }
            if (chunk.length > maxChunkBytes) {
                throw new Exception("Archive chunk is too large");
            }
            if (
                TempFilePolicy.wouldExceedFile(archive, chunk.length, maxArchiveBytes) ||
                wouldExceedQuotaLocked(chunk.length)
            ) {
                throw new Exception("Archive exceeds the safety limit");
            }
            try (FileOutputStream stream = new FileOutputStream(archive, true)) {
                stream.write(chunk);
            }
            TempFilePolicy.touch(archive, now);
            return archive.length();
        }
    }

    /**
     * Забирает подготовленный архив в передачу.
     *
     * Снять с учёта и пометить занятым — одно действие. Между двумя архив не
     * принадлежал бы никому, и уборка брошенных унесла бы его из-под
     * начавшейся отправки.
     */
    File claimPrepared(String token, long now) {
        synchronized (lock) {
            sweepExpiredLocked(now);
            File archive = prepared.remove(token);
            if (archive != null) active.add(archive);
            return archive;
        }
    }

    void markActive(File archive) {
        if (archive == null) return;
        synchronized (lock) {
            active.add(archive);
        }
    }

    /** Снимает пометку занятого, оставляя файл вызывающему. */
    void releaseActive(File archive) {
        if (archive == null) return;
        synchronized (lock) {
            active.remove(archive);
        }
    }

    void discardActive(File archive) {
        if (archive == null) return;
        releaseActive(archive);
        archive.delete();
    }

    /**
     * Передаёт принятый архив вебу и возвращает расписку.
     *
     * Отказ уносит файл: расписки на него никто не получил, а значит, попросить
     * убрать его тоже будет некому.
     */
    String deliver(File archive, long now) throws Exception {
        synchronized (lock) {
            sweepExpiredLocked(now);
            if (delivered.size() >= maxDelivered) {
                active.remove(archive);
                archive.delete();
                throw new Exception("Too many received sync archives are awaiting release");
            }
            if (wouldExceedQuotaLocked(0L)) {
                active.remove(archive);
                archive.delete();
                throw new Exception("Temporary sync archive quota is exhausted");
            }
            String token = UUID.randomUUID().toString();
            TempFilePolicy.touch(archive, now);
            delivered.put(token, archive);
            active.remove(archive);
            return token;
        }
    }

    void discardPrepared(String token) {
        File archive;
        synchronized (lock) {
            archive = prepared.remove(token);
        }
        if (archive != null) archive.delete();
    }

    void discardDelivered(String token) {
        File archive;
        synchronized (lock) {
            archive = delivered.remove(token);
        }
        if (archive != null) archive.delete();
    }

    /**
     * Бронирует место под архив, который ещё только предстоит принять.
     *
     * Без брони размер учитывался бы лишь по мере того, как файл растёт, и
     * несколько приёмов сразу превысили бы квоту все вместе, каждый пройдя
     * проверку в одиночку.
     */
    void reserve(long bytes, long now) throws Exception {
        synchronized (lock) {
            sweepExpiredLocked(now);
            sweepOrphansLocked(now);
            if (wouldExceedQuotaLocked(bytes)) {
                throw new Exception("Temporary sync archive quota is exhausted");
            }
            reservedBytes += bytes;
        }
    }

    void release(long bytes) {
        synchronized (lock) {
            reservedBytes = Math.max(0L, reservedBytes - bytes);
        }
    }

    /** Уборка по расписанию: просроченные расписки и брошенные файлы. */
    void sweep(long now) {
        synchronized (lock) {
            sweepExpiredLocked(now);
            sweepOrphansLocked(now);
        }
    }

    void sweepOrphans(long now) {
        synchronized (lock) {
            sweepOrphansLocked(now);
        }
    }

    /** Уносит всё разом: приложение закрывается, дожидаться сроков некому. */
    void clear() {
        synchronized (lock) {
            for (File archive : prepared.values()) archive.delete();
            prepared.clear();
            for (File archive : delivered.values()) archive.delete();
            delivered.clear();
            for (File archive : active) archive.delete();
            active.clear();
            reservedBytes = 0L;
        }
    }

    private boolean wouldExceedQuotaLocked(long additionalBytes) {
        return SyncArchiveFiles.wouldExceedQuota(
            environment.cacheDir(),
            reservedBytes,
            additionalBytes,
            maxTemporaryBytes
        );
    }

    private void sweepExpiredLocked(long now) {
        SyncArchiveFiles.sweepExpiredEntries(prepared, now, preparedTtlMs);
        SyncArchiveFiles.sweepExpiredEntries(delivered, now, deliveredTtlMs);
    }

    private void sweepOrphansLocked(long now) {
        SyncArchiveFiles.sweepOrphans(environment.cacheDir(), protectedLocked(), now, preparedTtlMs);
    }

    private ArrayList<File> protectedLocked() {
        ArrayList<File> files = new ArrayList<>();
        files.addAll(prepared.values());
        files.addAll(delivered.values());
        files.addAll(active);
        File hosted = environment.hostedArchive();
        if (hosted != null) files.add(hosted);
        return files;
    }
}
