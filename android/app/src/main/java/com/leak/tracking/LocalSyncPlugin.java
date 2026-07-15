package com.leak.tracking;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.Uri;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "LocalSync")
public class LocalSyncPlugin extends Plugin {
    private static final String MAGIC = "LEAK_TRACKER_SYNC_V2";
    private static final long MAX_ARCHIVE_BYTES = 64L * 1024L * 1024L;
    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int TRANSFER_TIMEOUT_MS = 120_000;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final ScheduledExecutorService cleanupExecutor = Executors.newSingleThreadScheduledExecutor();
    private final ConcurrentHashMap<String, File> preparedArchives = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, File> deliveredArchives = new ConcurrentHashMap<>();
    private final Object sessionLock = new Object();
    private volatile ServerSocket serverSocket;
    private volatile Socket activeClientSocket;
    private volatile File hostedArchive;
    private volatile String hostedProjectKey;
    private volatile String hostedSyncId;
    private volatile String sessionCode;

    @PluginMethod
    public void prepareArchive(PluginCall call) {
        try {
            String token = UUID.randomUUID().toString();
            preparedArchives.put(token, createTempArchive("local-sync-outgoing"));
            JSObject result = new JSObject();
            result.put("token", token);
            result.put("maxArchiveBytes", MAX_ARCHIVE_BYTES);
            call.resolve(result);
        } catch (Exception error) {
            call.reject(readableMessage(error), error);
        }
    }

    @PluginMethod
    public void appendArchiveChunk(PluginCall call) {
        String token = call.getString("token", "");
        String chunkBase64 = call.getString("chunkBase64");
        File archive = preparedArchives.get(token);
        if (archive == null || chunkBase64 == null) {
            call.reject("Unknown archive token or missing chunk");
            return;
        }

        try {
            byte[] chunk = Base64.decode(chunkBase64, Base64.DEFAULT);
            assertArchiveSizeLimit(archive.length() + chunk.length);
            try (FileOutputStream stream = new FileOutputStream(archive, true)) {
                stream.write(chunk);
            }
            JSObject result = new JSObject();
            result.put("size", archive.length());
            call.resolve(result);
        } catch (Exception error) {
            discardPreparedArchive(token);
            call.reject(readableMessage(error), error);
        }
    }

    @PluginMethod
    public void discardArchive(PluginCall call) {
        discardPreparedArchive(call.getString("token", ""));
        call.resolve();
    }

    @PluginMethod
    public void releaseReceivedArchive(PluginCall call) {
        discardDeliveredArchive(call.getString("archiveToken", ""));
        call.resolve();
    }

    @PluginMethod
    public void startHost(PluginCall call) {
        String archiveToken = call.getString("archiveToken", "");
        String projectKey = normalizeProjectKey(call.getString("projectKey"));
        String syncId = normalizeSyncId(call.getString("syncId"));
        File preparedArchive = preparedArchives.remove(archiveToken);
        if (preparedArchive == null || projectKey.isEmpty() || syncId.isEmpty()) {
            if (preparedArchive != null) preparedArchive.delete();
            call.reject("archiveToken, projectKey and syncId are required");
            return;
        }

        try {
            assertArchiveSize(preparedArchive.length());

            synchronized (sessionLock) {
                stopHostInternal();
                hostedArchive = preparedArchive;
                hostedProjectKey = projectKey;
                hostedSyncId = syncId;
                sessionCode = String.format(Locale.US, "%06d", RANDOM.nextInt(1_000_000));
                serverSocket = new ServerSocket(0);
                serverSocket.setReuseAddress(true);
            }

            ServerSocket activeServer = serverSocket;
            executor.execute(() -> acceptClient(activeServer));

            JSObject result = new JSObject();
            result.put("host", findLocalIpv4Address());
            result.put("port", activeServer.getLocalPort());
            result.put("code", sessionCode);
            result.put("maxArchiveBytes", MAX_ARCHIVE_BYTES);
            call.resolve(result);
        } catch (Exception error) {
            preparedArchive.delete();
            stopHostInternal();
            call.reject(readableMessage(error), error);
        }
    }

