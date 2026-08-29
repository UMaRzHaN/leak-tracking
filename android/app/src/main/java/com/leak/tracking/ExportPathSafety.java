package com.leak.tracking;

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
}
