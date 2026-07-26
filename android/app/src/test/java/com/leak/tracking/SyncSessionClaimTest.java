package com.leak.tracking;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class SyncSessionClaimTest {
    @Test
    public void allowsOnlyOneOwnerAndReleasesOnlyMatchingSession() {
        SyncSessionClaim claim = new SyncSessionClaim();
        Object first = new Object();
        Object second = new Object();

        assertTrue(claim.tryClaim(first));
        assertFalse(claim.tryClaim(second));

        claim.release(second);
        assertFalse(claim.tryClaim(second));

        claim.release(first);
        assertTrue(claim.tryClaim(second));
    }

    @Test
    public void oldReleaseCannotClearANewSessionAfterReset() {
        SyncSessionClaim claim = new SyncSessionClaim();
        Object oldSession = new Object();
        Object newSession = new Object();

        assertTrue(claim.tryClaim(oldSession));
        claim.reset();
        assertTrue(claim.tryClaim(newSession));

        claim.release(oldSession);
        assertFalse(claim.tryClaim(new Object()));
    }
}