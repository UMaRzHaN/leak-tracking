package com.leak.tracking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.file.Files;
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
    public void resolvesSafeFoldersBelowTheDocumentsRoot() throws Exception {
        File root = Files.createTempDirectory("export-root-").toFile();
        File resolved = ExportPathSafety.resolveDescendant(root, "reports/2026");

        assertTrue(
            resolved.getPath().startsWith(root.getCanonicalPath() + File.separator)
        );
    }

    @Test(expected = Exception.class)
    public void rejectsAPathThatEscapesTheDocumentsRoot() throws Exception {
        File root = Files.createTempDirectory("export-root-").toFile();
        ExportPathSafety.resolveDescendant(root, "../outside");
    }
}
