package com.leak.tracking;

import java.io.File;
import java.util.Collection;

final class TempFilePolicy {
    private TempFilePolicy() {}

    static long aggregateSize(Collection<File> files) {
        long total = 0L;
        for (File file : files) {
            if (file == null || !file.exists()) continue;
            long length = Math.max(0L, file.length());
            if (Long.MAX_VALUE - total < length) return Long.MAX_VALUE;
            total += length;
        }
        return total;
    }

    static boolean hasSessionCapacity(int activeCount, int maxSessions) {
        return activeCount >= 0 && maxSessions > 0 && activeCount < maxSessions;
    }

    static boolean wouldExceedAggregate(
        Collection<File> files,
        long additionalBytes,
        long maxBytes
    ) {
        if (additionalBytes < 0L || maxBytes < 0L) return true;
        long current = aggregateSize(files);
        return current > maxBytes || additionalBytes > maxBytes - current;
    }

    static boolean wouldExceedFile(
        File file,
        long additionalBytes,
        long maxBytes
    ) {
        if (file == null || additionalBytes < 0L || maxBytes < 0L) return true;
        long current = file.exists() ? Math.max(0L, file.length()) : 0L;
        return current > maxBytes || additionalBytes > maxBytes - current;
    }

    static boolean isExpired(File file, long nowMs, long ttlMs) {
        if (file == null || !file.exists()) return true;
        long modifiedAt = file.lastModified();
        return modifiedAt <= 0L || nowMs - modifiedAt >= ttlMs;
    }

    static void touch(File file, long nowMs) {
        if (file != null && file.exists()) file.setLastModified(nowMs);
    }

    static int sweepExpired(
        File directory,
        String prefix,
        String suffix,
        long nowMs,
        long ttlMs
    ) {
        if (directory == null || !directory.isDirectory()) return 0;
        File[] candidates = directory.listFiles(file -> {
            String name = file.getName();
            return file.isFile() && name.startsWith(prefix) && name.endsWith(suffix);
        });
        if (candidates == null) return 0;

        int deleted = 0;
        for (File file : candidates) {
            if (isExpired(file, nowMs, ttlMs) && file.delete()) deleted += 1;
        }
        return deleted;
    }
}
