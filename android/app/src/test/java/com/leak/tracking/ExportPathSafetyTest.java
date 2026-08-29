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
}
