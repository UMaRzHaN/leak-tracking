package com.leak.tracking;

import java.util.ArrayList;
import java.util.List;

final class ExportPathSafety {
    private ExportPathSafety() {}

    static String sanitizeRelativePath(String path) {
        if (path == null || path.isEmpty()) return "";

        List<String> safeSegments = new ArrayList<>();
        for (String rawSegment : path.replace('\\', '/').split("/+")) {
            // Сравнение с "." и ".." — только после trim(): иначе " .. "
            // проходит проверку, а trim() тут же делает из него шаг наверх.
            String segment = rawSegment
                .replaceAll("[\\p{Cntrl}<>:\"|?*]", "_")
                .trim();
            if (
                segment.isEmpty() ||
                ".".equals(segment) ||
                "..".equals(segment)
            ) {
                continue;
            }
            safeSegments.add(segment);
        }
        return String.join("/", safeSegments);
    }
}
