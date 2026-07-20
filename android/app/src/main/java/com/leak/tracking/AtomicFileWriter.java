package com.leak.tracking;

import java.io.File;
import java.io.FileOutputStream;

final class AtomicFileWriter {
    interface Mover {
        void move(File source, File target) throws Exception;
    }

    private AtomicFileWriter() {}

    static void replace(File target, byte[] bytes, Mover mover) throws Exception {
        File directory = target.getParentFile();
        if (directory == null) throw new Exception("Export directory is missing");

        File pending = File.createTempFile(".leak-tracker-", ".pending", directory);
        boolean replaced = false;
        try {
            try (FileOutputStream stream = new FileOutputStream(pending, false)) {
                stream.write(bytes);
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
