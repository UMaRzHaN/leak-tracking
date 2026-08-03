package com.leak.tracking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class LocalSyncFailureTest {

    @Test
    public void putsTheCodeInTheStatusField() {
        assertEquals(
            "ERROR:SESSION_EXPIRED",
            LocalSyncFailure.status(LocalSyncFailure.SESSION_EXPIRED)
        );
    }

    // The status is what an older peer inspects. It compares against "OK" and
    // shows the message that follows, so a code appended here must not turn a
    // rejection into something it reads as success.
    @Test
    public void keepsACodedStatusRecognisableAsAFailure() {
        assertTrue(
            LocalSyncFailure.isFailureStatus(
                LocalSyncFailure.status(LocalSyncFailure.INVALID_CODE)
            )
        );
        assertTrue(LocalSyncFailure.isFailureStatus("ERROR"));
        assertFalse(LocalSyncFailure.isFailureStatus("OK"));
    }

    @Test
    public void readsTheCodeBackFromAStatus() {
        assertEquals(
            LocalSyncFailure.ARCHIVE_CORRUPT,
            LocalSyncFailure.codeFromStatus(
                LocalSyncFailure.status(LocalSyncFailure.ARCHIVE_CORRUPT)
            )
        );
    }

    // A device running the previous build sends a bare "ERROR" with no code.
    @Test
    public void reportsNoCodeForAnOlderPeer() {
        assertNull(LocalSyncFailure.codeFromStatus("ERROR"));
        assertNull(LocalSyncFailure.codeFromStatus("ERROR:"));
        assertNull(LocalSyncFailure.codeFromStatus(null));
    }

    @Test
    public void degradesToABareStatusWithoutACode() {
        assertEquals("ERROR", LocalSyncFailure.status(null));
        assertEquals("ERROR", LocalSyncFailure.status(""));
    }

    @Test
    public void exposesTheCodeOfASyncFailureOnly() {
        assertEquals(
            LocalSyncFailure.SESSION_BUSY,
            LocalSyncException.codeOf(
                new LocalSyncException(LocalSyncFailure.SESSION_BUSY, "занято")
            )
        );
        assertNull(LocalSyncException.codeOf(new Exception("boom")));
        assertNull(LocalSyncException.codeOf(null));
    }

    // The message still travels, because that is all an older peer can show.
    @Test
    public void keepsTheReadableMessageAlongsideTheCode() {
        LocalSyncException error = new LocalSyncException(
            LocalSyncFailure.INVALID_CODE,
            "Неверный код подключения"
        );
        assertEquals("Неверный код подключения", error.getMessage());
        assertEquals(
            "Неверный код подключения",
            LocalSyncErrorMessages.readable(error)
        );
    }
}