    @PluginMethod
    public void stopHost(PluginCall call) {
        stopHostInternal();
        call.resolve();
    }

    @PluginMethod
    public void exchange(PluginCall call) {
        String host = call.getString("host", "").trim();
        Integer port = call.getInt("port");
        String code = call.getString("code", "").trim();
        String projectKey = normalizeProjectKey(call.getString("projectKey"));
        String syncId = normalizeSyncId(call.getString("syncId"));
        String archiveToken = call.getString("archiveToken", "");
        File outgoing = preparedArchives.remove(archiveToken);

        if (host.isEmpty() || port == null || code.isEmpty() || projectKey.isEmpty() || outgoing == null) {
            if (outgoing != null) outgoing.delete();
            call.reject("host, port, code, projectKey and archiveToken are required");
            return;
        }

        executor.execute(() -> {
            try {
                assertArchiveSize(outgoing.length());
                File received = exchangeArchives(host, port, code, projectKey, syncId, outgoing);
                JSObject result = archiveResult(received);
                call.resolve(result);
            } catch (Exception error) {
                call.reject(readableMessage(error), error);
            } finally {
                outgoing.delete();
            }
        });
    }

    private void acceptClient(ServerSocket activeServer) {
        try {
            while (!activeServer.isClosed()) {
                Socket socket = null;
                try {
                    socket = activeServer.accept();
                    socket.setSoTimeout(TRANSFER_TIMEOUT_MS);
                    synchronized (sessionLock) {
                        if (serverSocket != activeServer) {
                            socket.close();
                            return;
                        }
                        activeClientSocket = socket;
                    }

                    if (handleClient(socket)) return;
                } catch (SocketException error) {
                    if (!activeServer.isClosed()) notifySyncError(error);
                } catch (Exception error) {
                    if (!activeServer.isClosed()) notifySyncError(error);
                } finally {
                    closeSocket(socket);
                    synchronized (sessionLock) {
                        if (activeClientSocket == socket) activeClientSocket = null;
                    }
                }
            }
        } finally {
            synchronized (sessionLock) {
                if (serverSocket == activeServer) {
                    stopHostInternal();
                }
            }
        }
    }

    private boolean handleClient(Socket socket) throws Exception {
        File received = null;
        try (
            DataInputStream input = new DataInputStream(new BufferedInputStream(socket.getInputStream()));
            DataOutputStream output = new DataOutputStream(new BufferedOutputStream(socket.getOutputStream()))
        ) {
            String magic = input.readUTF();
            if (!MAGIC.equals(magic)) {
                rejectPeer(output, "Несовместимая версия приложения на втором телефоне");
                return false;
            }
            String code = input.readUTF();
            String projectKey = normalizeProjectKey(input.readUTF());
            String syncId = normalizeSyncId(input.readUTF());
            long archiveSize = input.readLong();
            String expectedHash = input.readUTF();

            String expectedCode = sessionCode;
            String expectedProjectKey = hostedProjectKey;
            String expectedSyncId = hostedSyncId;
            File outgoing = hostedArchive;
            if (expectedCode == null || expectedProjectKey == null || expectedSyncId == null || outgoing == null) {
                rejectPeer(output, "Сеанс синхронизации уже остановлен");
                return false;
            }
            if (!expectedCode.equals(code)) {
                rejectPeer(output, "Неверный код подключения");
                return false;
            }
            if (!syncId.isEmpty()) {
                if (!expectedSyncId.equals(syncId)) {
                    rejectPeer(output, "Проекты имеют разное происхождение и не могут быть объединены");
                    return false;
                }
            } else if (!expectedProjectKey.equals(projectKey)) {
                rejectPeer(output, "На телефонах открыты разные проекты");
                return false;
            }
            try {
                assertArchiveSize(archiveSize);
            } catch (Exception error) {
                rejectPeer(output, readableMessage(error));
                return false;
            }

            output.writeUTF("READY");
            output.flush();

            received = createTempArchive("local-sync-incoming");
            receiveFile(input, received, archiveSize);
            if (!expectedHash.equals(sha256(received))) {
                received.delete();
                received = null;
                rejectPeer(output, "Архив повреждён при передаче");
                return false;
            }

            output.writeUTF("OK");
            output.writeLong(outgoing.length());
            output.writeUTF(sha256(outgoing));
            sendFile(output, outgoing);
            output.flush();

            notifyListeners("archiveReceived", archiveResult(received));
            received = null;
            return true;
        } finally {
            if (received != null) received.delete();
        }
    }

