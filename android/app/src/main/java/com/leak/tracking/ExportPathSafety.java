package com.leak.tracking;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

final class ExportPathSafety {
    private ExportPathSafety() {}

    static String sanitizeRelativePath(String path) {
        if (path == null || path.isEmpty()) return "";

        List<String> safeSegments = new ArrayList<>();
        for (String rawSegment : path.replace('\\', '/').split("/+")) {
            if (
                rawSegment.isEmpty() ||
                ".".equals(rawSegment) ||
                "..".equals(rawSegment)
            ) {
                continue;
            }
            String segment = rawSegment
                .replaceAll("[\\p{Cntrl}<>:\"|?*]", "_")
                .trim();
            if (!segment.isEmpty()) safeSegments.add(segment);
        }
        return String.join("/", safeSegments);
    }

    static File resolveDescendant(File root, String relativePath) throws Exception {
        File canonicalRoot = root.getCanonicalFile();
        File candidate = relativePath == null || relativePath.isEmpty()
            ? canonicalRoot
            : new File(canonicalRoot, relativePath).getCanonicalFile();
        String rootPrefix = canonicalRoot.getPath() + File.separator;
        if (
            !candidate.equals(canonicalRoot) &&
            !candidate.getPath().startsWith(rootPrefix)
        ) {
            throw new Exception("Export path escapes the Documents directory");
        }
        return candidate;
    }
}
