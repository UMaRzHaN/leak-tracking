package com.leak.tracking;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertThrows;

import org.junit.Test;

public class SyncTlsProtocolsTest {

    @Test
    public void keepsOnlyTheTwoModernVersions() throws Exception {
        String[] enabled = SyncTlsProtocols.modern(
            new String[] { "SSLv3", "TLSv1", "TLSv1.1", "TLSv1.2", "TLSv1.3" }
        );

        assertArrayEquals(new String[] { "TLSv1.2", "TLSv1.3" }, enabled);
    }

    /**
     * Список задан перечислением разрешённого: версия, о которой этот код не
     * знает, не включается сама.
     */
    @Test
    public void doesNotEnableAVersionItHasNotHeardOf() throws Exception {
        String[] enabled = SyncTlsProtocols.modern(new String[] { "TLSv1.2", "TLSv1.4" });

        assertArrayEquals(new String[] { "TLSv1.2" }, enabled);
    }

    @Test
    public void refusesToConnectWhenNothingModernIsOffered() {
        assertThrows(Exception.class, () -> SyncTlsProtocols.modern(new String[] { "SSLv3", "TLSv1" }));
        assertThrows(Exception.class, () -> SyncTlsProtocols.modern(new String[0]));
        assertThrows(Exception.class, () -> SyncTlsProtocols.modern(null));
    }
}
