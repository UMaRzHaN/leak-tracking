package com.leak.tracking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public class SyncHandshakeDeadlineTest {
    @Test
    public void completionBeforeDeadlineCancelsCloseTask() {
        Fixture fixture = new Fixture();
        SyncHandshakeDeadline deadline = fixture.create(20_000L);

        deadline.start();
        fixture.clock.nowNanos = 19_999_000_000L;

        assertEquals(20_000L, fixture.tasks.get(0).delayMillis);
        assertTrue(deadline.complete());
        assertTrue(fixture.tasks.get(0).cancelled);
        assertFalse(deadline.didExpire());

        fixture.tasks.get(0).task.run();
        assertEquals(0, fixture.closes.get());
    }

    @Test
    public void scheduledDeadlineClosesConnectionAndCannotComplete() {
        Fixture fixture = new Fixture();
        SyncHandshakeDeadline deadline = fixture.create(20_000L);

        deadline.start();
        fixture.tasks.get(0).task.run();

        assertEquals(1, fixture.closes.get());
        assertTrue(deadline.didExpire());
        assertFalse(deadline.complete());
        assertTrue(fixture.tasks.get(0).cancelled);
    }

    @Test
    public void delayedSchedulerCannotExtendAbsoluteDeadline() {
        Fixture fixture = new Fixture();
        SyncHandshakeDeadline deadline = fixture.create(20_000L);

        deadline.start();
        fixture.clock.nowNanos = 20_001_000_000L;

        assertFalse(deadline.complete());
        assertTrue(deadline.didExpire());
        assertEquals(1, fixture.closes.get());
        assertTrue(fixture.tasks.get(0).cancelled);

        fixture.tasks.get(0).task.run();
        assertEquals(1, fixture.closes.get());
    }

    @Test
    public void connectionFailureCancelsDeadlineWithoutReportingExpiry() {
        Fixture fixture = new Fixture();
        SyncHandshakeDeadline deadline = fixture.create(20_000L);

        deadline.start();
        deadline.cancel();
        fixture.tasks.get(0).task.run();

        assertTrue(fixture.tasks.get(0).cancelled);
        assertFalse(deadline.didExpire());
        assertEquals(0, fixture.closes.get());
    }

    private static final class Fixture {
        private final FakeClock clock = new FakeClock();
        private final AtomicInteger closes = new AtomicInteger();
        private final List<ScheduledTask> tasks = new ArrayList<>();

        private SyncHandshakeDeadline create(long durationMillis) {
            return new SyncHandshakeDeadline(
                (task, delayMillis) -> {
                    ScheduledTask scheduled = new ScheduledTask(
                        task,
                        delayMillis
                    );
                    tasks.add(scheduled);
                    return () -> scheduled.cancelled = true;
                },
                clock,
                closes::incrementAndGet,
                durationMillis
            );
        }
    }

    private static final class FakeClock implements SyncHandshakeDeadline.NanoClock {
        private long nowNanos;

        @Override
        public long nanoTime() {
            return nowNanos;
        }
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