    private File exchangeArchives(
        String host,
        int port,
        String code,
        String projectKey,
        String syncId,
        File outgoing
    ) throws Exception {
        File received = null;
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), CONNECT_TIMEOUT_MS);
            socket.setSoTimeout(TRANSFER_TIMEOUT_MS);

            try (
                DataInputStream input = new DataInputStream(new BufferedInputStream(socket.getInputStream()));
                DataOutputStream output = new DataOutputStream(new BufferedOutputStream(socket.getOutputStream()))
            ) {
                output.writeUTF(MAGIC);
                output.writeUTF(code);
                output.writeUTF(projectKey);
                output.writeUTF(syncId);
                output.writeLong(outgoing.length());
                output.writeUTF(sha256(outgoing));
                output.flush();

                String readiness = input.readUTF();
                if (!"READY".equals(readiness)) {
                    throw new Exception(input.readUTF());
                }

                sendFile(output, outgoing);
                output.flush();

                String status = input.readUTF();
                if (!"OK".equals(status)) {
                    throw new Exception(input.readUTF());
                }

                long incomingSize = input.readLong();
                assertArchiveSize(incomingSize);
                String expectedHash = input.readUTF();
                received = createTempArchive("local-sync-response");
                receiveFile(input, received, incomingSize);
                if (!expectedHash.equals(sha256(received))) {
                    received.delete();
                    received = null;
                    throw new Exception("Архив повреждён при передаче");
                }
                File result = received;
                received = null;
                return result;
            }
        } finally {
            if (received != null) received.delete();
        }
    }

    private void rejectPeer(DataOutputStream output, String message) throws Exception {
        output.writeUTF("ERROR");
        output.writeUTF(message);
        output.flush();
    }

    private void receiveFile(DataInputStream input, File target, long expectedBytes) throws Exception {
        byte[] buffer = new byte[32 * 1024];
        long remaining = expectedBytes;
        try (FileOutputStream stream = new FileOutputStream(target, false)) {
            while (remaining > 0) {
                int read = input.read(buffer, 0, (int) Math.min(buffer.length, remaining));
                if (read < 0) throw new Exception("Соединение прервано во время передачи");
                stream.write(buffer, 0, read);
                remaining -= read;
            }
        }
    }

    private void sendFile(DataOutputStream output, File source) throws Exception {
        byte[] buffer = new byte[32 * 1024];
        try (FileInputStream stream = new FileInputStream(source)) {
            int read;
            while ((read = stream.read(buffer)) >= 0) {
                output.write(buffer, 0, read);
            }
        }
    }

    private File createTempArchive(String prefix) throws Exception {
        return File.createTempFile(prefix + "-", ".zip", getContext().getCacheDir());
    }

    private JSObject archiveResult(File file) {
        String token = UUID.randomUUID().toString();
        deliveredArchives.put(token, file);
        cleanupExecutor.schedule(() -> discardDeliveredArchive(token), 10, TimeUnit.MINUTES);
        JSObject result = new JSObject();
        result.put("uri", Uri.fromFile(file).toString());
        result.put("size", file.length());
        result.put("archiveToken", token);
        return result;
    }

    private void assertArchiveSize(long size) throws Exception {
        if (size <= 0) throw new Exception("Архив синхронизации пуст");
        assertArchiveSizeLimit(size);
    }

    private void assertArchiveSizeLimit(long size) throws Exception {
        if (size > MAX_ARCHIVE_BYTES) {
            throw new Exception("Архив синхронизации больше 64 МБ");
        }
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[32 * 1024];
        try (FileInputStream stream = new FileInputStream(file)) {
            int read;
            while ((read = stream.read(buffer)) >= 0) digest.update(buffer, 0, read);
        }
        StringBuilder value = new StringBuilder();
        for (byte item : digest.digest()) value.append(String.format(Locale.US, "%02x", item));
        return value.toString();
    }

    private String findLocalIpv4Address() throws Exception {
        ConnectivityManager connectivityManager = (ConnectivityManager) getContext().getSystemService(
            Context.CONNECTIVITY_SERVICE
        );
        if (connectivityManager != null) {
            Network activeNetwork = connectivityManager.getActiveNetwork();
            LinkProperties properties = activeNetwork == null ? null : connectivityManager.getLinkProperties(activeNetwork);
            if (properties != null && interfaceScore(properties.getInterfaceName()) >= 0) {
                for (LinkAddress linkAddress : properties.getLinkAddresses()) {
                    InetAddress address = linkAddress.getAddress();
                    if (address instanceof Inet4Address && address.isSiteLocalAddress()) {
                        return address.getHostAddress();
                    }
                }
            }
        }

        String fallback = null;
        int fallbackScore = Integer.MIN_VALUE;
        for (NetworkInterface network : Collections.list(NetworkInterface.getNetworkInterfaces())) {
            if (!network.isUp() || network.isLoopback()) continue;
            int score = interfaceScore(network.getName());
            if (score < 0) continue;
            for (InetAddress address : Collections.list(network.getInetAddresses())) {
                if (!(address instanceof Inet4Address) || address.isLoopbackAddress()) continue;
                String host = address.getHostAddress();
                if (address.isSiteLocalAddress() && score > fallbackScore) {
                    fallback = host;
                    fallbackScore = score;
                }
            }
        }
        if (fallback != null) return fallback;
        throw new Exception("Подключитесь к Wi-Fi или включите точку доступа");
    }

    private int interfaceScore(String rawName) {
        String name = rawName == null ? "" : rawName.toLowerCase(Locale.ROOT);
        if (name.startsWith("tun") || name.startsWith("ppp") || name.startsWith("rmnet") || name.contains("vpn")) {
            return -1;
        }
        if (name.startsWith("wlan")) return 100;
        if (name.startsWith("ap") || name.contains("softap") || name.startsWith("swlan")) return 95;
        if (name.startsWith("eth")) return 90;
        if (name.contains("p2p")) return 50;
        return 10;
    }

    private String normalizeProjectKey(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeSyncId(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private String readableMessage(Exception error) {
        String message = error.getMessage();
        return message == null || message.trim().isEmpty() ? error.getClass().getSimpleName() : message;
    }

    private void discardPreparedArchive(String token) {
        File archive = preparedArchives.remove(token);
        if (archive != null) archive.delete();
    }

    private void discardDeliveredArchive(String token) {
        File archive = deliveredArchives.remove(token);
        if (archive != null) archive.delete();
    }

    private void notifySyncError(Exception error) {
        JSObject payload = new JSObject();
        payload.put("message", readableMessage(error));
        notifyListeners("syncError", payload);
    }

    private void closeSocket(Socket socket) {
        if (socket == null) return;
        try {
            socket.close();
        } catch (Exception ignored) {}
    }

    private void stopHostInternal() {
        synchronized (sessionLock) {
            ServerSocket socket = serverSocket;
            serverSocket = null;
            if (socket != null) {
                try {
                    socket.close();
                } catch (Exception ignored) {}
            }
            Socket client = activeClientSocket;
            activeClientSocket = null;
            closeSocket(client);
            File archive = hostedArchive;
            hostedArchive = null;
            if (archive != null) archive.delete();
            hostedProjectKey = null;
            hostedSyncId = null;
            sessionCode = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        stopHostInternal();
        for (File archive : preparedArchives.values()) archive.delete();
        preparedArchives.clear();
        for (File archive : deliveredArchives.values()) archive.delete();
        deliveredArchives.clear();
        executor.shutdownNow();
        cleanupExecutor.shutdownNow();
        super.handleOnDestroy();
    }
}
