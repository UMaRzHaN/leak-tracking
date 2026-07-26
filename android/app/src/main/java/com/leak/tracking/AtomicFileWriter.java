package com.leak.tracking;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

final class AtomicFileWriter {
    interface Mover {
        void move(File source, File target) throws Exception;
    }

    private AtomicFileWriter() {}

    static void replace(File target, byte[] bytes, Mover mover) throws Exception {
        try (ByteArrayInputStream input = new ByteArrayInputStream(bytes)) {
            replace(target, input, mover);
        }
    }

    static void replace(File target, InputStream input, Mover mover) throws Exception {
        File directory = target.getParentFile();
        if (directory == null) throw new Exception("Export directory is missing");

        File pending = File.createTempFile(".leak-tracker-", ".pending", directory);
        boolean replaced = false;
        try {
            try (FileOutputStream stream = new FileOutputStream(pending, false)) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) >= 0) {
                    stream.write(buffer, 0, read);
                }
                stream.flush();
                stream.getFD().sync();
            }
            mover.move(pending, target);
            replaced = true;
        } finally {
            if (!replaced) pending.delete();
        }
    }
}
