package com.leak.tracking;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
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
import java.math.BigInteger;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.security.spec.ECGenParameterSpec;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLServerSocket;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import javax.security.auth.x500.X500Principal;

@CapacitorPlugin(name = "LocalSync")
public class LocalSyncPlugin extends Plugin {
    private static final String MAGIC = "LEAK_TRACKER_SYNC_V3";
    private static final String IMPORT_MAGIC = "LEAK_TRACKER_SYNC_IMPORT_V3";
    private static final long MAX_ARCHIVE_BYTES = 1024L * 1024L * 1024L;
    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int HANDSHAKE_TIMEOUT_MS = 10_000;
    private static final int TRANSFER_TIMEOUT_MS = 120_000;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int MAX_FAILED_AUTH_ATTEMPTS = 5;
    private static final int MAX_CONCURRENT_HANDSHAKES = 4;
    private static final String TLS_KEY_ALIAS_PREFIX = "local-sync-";

    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final ScheduledExecutorService cleanupExecutor = Executors.newSingleThreadScheduledExecutor();
    private final ConcurrentHashMap<String, File> preparedArchives = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, File> deliveredArchives = new ConcurrentHashMap<>();
    private final Object sessionLock = new Object();
    private final SyncConnectionGuard connectionGuard = new SyncConnectionGuard(MAX_CONCURRENT_HANDSHAKES, MAX_FAILED_AUTH_ATTEMPTS);
    private final Set<Socket> activeClientSockets = ConcurrentHashMap.newKeySet();
    private volatile ServerSocket serverSocket;
    private volatile File hostedArchive;
    private volatile String hostedProjectKey;
    private volatile String hostedSyncId;
    private volatile String sessionCode;
    private volatile String hostKeyAlias;
    private volatile String hostCertificateFingerprint;
    private final SyncSessionClaim exchangeClaim = new SyncSessionClaim();


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
            TlsHostContext tlsHost = createTlsHostContext();

            synchronized (sessionLock) {
                stopHostInternal();
                hostedArchive = preparedArchive;
                hostedProjectKey = projectKey;
                hostedSyncId = syncId;
                sessionCode = String.format(Locale.US, "%06d", RANDOM.nextInt(1_000_000));
                connectionGuard.resetFailures();
                hostKeyAlias = tlsHost.keyAlias;
                hostCertificateFingerprint = tlsHost.fingerprint;
                SSLServerSocket tlsServerSocket = (SSLServerSocket) tlsHost.context
                    .getServerSocketFactory()
                    .createServerSocket(0);
                enableModernTls(tlsServerSocket);
                serverSocket = tlsServerSocket;
                serverSocket.setReuseAddress(true);
            }

            ServerSocket activeServer = serverSocket;
            executor.execute(() -> acceptClient(activeServer));

            JSObject result = new JSObject();
            result.put("host", findLocalIpv4Address());
            result.put("port", activeServer.getLocalPort());
            result.put("code", sessionCode);
            result.put("fingerprint", hostCertificateFingerprint);
            result.put("securityKey", hostCertificateFingerprint.substring(0, 16));
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
        String fingerprint = normalizeFingerprint(call.getString("fingerprint"));
        String projectKey = normalizeProjectKey(call.getString("projectKey"));
        String syncId = normalizeSyncId(call.getString("syncId"));
        String archiveToken = call.getString("archiveToken", "");
        File outgoing = preparedArchives.remove(archiveToken);

        if (host.isEmpty() || port == null || code.isEmpty() || !isValidFingerprint(fingerprint) || projectKey.isEmpty() || outgoing == null) {
            if (outgoing != null) outgoing.delete();
            call.reject("host, port, code, fingerprint, projectKey and archiveToken are required");
            return;
        }

