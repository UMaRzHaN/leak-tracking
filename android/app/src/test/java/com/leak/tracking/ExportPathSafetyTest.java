package com.leak.tracking;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class ExportPathSafetyTest {
    @Test
    public void sanitizesTraversalWithoutCreatingAnAbsolutePath() {
        assertEquals(
            "reports/2026",
            ExportPathSafety.sanitizeRelativePath("../../reports/./2026")
        );
        assertEquals(
            "reports/2026",
            ExportPathSafety.sanitizeRelativePath("..\\..\\reports\\2026")
        );
    }

    @Test
    public void dropsDotSegmentsPaddedWithWhitespace() {
        assertEquals(
            "reports/2026",
            ExportPathSafety.sanitizeRelativePath(" .. / ../  ../reports/ . /2026")
        );
        assertEquals("", ExportPathSafety.sanitizeRelativePath(" ..  /  . "));
    }

    @Test
    public void keepsNamesThatOnlyContainDots() {
        assertEquals(
            "...",
            ExportPathSafety.sanitizeRelativePath("...")
        );
        assertEquals(
            "v1..2",
            ExportPathSafety.sanitizeRelativePath(" v1..2 ")
        );
    }
}
