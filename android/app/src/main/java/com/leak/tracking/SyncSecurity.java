package com.leak.tracking;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

final class SyncSecurity {
    private SyncSecurity() {}

    static boolean secretsEqual(String expected, String actual) {
        if (expected == null || actual == null) return false;
        return MessageDigest.isEqual(
            expected.getBytes(StandardCharsets.UTF_8),
            actual.getBytes(StandardCharsets.UTF_8)
        );
    }
}