        executor.execute(() -> {
            try {
                assertArchiveSize(outgoing.length());
                File received = exchangeArchives(host, port, code, fingerprint, projectKey, syncId, outgoing);
                JSObject result = archiveResult(received);
                call.resolve(result);
            } catch (Exception error) {
                call.reject(readableMessage(error), error);
            } finally {
                outgoing.delete();
            }
        });
    }

    @PluginMethod
    public void fetchArchive(PluginCall call) {
        String host = call.getString("host", "").trim();
        Integer port = call.getInt("port");
        String code = call.getString("code", "").trim();
        String fingerprint = normalizeFingerprint(call.getString("fingerprint"));
        String projectKey = normalizeProjectKey(call.getString("projectKey"));
        String syncId = normalizeSyncId(call.getString("syncId"));

        if (host.isEmpty() || port == null || code.isEmpty() || !isValidFingerprint(fingerprint) || projectKey.isEmpty() || syncId.isEmpty()) {
            call.reject("host, port, code, fingerprint, projectKey and syncId are required");
            return;
        }

        executor.execute(() -> {
            try {
                File received = fetchArchiveFromHost(host, port, code, fingerprint, projectKey, syncId);
                JSObject result = archiveResult(received);
                call.resolve(result);
            } catch (Exception error) {
                call.reject(readableMessage(error), error);
            }
        });
    }

    private void acceptClient(ServerSocket activeServer) {
        try {
            while (!activeServer.isClosed()) {
                Socket socket = null;
                try {
                    socket = activeServer.accept();
                    if (!connectionGuard.tryAcquire()) {
                        closeSocket(socket);
                        continue;
                    }
                    activeClientSockets.add(socket);
                    Socket acceptedSocket = socket;
                    executor.execute(() -> handleAcceptedClient(activeServer, acceptedSocket));
                    socket = null;
                } catch (SocketException error) {
                    if (!activeServer.isClosed()) notifySyncError(error);
                } catch (Exception error) {
                    if (!activeServer.isClosed()) notifySyncError(error);
                } finally {
                    closeSocket(socket);
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

    private void handleAcceptedClient(ServerSocket activeServer, Socket socket) {
        boolean shouldStop = false;
        try {
            socket.setSoTimeout(HANDSHAKE_TIMEOUT_MS);
            if (!(socket instanceof SSLSocket)) {
                throw new Exception("Local sync requires TLS");
            }
            enableModernTls((SSLSocket) socket);
            ((SSLSocket) socket).startHandshake();
            synchronized (sessionLock) {
                if (serverSocket != activeServer) return;
            }
            shouldStop = handleClient(socket);
        } catch (Exception error) {
            // Authentication failures are counted explicitly where the code is
            // checked. A transfer timeout or a broken field Wi-Fi connection
            // must not consume the authentication-attempt budget.
            if (!activeServer.isClosed()) notifySyncError(error);
        } finally {
            closeSocket(socket);
            activeClientSockets.remove(socket);
            connectionGuard.release();
            if (shouldStop) {
                synchronized (sessionLock) {
                    if (serverSocket == activeServer) stopHostInternal();
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
            if (IMPORT_MAGIC.equals(magic)) {
                return handleImportClient(input, output);
            }
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
            if (!SyncSecurity.secretsEqual(expectedCode, code)) {
                boolean shouldStop = registerFailedAuthAttempt();
                rejectPeer(output, "Неверный код подключения");
                return shouldStop;
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

            if (!claimExchangeSession(outgoing)) {
                rejectPeer(output, "Сеанс синхронизации уже используется другим устройством");
                return false;
            }

            boolean completed = false;
            try {
                socket.setSoTimeout(TRANSFER_TIMEOUT_MS);
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
                completed = true;
                return true;
            } finally {
                if (!completed) releaseExchangeSession(outgoing);
            }
        } finally {
            if (received != null) received.delete();
        }
    }

    private boolean handleImportClient(DataInputStream input, DataOutputStream output) throws Exception {
        String code = input.readUTF();
        String projectKey = normalizeProjectKey(input.readUTF());
        String syncId = normalizeSyncId(input.readUTF());

        String expectedCode = sessionCode;
        String expectedProjectKey = hostedProjectKey;
        String expectedSyncId = hostedSyncId;
        File outgoing = hostedArchive;
        if (expectedCode == null || expectedProjectKey == null || expectedSyncId == null || outgoing == null) {
            rejectPeer(output, "Сеанс синхронизации уже остановлен");
            return false;
        }
        if (!SyncSecurity.secretsEqual(expectedCode, code)) {
            boolean shouldStop = registerFailedAuthAttempt();
            rejectPeer(output, "Неверный код подключения");
            return shouldStop;
        }
        if (!expectedSyncId.equals(syncId) || !expectedProjectKey.equals(projectKey)) {
            rejectPeer(output, "QR-код содержит данные другого сеанса");
            return false;
        }

        output.writeUTF("OK");
        output.writeLong(outgoing.length());
        output.writeUTF(sha256(outgoing));
        sendFile(output, outgoing);
        output.flush();
        return false;
    }

    private File exchangeArchives(
        String host,
        int port,
        String code,
        String fingerprint,
        String projectKey,
        String syncId,
        File outgoing
    ) throws Exception {
        File received = null;
        try (Socket socket = connectPinnedTls(host, port, fingerprint)) {

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

    private File fetchArchiveFromHost(
        String host,
        int port,
        String code,
        String fingerprint,
        String projectKey,
        String syncId
    ) throws Exception {
        File received = null;
        try (Socket socket = connectPinnedTls(host, port, fingerprint)) {

            try (
                DataInputStream input = new DataInputStream(new BufferedInputStream(socket.getInputStream()));
                DataOutputStream output = new DataOutputStream(new BufferedOutputStream(socket.getOutputStream()))
            ) {
                output.writeUTF(IMPORT_MAGIC);
                output.writeUTF(code);
                output.writeUTF(projectKey);
                output.writeUTF(syncId);
                output.flush();

                String status = input.readUTF();
                if (!"OK".equals(status)) {
                    throw new Exception(input.readUTF());
                }

                long incomingSize = input.readLong();
                assertArchiveSize(incomingSize);
                String expectedHash = input.readUTF();
                received = createTempArchive("local-sync-import");
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

    private TlsHostContext createTlsHostContext() throws Exception {
        deleteStaleTlsKeys();
        String keyAlias = TLS_KEY_ALIAS_PREFIX + UUID.randomUUID();
        long now = System.currentTimeMillis();
        KeyPairGenerator generator = KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_EC,
            "AndroidKeyStore"
        );
        generator.initialize(
            new KeyGenParameterSpec.Builder(
                keyAlias,
                KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY
            )
                .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                .setDigests(
                    KeyProperties.DIGEST_NONE,
                    KeyProperties.DIGEST_SHA256,
                    KeyProperties.DIGEST_SHA384,
                    KeyProperties.DIGEST_SHA512
                )
                .setCertificateSubject(new X500Principal("CN=Leak Tracker Local Sync"))
                .setCertificateSerialNumber(new BigInteger(64, RANDOM))
                .setCertificateNotBefore(new Date(now - TimeUnit.MINUTES.toMillis(1)))
                .setCertificateNotAfter(new Date(now + TimeUnit.DAYS.toMillis(1)))
                .build()
        );
        generator.generateKeyPair();

        try {
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            X509Certificate certificate = (X509Certificate) keyStore.getCertificate(keyAlias);
            if (certificate == null) throw new Exception("Could not create TLS certificate");

            KeyManagerFactory keyManagerFactory = KeyManagerFactory.getInstance(
                KeyManagerFactory.getDefaultAlgorithm()
            );
            keyManagerFactory.init(keyStore, null);
            SSLContext context = SSLContext.getInstance("TLS");
            context.init(keyManagerFactory.getKeyManagers(), null, RANDOM);
            return new TlsHostContext(context, keyAlias, sha256(certificate.getEncoded()));
        } catch (Exception error) {
            deleteTlsKey(keyAlias);
            throw error;
        }
    }

    private Socket connectPinnedTls(String host, int port, String fingerprint) throws Exception {
        final byte[] expectedFingerprint = hexToBytes(fingerprint);
        X509TrustManager trustManager = new X509TrustManager() {
            @Override
            public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
                throw new CertificateException("Client certificates are not supported");
            }

            @Override
            public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
                if (chain == null || chain.length == 0) {
                    throw new CertificateException("TLS certificate is missing");
                }
                try {
                    byte[] actual = MessageDigest.getInstance("SHA-256").digest(chain[0].getEncoded());
                    byte[] actualPrefix = Arrays.copyOf(actual, expectedFingerprint.length);
                    if (!MessageDigest.isEqual(expectedFingerprint, actualPrefix)) {
                        throw new CertificateException("Ключ безопасности хоста не совпадает");
                    }
                } catch (CertificateException error) {
                    throw error;
                } catch (Exception error) {
                    throw new CertificateException("Could not verify TLS certificate", error);
                }
            }

            @Override
            public X509Certificate[] getAcceptedIssuers() {
                return new X509Certificate[0];
            }
        };

        SSLContext context = SSLContext.getInstance("TLS");
        context.init(null, new TrustManager[] { trustManager }, RANDOM);
        SSLSocket socket = (SSLSocket) context.getSocketFactory().createSocket();
        try {
            enableModernTls(socket);
            socket.connect(new InetSocketAddress(host, port), CONNECT_TIMEOUT_MS);
            socket.setSoTimeout(HANDSHAKE_TIMEOUT_MS);
            socket.startHandshake();
            socket.setSoTimeout(TRANSFER_TIMEOUT_MS);
            return socket;
        } catch (Exception error) {
            closeSocket(socket);
            throw error;
        }
    }

    private void enableModernTls(SSLServerSocket socket) throws Exception {
        socket.setEnabledProtocols(modernTlsProtocols(socket.getSupportedProtocols()));
    }

    private void enableModernTls(SSLSocket socket) throws Exception {
        socket.setEnabledProtocols(modernTlsProtocols(socket.getSupportedProtocols()));
    }

    private String[] modernTlsProtocols(String[] supportedProtocols) throws Exception {
        ArrayList<String> enabled = new ArrayList<>();
        for (String protocol : supportedProtocols) {
            if ("TLSv1.3".equals(protocol) || "TLSv1.2".equals(protocol)) {
                enabled.add(protocol);
            }
        }
        if (enabled.isEmpty()) {
            throw new Exception("This Android version does not support TLS 1.2");
        }
        return enabled.toArray(new String[0]);
    }

    private String normalizeFingerprint(String value) {
        return value == null ? "" : value.replaceAll("[^0-9A-Fa-f]", "").toUpperCase(Locale.ROOT);
    }

    private boolean isValidFingerprint(String value) {
        return value.length() == 64;
    }

    private byte[] hexToBytes(String value) throws Exception {
        if (!isValidFingerprint(value)) throw new Exception("Invalid TLS certificate fingerprint");
        byte[] result = new byte[value.length() / 2];
        for (int index = 0; index < value.length(); index += 2) {
            result[index / 2] = (byte) Integer.parseInt(value.substring(index, index + 2), 16);
        }
        return result;
    }

    private String sha256(byte[] value) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(value);
        StringBuilder result = new StringBuilder(hash.length * 2);
        for (byte item : hash) result.append(String.format(Locale.US, "%02X", item & 0xff));
        return result.toString();
    }

    private void deleteTlsKey(String keyAlias) {
        if (keyAlias == null || keyAlias.isEmpty()) return;
        try {
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            keyStore.deleteEntry(keyAlias);
        } catch (Exception ignored) {}
    }

    private void deleteStaleTlsKeys() {
        String activeKeyAlias = hostKeyAlias;
        try {
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            for (String alias : Collections.list(keyStore.aliases())) {
                if (
                    alias.startsWith(TLS_KEY_ALIAS_PREFIX) &&
                    !alias.equals(activeKeyAlias)
                ) {
                    keyStore.deleteEntry(alias);
                }
            }
        } catch (Exception ignored) {
            // Stale keys are harmless and must not prevent a new sync session.
        }
    }

    private static final class TlsHostContext {
        private final SSLContext context;
        private final String keyAlias;
        private final String fingerprint;

        private TlsHostContext(SSLContext context, String keyAlias, String fingerprint) {
            this.context = context;
            this.keyAlias = keyAlias;
            this.fingerprint = fingerprint;
        }
    }

    private void rejectPeer(DataOutputStream output, String message) throws Exception {
        output.writeUTF("ERROR");
        output.writeUTF(message);
        output.flush();
    }

    private boolean registerFailedAuthAttempt() {
        synchronized (sessionLock) {
            return connectionGuard.registerFailure();
        }
    }

    private boolean claimExchangeSession(File outgoing) {
        synchronized (sessionLock) {
            return hostedArchive == outgoing && exchangeClaim.tryClaim(outgoing);
        }
    }

    private void releaseExchangeSession(File outgoing) {
        exchangeClaim.release(outgoing);
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
            throw new Exception("Архив синхронизации больше 1 ГБ");
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
        return LocalSyncErrorMessages.readable(error);
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
            for (Socket client : activeClientSockets) closeSocket(client);
            activeClientSockets.clear();
            File archive = hostedArchive;
            hostedArchive = null;
            if (archive != null) archive.delete();
            hostedProjectKey = null;
            hostedSyncId = null;
            sessionCode = null;
            exchangeClaim.reset();
            String keyAlias = hostKeyAlias;
            hostKeyAlias = null;
            hostCertificateFingerprint = null;
            deleteTlsKey(keyAlias);
            connectionGuard.resetFailures();
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
