package com.leak.tracking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class PluginNumbersTest {
    @Test
    public void readsIntegersProducedByJsonParsing() {
        // org.json returns Integer for every whole number below 2^31, which is
        // every realistic export size.
        assertEquals(Long.valueOf(524288L), PluginNumbers.asLong(Integer.valueOf(524288)));
    }

    @Test
    public void readsLongsAndDoubles() {
        assertEquals(Long.valueOf(3000000000L), PluginNumbers.asLong(Long.valueOf(3000000000L)));
        assertEquals(Long.valueOf(42L), PluginNumbers.asLong(Double.valueOf(42.0d)));
    }

    @Test
    public void readsZero() {
        assertEquals(Long.valueOf(0L), PluginNumbers.asLong(Integer.valueOf(0)));
    }

    @Test
    public void rejectsMissingAndNonNumericValues() {
        // A non-number means the JavaScript side sent the wrong thing; the
        // caller must reject rather than coerce it into a plausible size.
        assertNull(PluginNumbers.asLong(null));
        assertNull(PluginNumbers.asLong("17"));
        assertNull(PluginNumbers.asLong(Boolean.TRUE));
    }
}
