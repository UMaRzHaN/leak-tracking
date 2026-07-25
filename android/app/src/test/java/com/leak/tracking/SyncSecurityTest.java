package com.leak.tracking;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class SyncSecurityTest {
    @Test
    public void acceptsIdenticalSecrets() {
        assertTrue(SyncSecurity.secretsEqual("482913", "482913"));
    }

    @Test
    public void rejectsDifferentOrMissingSecrets() {
        assertFalse(SyncSecurity.secretsEqual("482913", "482914"));
        assertFalse(SyncSecurity.secretsEqual("482913", null));
        assertFalse(SyncSecurity.secretsEqual(null, "482913"));
    }

    @Test
    public void comparesUtf8SecretsWithoutFallingBackToStringEquals() {
        assertTrue(SyncSecurity.secretsEqual("синхронизация", "синхронизация"));
        assertFalse(SyncSecurity.secretsEqual("синхронизация", "синхронизациЯ"));
    }
}
