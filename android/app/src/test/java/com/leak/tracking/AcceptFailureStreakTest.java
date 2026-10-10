package com.leak.tracking;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import org.junit.Test;

public class AcceptFailureStreakTest {

    @Test
    public void closesOnlyAfterTheLimitInARow() {
        AcceptFailureStreak streak = new AcceptFailureStreak();
        for (int i = 1; i < AcceptFailureStreak.LIMIT; i++) {
            assertFalse(streak.failure());
        }
        assertTrue(streak.failure());
    }

    @Test
    public void anAcceptedConnectionStartsTheCountAgain() {
        AcceptFailureStreak streak = new AcceptFailureStreak();
        for (int i = 1; i < AcceptFailureStreak.LIMIT; i++) streak.failure();
        streak.success();
        for (int i = 1; i < AcceptFailureStreak.LIMIT; i++) {
            assertFalse(streak.failure());
        }
    }

    /** Плагин без Capacitor не поднять — разводка сторожится по исходнику. */
    @Test
    public void acceptLoopLeavesOnTheLimit() throws Exception {
        String source = new String(
            Files.readAllBytes(Paths.get("src/main/java/com/leak/tracking/LocalSyncPlugin.java")),
            StandardCharsets.UTF_8
        );
        assertTrue(source.contains("failures.success();"));
        assertTrue(source.contains("if (failures.failure()) break;"));
    }
}
