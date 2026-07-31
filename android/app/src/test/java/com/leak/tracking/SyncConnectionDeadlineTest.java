package com.leak.tracking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public class SyncConnectionDeadlineTest {
    @Test
    public void preAuthDeadlineClosesAnUnauthenticatedConnection() {
        List<ScheduledTask> tasks = new ArrayList<>();
        AtomicInteger closes = new AtomicInteger();
        SyncConnectionDeadline deadline = new SyncConnectionDeadline(
            (task, delayMillis) -> {
                ScheduledTask scheduled = new ScheduledTask(task, delayMillis);
                tasks.add(scheduled);
                return () -> scheduled.cancelled = true;
            },
            closes::incrementAndGet,
            10_000L,
            900_000L
        );

        deadline.startPreAuth();
        tasks.get(0).task.run();

        assertEquals(1, closes.get());
        assertFalse(tasks.get(0).cancelled);
    }

    @Test
    public void authenticationCancelsPreAuthAndStartsProtocolDeadline() {
        List<ScheduledTask> tasks = new ArrayList<>();
        AtomicInteger closes = new AtomicInteger();
        SyncConnectionDeadline deadline = new SyncConnectionDeadline(
            (task, delayMillis) -> {
                ScheduledTask scheduled = new ScheduledTask(task, delayMillis);
                tasks.add(scheduled);
                return () -> scheduled.cancelled = true;
            },
            closes::incrementAndGet,
            10_000L,
            900_000L
        );

        deadline.startPreAuth();
        assertEquals(1, tasks.size());
        assertEquals(10_000L, tasks.get(0).delayMillis);
        assertFalse(tasks.get(0).cancelled);

        deadline.markAuthenticated();
        assertTrue(tasks.get(0).cancelled);
        assertEquals(2, tasks.size());
        assertEquals(900_000L, tasks.get(1).delayMillis);
        assertFalse(tasks.get(1).cancelled);

        tasks.get(1).task.run();
        assertEquals(1, closes.get());

        deadline.cancel();
        assertTrue(tasks.get(1).cancelled);
    }

    @Test
    public void closingBeforeAuthenticationCancelsThePreAuthDeadline() {
        List<ScheduledTask> tasks = new ArrayList<>();
        SyncConnectionDeadline deadline = new SyncConnectionDeadline(
            (task, delayMillis) -> {
                ScheduledTask scheduled = new ScheduledTask(task, delayMillis);
                tasks.add(scheduled);
                return () -> scheduled.cancelled = true;
            },
            () -> {},
            10_000L,
            900_000L
        );

        deadline.startPreAuth();
        deadline.cancel();

        assertEquals(1, tasks.size());
        assertTrue(tasks.get(0).cancelled);
    }

    private static final class ScheduledTask {
        private final Runnable task;
        private final long delayMillis;
        private boolean cancelled;

        private ScheduledTask(Runnable task, long delayMillis) {
            this.task = task;
            this.delayMillis = delayMillis;
        }
    }
}
