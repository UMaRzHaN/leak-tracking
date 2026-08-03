package com.leak.tracking;

import android.annotation.SuppressLint;
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
import java.net.SocketTimeoutException;
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
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
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
    private static final String MAGIC = "LEAK_TRACKER_SYNC_V4";
    private static final String IMPORT_MAGIC = "LEAK_TRACKER_SYNC_IMPORT_V4";
    // Keep this aligned with IMPORT_LIMITS.maxFileBytes in the WebView. The
    // received archive is exposed to JavaScript after transfer, so accepting a
    // larger native file would only defer rejection until after materialization.
    private static final long MAX_ARCHIVE_BYTES = 256L * 1024L * 1024L;
    // A full exchange temporarily needs both the outgoing and incoming archive.
    // Keep one explicit process-wide quota across prepared, hosted, active and
    // delivered sync files instead of applying independent per-map limits.
    private static final long MAX_TEMP_ARCHIVE_BYTES = MAX_ARCHIVE_BYTES * 2L;
    private static final int MAX_ARCHIVE_CHUNK_BYTES = 1024 * 1024;
    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int HANDSHAKE_TIMEOUT_MS = 10_000;
    private static final long CLIENT_TLS_DEADLINE_MS =
        (long) CONNECT_TIMEOUT_MS + HANDSHAKE_TIMEOUT_MS;
    private static final int PRE_AUTH_TIMEOUT_MS = 4_000;
    private static final long MAX_PRE_AUTH_DURATION_MS = 10_000L;
    private static final int TRANSFER_TIMEOUT_MS = 120_000;
    private static final long MAX_PROTOCOL_DURATION_MS = TimeUnit.MINUTES.toMillis(15);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int MAX_FAILED_AUTH_ATTEMPTS = 5;
    private static final int MAX_CONCURRENT_HANDSHAKES = 4;
    private static final String TLS_KEY_ALIAS_PREFIX = "local-sync-";
    private static final long DEFAULT_SESSION_DURATION_MS = TimeUnit.MINUTES.toMillis(3);
    private static final long MIN_SESSION_DURATION_MS = TimeUnit.MINUTES.toMillis(1);
    private static final long MAX_SESSION_DURATION_MS = TimeUnit.MINUTES.toMillis(5);
    private static final long PEER_APPROVAL_TIMEOUT_MS = TimeUnit.SECONDS.toMillis(30);
    private static final int MAX_PREPARED_ARCHIVES = 3;
    private static final int MAX_DELIVERED_ARCHIVES = 3;
    private static final int MAX_OUTBOUND_TRANSFERS = 2;
    private static final long PREPARED_ARCHIVE_TTL_MS = TimeUnit.MINUTES.toMillis(15);
    private static final long DELIVERED_ARCHIVE_TTL_MS = TimeUnit.MINUTES.toMillis(10);

    private final ThreadPoolExecutor executor = createWorkerExecutor();
    private final ThreadPoolExecutor acceptExecutor = createAcceptExecutor();
    private final ScheduledThreadPoolExecutor cleanupExecutor = createCleanupExecutor();
    private final ConcurrentHashMap<String, File> preparedArchives = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, File> deliveredArchives = new ConcurrentHashMap<>();
    private final Set<File> activeArchives = ConcurrentHashMap.newKeySet();
    private final ConcurrentHashMap<String, PendingApproval> pendingApprovals = new ConcurrentHashMap<>();
    private final Object sessionLock = new Object();
    private final Object archiveLock = new Object();
    private long reservedArchiveBytes;
    private final Semaphore outboundTransfers = new Semaphore(MAX_OUTBOUND_TRANSFERS, true);
    private final SyncConnectionGuard connectionGuard = new SyncConnectionGuard(MAX_CONCURRENT_HANDSHAKES, MAX_FAILED_AUTH_ATTEMPTS);
    private final Set<Socket> activeClientSockets = ConcurrentHashMap.newKeySet();
    private volatile ServerSocket serverSocket;
    private volatile File hostedArchive;
    private volatile String hostedProjectKey;
    private volatile String hostedSyncId;
    private volatile String sessionCode;
    private volatile String hostKeyAlias;
    private volatile String hostCertificateFingerprint;
    private volatile String hostSessionId;
    private volatile long hostSessionExpiresAt;
    private volatile boolean hostAllowsMultipleImports;
    private volatile int hostCompletedTransfers;
    private volatile ScheduledFuture<?> hostExpiryTask;
    private final SyncSessionClaim exchangeClaim = new SyncSessionClaim();


    @Override
    public void load() {
        cleanupOrphanedArchiveFiles();
        cleanupExecutor.scheduleAtFixedRate(
            this::cleanupExpiredArchiveSessions,
            1,
            1,
            TimeUnit.MINUTES
        );
    }

    @PluginMethod
    public void prepareArchive(PluginCall call) {
        try {
            String token;
            synchronized (archiveLock) {
                cleanupExpiredArchiveSessionsLocked();
                if (
                    !TempFilePolicy.hasSessionCapacity(
                        preparedArchives.size(),
                        MAX_PREPARED_ARCHIVES
                    )
                ) {
                    throw new Exception("Too many prepared sync archives are active");
                }
                if (
                    wouldExceedTemporaryArchiveQuotaLocked(1L)
                ) {
                    throw new Exception("Temporary sync archive quota is exhausted");
                }
                token = UUID.randomUUID().toString();
                File archive = createTempArchive("local-sync-outgoing");
                TempFilePolicy.touch(archive, System.currentTimeMillis());
                preparedArchives.put(token, archive);
            }
            JSObject result = new JSObject();
            result.put("token", token);
            result.put("maxArchiveBytes", MAX_ARCHIVE_BYTES);
            result.put("maxTemporaryArchiveBytes", MAX_TEMP_ARCHIVE_BYTES);
            result.put("maxPreparedArchives", MAX_PREPARED_ARCHIVES);
            result.put("preparedArchiveTtlMs", PREPARED_ARCHIVE_TTL_MS);
            call.resolve(result);
        } catch (Exception error) {
            call.reject(readableMessage(error), LocalSyncException.codeOf(error), error);
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
        if (
            chunkBase64.length() >
            ((MAX_ARCHIVE_CHUNK_BYTES + 2L) / 3L) * 4L + 4L
        ) {
            discardPreparedArchive(token);
            call.reject("Archive chunk is too large");
            return;
        }

        try {
            byte[] chunk = Base64.decode(chunkBase64, Base64.DEFAULT);
            long size;
            synchronized (archiveLock) {
                if (
                    TempFilePolicy.isExpired(
                        archive,
                        System.currentTimeMillis(),
                        PREPARED_ARCHIVE_TTL_MS
                    )
                ) {
                    throw new LocalSyncException(LocalSyncFailure.SESSION_EXPIRED, "Archive token has expired");
                }
                if (chunk.length > MAX_ARCHIVE_CHUNK_BYTES) {
                    throw new Exception("Archive chunk is too large");
                }
                if (
                    TempFilePolicy.wouldExceedFile(
                        archive,
                        chunk.length,
                        MAX_ARCHIVE_BYTES
                    ) ||
                    wouldExceedTemporaryArchiveQuotaLocked(chunk.length)
                ) {
                    throw new Exception("Archive exceeds the safety limit");
                }
                try (FileOutputStream stream = new FileOutputStream(archive, true)) {
                    stream.write(chunk);
                }
                TempFilePolicy.touch(archive, System.currentTimeMillis());
                size = archive.length();
            }
            JSObject result = new JSObject();
            result.put("size", size);
            call.resolve(result);
        } catch (Exception error) {
            discardPreparedArchive(token);
            call.reject(readableMessage(error), LocalSyncException.codeOf(error), error);
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
        boolean allowMultipleImports = Boolean.TRUE.equals(
            call.getBoolean("allowMultipleImports", false)
        );
        Long requestedDuration = call.getLong("sessionDurationMs");
        long sessionDurationMs = clampSessionDuration(requestedDuration);
        File preparedArchive;
        synchronized (archiveLock) {
            cleanupExpiredArchiveSessionsLocked();
            preparedArchive = preparedArchives.remove(archiveToken);
            if (preparedArchive != null) activeArchives.add(preparedArchive);
        }
        if (
            preparedArchive == null ||
            TempFilePolicy.isExpired(
                preparedArchive,
                System.currentTimeMillis(),
                PREPARED_ARCHIVE_TTL_MS
            ) ||
            projectKey.isEmpty() ||
            syncId.isEmpty()
        ) {
            if (preparedArchive != null) {
                synchronized (archiveLock) {
                    activeArchives.remove(preparedArchive);
                }
                preparedArchive.delete();
            }
            call.reject("archiveToken, projectKey and syncId are required");
            return;
        }

        try {
            assertArchiveSize(preparedArchive.length());
            TempFilePolicy.touch(preparedArchive, System.currentTimeMillis());
            TlsHostContext tlsHost = createTlsHostContext();

            synchronized (sessionLock) {
                stopHostInternal();
                hostedArchive = preparedArchive;
                hostedProjectKey = projectKey;
                hostedSyncId = syncId;
                sessionCode = String.format(Locale.US, "%06d", RANDOM.nextInt(1_000_000));
                hostSessionId = UUID.randomUUID().toString();
                hostSessionExpiresAt = System.currentTimeMillis() + sessionDurationMs;
                hostAllowsMultipleImports = allowMultipleImports;
                hostCompletedTransfers = 0;
                connectionGuard.resetFailures();
                hostKeyAlias = tlsHost.keyAlias;
                hostCertificateFingerprint = tlsHost.fingerprint;
                SSLServerSocket tlsServerSocket = (SSLServerSocket) tlsHost.context
                    .getServerSocketFactory()
                    .createServerSocket(0);
                enableModernTls(tlsServerSocket);
                serverSocket = tlsServerSocket;
                serverSocket.setReuseAddress(true);
                scheduleHostExpiry(tlsServerSocket, hostSessionId, sessionDurationMs);
            }
            synchronized (archiveLock) {
                activeArchives.remove(preparedArchive);
            }

            ServerSocket activeServer = serverSocket;
            try {
                acceptExecutor.execute(() -> acceptClient(activeServer));
            } catch (RejectedExecutionException error) {
                stopHostInternal();
                throw new Exception("Local sync service is busy", error);
            }

            JSObject result = new JSObject();
            result.put("host", findLocalIpv4Address());
            result.put("port", activeServer.getLocalPort());
            result.put("code", sessionCode);
            result.put("fingerprint", hostCertificateFingerprint);
            result.put("securityKey", hostCertificateFingerprint.substring(0, 16));
            result.put("maxArchiveBytes", MAX_ARCHIVE_BYTES);
            result.put("maxTemporaryArchiveBytes", MAX_TEMP_ARCHIVE_BYTES);
            result.put("sessionId", hostSessionId);
            result.put("expiresAt", hostSessionExpiresAt);
            result.put("allowMultipleImports", hostAllowsMultipleImports);
            result.put("transferCount", hostCompletedTransfers);
            call.resolve(result);
        } catch (Exception error) {
            synchronized (archiveLock) {
                activeArchives.remove(preparedArchive);
            }
            preparedArchive.delete();
            stopHostInternal();
            call.reject(readableMessage(error), LocalSyncException.codeOf(error), error);
        }
    }

    @PluginMethod
    public void stopHost(PluginCall call) {
        stopHostInternal();
        call.resolve();
    }

    @PluginMethod
    public void resolvePeerApproval(PluginCall call) {
        String requestId = call.getString("requestId", "");
        boolean approved = Boolean.TRUE.equals(call.getBoolean("approved", false));
        PendingApproval approval = pendingApprovals.remove(requestId);
        if (approval == null) {
            call.reject("Unknown or expired approval request");
            return;
        }
        approval.resolve(approved);
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
        String sessionId = normalizeSessionId(call.getString("sessionId"));
        String archiveToken = call.getString("archiveToken", "");
        File outgoing;
        synchronized (archiveLock) {
            cleanupExpiredArchiveSessionsLocked();
            outgoing = preparedArchives.remove(archiveToken);
            if (outgoing != null) activeArchives.add(outgoing);
        }

        if (
            host.isEmpty() ||
            port == null ||
            code.isEmpty() ||
            !isValidFingerprint(fingerprint) ||
            projectKey.isEmpty() ||
            syncId.isEmpty() ||
            sessionId.isEmpty() ||
            outgoing == null ||
            TempFilePolicy.isExpired(
                outgoing,
                System.currentTimeMillis(),
                PREPARED_ARCHIVE_TTL_MS
            )
        ) {
            if (outgoing != null) {
                synchronized (archiveLock) {
                    activeArchives.remove(outgoing);
                }
                outgoing.delete();
            }
            call.reject("host, port, code, fingerprint, projectKey, syncId, sessionId and archiveToken are required");
            return;
        }

        if (!outboundTransfers.tryAcquire()) {
            synchronized (archiveLock) {
                activeArchives.remove(outgoing);
            }
            outgoing.delete();
            call.reject("Too many outgoing sync operations are active");
            return;
        }
        TempFilePolicy.touch(outgoing, System.currentTimeMillis());
        try {
            executor.execute(() -> {
                try {
                    assertArchiveSize(outgoing.length());
                    File received = exchangeArchives(host, port, code, fingerprint, projectKey, syncId, sessionId, outgoing);
                    JSObject result = archiveResult(received);
                    call.resolve(result);
                } catch (Exception error) {
                    call.reject(readableMessage(error), LocalSyncException.codeOf(error), error);
                } finally {
                    synchronized (archiveLock) {
                        activeArchives.remove(outgoing);
                    }
                    outgoing.delete();
                    outboundTransfers.release();
                }
            });
        } catch (RejectedExecutionException error) {
            synchronized (archiveLock) {
                activeArchives.remove(outgoing);
            }
            outgoing.delete();
            outboundTransfers.release();
            call.reject("Local sync service is busy", error);
        }
    }

    @PluginMethod
    public void fetchArchive(PluginCall call) {
        String host = call.getString("host", "").trim();
        Integer port = call.getInt("port");
        String code = call.getString("code", "").trim();
        String fingerprint = normalizeFingerprint(call.getString("fingerprint"));
        String projectKey = normalizeProjectKey(call.getString("projectKey"));
        String syncId = normalizeSyncId(call.getString("syncId"));
        String sessionId = normalizeSessionId(call.getString("sessionId"));

        if (host.isEmpty() || port == null || code.isEmpty() || !isValidFingerprint(fingerprint) || projectKey.isEmpty() || syncId.isEmpty() || sessionId.isEmpty()) {
            call.reject("host, port, code, fingerprint, projectKey, syncId and sessionId are required");
            return;
        }

        if (!outboundTransfers.tryAcquire()) {
            call.reject("Too many outgoing sync operations are active");
            return;
        }
        try {
            executor.execute(() -> {
                try {
                    File received = fetchArchiveFromHost(host, port, code, fingerprint, projectKey, syncId, sessionId);
                    JSObject result = archiveResult(received);
                    call.resolve(result);
                } catch (Exception error) {
                    call.reject(readableMessage(error), LocalSyncException.codeOf(error), error);
                } finally {
                    outboundTransfers.release();
                }
            });
        } catch (RejectedExecutionException error) {
            outboundTransfers.release();
            call.reject("Local sync service is busy", error);
        }
    }

    private void acceptClient(ServerSocket activeServer) {
        try {
            while (!activeServer.isClosed()) {
                Socket socket = null;
                try {
                    socket = activeServer.accept();
                    String peerKey = peerKey(socket);
                    if (!connectionGuard.tryAcquire(peerKey)) {
                        closeSocket(socket);
                        continue;
                    }
                    activeClientSockets.add(socket);
                    Socket acceptedSocket = socket;
                    try {
                        executor.execute(() ->
                            handleAcceptedClient(activeServer, acceptedSocket, peerKey)
                        );
                        socket = null;
                    } catch (RejectedExecutionException error) {
                        activeClientSockets.remove(acceptedSocket);
                        connectionGuard.release(peerKey);
                        closeSocket(acceptedSocket);
                        notifySyncError(new Exception("Local sync service is busy", error));
                    }
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

    private void handleAcceptedClient(
        ServerSocket activeServer,
        Socket socket,
        String peerKey
    ) {
        ClientOutcome outcome = ClientOutcome.CONTINUE;
        SyncConnectionDeadline connectionDeadline = createConnectionDeadline(socket);
        try {
            // SO_TIMEOUT only limits the idle gap between reads. This absolute
            // deadline also bounds a TLS/client slowloris that keeps dribbling
            // bytes often enough to avoid the read timeout.
            connectionDeadline.startPreAuth();
            // Unauthenticated LAN peers get a deliberately short deadline.
            // Once the shared code is verified, handleClient switches to the
            // normal transfer timeout.
            socket.setSoTimeout(PRE_AUTH_TIMEOUT_MS);
            if (!(socket instanceof SSLSocket)) {
                throw new Exception("Local sync requires TLS");
            }
            enableModernTls((SSLSocket) socket);
            ((SSLSocket) socket).startHandshake();
            synchronized (sessionLock) {
                if (serverSocket != activeServer) return;
            }
            outcome = handleClient(socket, peerKey, connectionDeadline);
        } catch (Exception error) {
            // Authentication failures are counted explicitly where the code is
            // checked. A transfer timeout or a broken field Wi-Fi connection
            // must not consume the authentication-attempt budget.
            boolean failedBeforeAuthentication =
                connectionGuard.registerPreAuthFailure(peerKey);
            // Random probes and stalled TLS clients are expected on a LAN. Do
            // not surface them as a fatal sync-session error in the WebView.
            if (!activeServer.isClosed() && !failedBeforeAuthentication) {
                notifySyncError(error);
            }
        } finally {
            connectionDeadline.cancel();
            closeSocket(socket);
            activeClientSockets.remove(socket);
            connectionGuard.release(peerKey);
            // Query the guard again in case writing the ERROR response failed
            // after the final bad-code attempt. In that case handleClient
            // cannot return its shouldStop flag, but the session must still
            // close after the configured authentication budget.
            boolean stopped = false;
            if (outcome.shouldStop || connectionGuard.isFailureLimitReached()) {
                synchronized (sessionLock) {
                    if (serverSocket == activeServer) {
                        stopHostInternal();
                        stopped = true;
                    }
                }
            }
            if (stopped && outcome.endReason != null) {
                notifyHostSessionEnded(outcome.endReason, outcome.transferCount);
            }
        }
    }
    private ClientOutcome handleClient(
        Socket socket,
        String peerKey,
        SyncConnectionDeadline connectionDeadline
    ) throws Exception {
        File received = null;
        try (
            DataInputStream input = new DataInputStream(new BufferedInputStream(socket.getInputStream()));
            DataOutputStream output = new DataOutputStream(new BufferedOutputStream(socket.getOutputStream()))
        ) {
            String magic = input.readUTF();
            if (IMPORT_MAGIC.equals(magic)) {
                return handleImportClient(
                    socket,
                    input,
                    output,
                    peerKey,
                    connectionDeadline
                );
            }
            if (!MAGIC.equals(magic)) {
                connectionGuard.registerPreAuthFailure(peerKey);
                rejectPeer(output, LocalSyncFailure.INCOMPATIBLE_VERSION, "Несовместимая версия приложения на втором телефоне");
                return ClientOutcome.CONTINUE;
            }
            String code = input.readUTF();

            String expectedCode = sessionCode;
            String expectedProjectKey = hostedProjectKey;
            String expectedSyncId = hostedSyncId;
            String expectedSessionId = hostSessionId;
            File outgoing = hostedArchive;
            if (isHostSessionExpired()) {
                rejectPeer(output, LocalSyncFailure.SESSION_EXPIRED, "Срок действия QR-кода истёк");
                return ClientOutcome.CONTINUE;
            }
            if (expectedCode == null || expectedProjectKey == null || expectedSyncId == null || expectedSessionId == null || outgoing == null) {
                rejectPeer(output, LocalSyncFailure.SESSION_STOPPED, "Сеанс синхронизации уже остановлен");
                return ClientOutcome.CONTINUE;
            }
            if (!SyncSecurity.secretsEqual(expectedCode, code)) {
                boolean shouldStop = registerFailedAuthAttempt();
                connectionGuard.registerPreAuthFailure(peerKey);
                rejectPeer(output, LocalSyncFailure.INVALID_CODE, "Неверный код подключения");
                return shouldStop ? ClientOutcome.STOP : ClientOutcome.CONTINUE;
            }
            connectionDeadline.markAuthenticated();
            connectionGuard.markAuthenticated(peerKey);
            socket.setSoTimeout(TRANSFER_TIMEOUT_MS);

            String projectKey = normalizeProjectKey(input.readUTF());
            String syncId = normalizeSyncId(input.readUTF());
            String sessionId = normalizeSessionId(input.readUTF());
            long archiveSize = input.readLong();
            String expectedHash = input.readUTF();
            if (!expectedSyncId.equals(syncId)) {
                rejectPeer(output, LocalSyncFailure.DIFFERENT_ORIGIN, "Проекты имеют разное происхождение и не могут быть объединены");
                return ClientOutcome.CONTINUE;
            }
            if (!expectedSessionId.equals(sessionId)) {
                rejectPeer(output, LocalSyncFailure.WRONG_SESSION, "QR-код относится к завершённому сеансу");
                return ClientOutcome.CONTINUE;
            }
            try {
                assertArchiveSize(archiveSize);
            } catch (Exception error) {
                rejectPeer(output, LocalSyncException.codeOf(error), readableMessage(error));
                return ClientOutcome.CONTINUE;
            }

            if (!claimExchangeSession(outgoing)) {
                rejectPeer(output, LocalSyncFailure.SESSION_BUSY, "Сеанс синхронизации уже используется другим устройством");
                return ClientOutcome.CONTINUE;
            }

            boolean completed = false;
            try {
                if (!requestPeerApproval("sync", peerKey, expectedSessionId)) {
                    rejectPeer(output, LocalSyncFailure.NOT_CONFIRMED, "Передача не подтверждена на первом устройстве");
                    return ClientOutcome.CONTINUE;
                }
                try {
                    reserveTemporaryArchiveBytes(archiveSize);
                } catch (Exception error) {
                    rejectPeer(output, LocalSyncException.codeOf(error), readableMessage(error));
                    return ClientOutcome.CONTINUE;
                }
                boolean reservationPending = true;
                socket.setSoTimeout(TRANSFER_TIMEOUT_MS);
                try {
                    output.writeUTF("READY");
                    output.flush();
                    reservationPending = false;
                    received = receiveReservedTemporaryArchive(
                        input,
                        "local-sync-incoming",
                        archiveSize
                    );
                } finally {
                    if (reservationPending) releaseTemporaryArchiveBytes(archiveSize);
                }
                if (!expectedHash.equals(sha256(received))) {
                    discardActiveArchive(received);
                    received = null;
                    rejectPeer(output, LocalSyncFailure.ARCHIVE_CORRUPT, "Архив повреждён при передаче");
                    return ClientOutcome.CONTINUE;
                }

                output.writeUTF("OK");
                output.writeLong(outgoing.length());
                output.writeUTF(sha256(outgoing));
                sendFile(output, outgoing);
                output.flush();

                recordCompletedTransfer("sync");
                notifyListeners("archiveReceived", archiveResult(received));
                received = null;
                completed = true;
                return ClientOutcome.STOP;
            } finally {
                if (!completed) releaseExchangeSession(outgoing);
            }
        } finally {
            if (received != null) discardActiveArchive(received);
        }
    }

    private ClientOutcome handleImportClient(
        Socket socket,
        DataInputStream input,
        DataOutputStream output,
        String peerKey,
        SyncConnectionDeadline connectionDeadline
    ) throws Exception {
        String code = input.readUTF();

        String expectedCode = sessionCode;
        String expectedProjectKey = hostedProjectKey;
        String expectedSyncId = hostedSyncId;
        String expectedSessionId = hostSessionId;
        File outgoing = hostedArchive;
        if (isHostSessionExpired()) {
            rejectPeer(output, LocalSyncFailure.SESSION_EXPIRED, "Срок действия QR-кода истёк");
            return ClientOutcome.CONTINUE;
        }
        if (expectedCode == null || expectedProjectKey == null || expectedSyncId == null || expectedSessionId == null || outgoing == null) {
            rejectPeer(output, LocalSyncFailure.SESSION_STOPPED, "Сеанс синхронизации уже остановлен");
            return ClientOutcome.CONTINUE;
        }
        if (!SyncSecurity.secretsEqual(expectedCode, code)) {
            boolean shouldStop = registerFailedAuthAttempt();
            connectionGuard.registerPreAuthFailure(peerKey);
            rejectPeer(output, LocalSyncFailure.INVALID_CODE, "Неверный код подключения");
            return shouldStop ? ClientOutcome.STOP : ClientOutcome.CONTINUE;
        }
        connectionDeadline.markAuthenticated();
        connectionGuard.markAuthenticated(peerKey);
        socket.setSoTimeout(TRANSFER_TIMEOUT_MS);

        String projectKey = normalizeProjectKey(input.readUTF());
        String syncId = normalizeSyncId(input.readUTF());
        String sessionId = normalizeSessionId(input.readUTF());
        if (!expectedSyncId.equals(syncId) || !expectedProjectKey.equals(projectKey)) {
            rejectPeer(output, LocalSyncFailure.WRONG_SESSION, "QR-код содержит данные другого сеанса");
            return ClientOutcome.CONTINUE;
        }
        if (!expectedSessionId.equals(sessionId)) {
            rejectPeer(output, LocalSyncFailure.WRONG_SESSION, "QR-код относится к завершённому сеансу");
            return ClientOutcome.CONTINUE;
        }
        if (!claimExchangeSession(outgoing)) {
            rejectPeer(output, LocalSyncFailure.TRANSFER_BUSY, "Сеанс передачи уже используется другим устройством");
            return ClientOutcome.CONTINUE;
        }
        boolean completed = false;
        try {
            if (!requestPeerApproval("import", peerKey, expectedSessionId)) {
                rejectPeer(output, LocalSyncFailure.NOT_CONFIRMED, "Передача не подтверждена на первом устройстве");
                return ClientOutcome.CONTINUE;
            }

            output.writeUTF("OK");
            output.writeLong(outgoing.length());
            output.writeUTF(sha256(outgoing));
            sendFile(output, outgoing);
            output.flush();
            int transferCount = recordCompletedTransfer("import");
            boolean shouldStop = !hostAllowsMultipleImports;
            completed = true;
            return shouldStop
                ? ClientOutcome.completedImport(transferCount)
                : ClientOutcome.CONTINUE;
        } finally {
            if (!completed || hostAllowsMultipleImports) {
                releaseExchangeSession(outgoing);
            }
        }
    }

    private File exchangeArchives(
        String host,
        int port,
        String code,
        String fingerprint,
        String projectKey,
        String syncId,
        String sessionId,
        File outgoing
    ) throws Exception {
        File received = null;
        ScheduledFuture<?> protocolDeadline = null;
        try (Socket socket = connectPinnedTls(host, port, fingerprint)) {
            protocolDeadline = scheduleProtocolDeadline(socket);

            try (
                DataInputStream input = new DataInputStream(new BufferedInputStream(socket.getInputStream()));
                DataOutputStream output = new DataOutputStream(new BufferedOutputStream(socket.getOutputStream()))
            ) {
                output.writeUTF(MAGIC);
                output.writeUTF(code);
                output.writeUTF(projectKey);
                output.writeUTF(syncId);
                output.writeUTF(sessionId);
                output.writeLong(outgoing.length());
                output.writeUTF(sha256(outgoing));
                output.flush();

                String readiness = input.readUTF();
                if (!"READY".equals(readiness)) {
                    // A peer on an older build sends a bare "ERROR"; codeFromStatus
                    // then returns null and only the message is available.
                    throw new LocalSyncException(
                        LocalSyncFailure.codeFromStatus(readiness),
                        input.readUTF()
                    );
                }

                sendFile(output, outgoing);
                output.flush();

                String status = input.readUTF();
                if (!"OK".equals(status)) {
                    // A peer on an older build sends a bare "ERROR"; codeFromStatus
                    // then returns null and only the message is available.
                    throw new LocalSyncException(
                        LocalSyncFailure.codeFromStatus(status),
                        input.readUTF()
                    );
                }

                long incomingSize = input.readLong();
                assertArchiveSize(incomingSize);
                String expectedHash = input.readUTF();
                received = receiveTemporaryArchive(
                    input,
                    "local-sync-response",
                    incomingSize
                );
                if (!expectedHash.equals(sha256(received))) {
                    discardActiveArchive(received);
                    received = null;
                    throw new LocalSyncException(LocalSyncFailure.ARCHIVE_CORRUPT, "Архив повреждён при передаче");
                }
                File result = received;
                received = null;
                return result;
            }
        } finally {
            if (protocolDeadline != null) protocolDeadline.cancel(false);
            if (received != null) discardActiveArchive(received);
        }
    }

    private File fetchArchiveFromHost(
        String host,
        int port,
        String code,
        String fingerprint,
        String projectKey,
        String syncId,
        String sessionId
    ) throws Exception {
        File received = null;
        ScheduledFuture<?> protocolDeadline = null;
        try (Socket socket = connectPinnedTls(host, port, fingerprint)) {
            protocolDeadline = scheduleProtocolDeadline(socket);

            try (
                DataInputStream input = new DataInputStream(new BufferedInputStream(socket.getInputStream()));
                DataOutputStream output = new DataOutputStream(new BufferedOutputStream(socket.getOutputStream()))
            ) {
                output.writeUTF(IMPORT_MAGIC);
                output.writeUTF(code);
                output.writeUTF(projectKey);
                output.writeUTF(syncId);
                output.writeUTF(sessionId);
                output.flush();

                String status = input.readUTF();
                if (!"OK".equals(status)) {
                    // A peer on an older build sends a bare "ERROR"; codeFromStatus
                    // then returns null and only the message is available.
                    throw new LocalSyncException(
                        LocalSyncFailure.codeFromStatus(status),
                        input.readUTF()
                    );
                }

                long incomingSize = input.readLong();
                assertArchiveSize(incomingSize);
                String expectedHash = input.readUTF();
                received = receiveTemporaryArchive(
                    input,
                    "local-sync-import",
                    incomingSize
                );
                if (!expectedHash.equals(sha256(received))) {
                    discardActiveArchive(received);
                    received = null;
                    throw new LocalSyncException(LocalSyncFailure.ARCHIVE_CORRUPT, "Архив повреждён при передаче");
                }
                File result = received;
                received = null;
                return result;
            }
        } finally {
            if (protocolDeadline != null) protocolDeadline.cancel(false);
            if (received != null) discardActiveArchive(received);
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

    // This trust manager intentionally accepts only the certificate fingerprint
    // confirmed out-of-band by the local-sync protocol. It does not disable TLS
    // validation; it replaces CA validation with explicit certificate pinning.
    @SuppressLint("CustomX509TrustManager")
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
        SyncHandshakeDeadline handshakeDeadline = createHandshakeDeadline(socket);
        try {
            // Start before connect(): the deadline covers the complete outbound
            // network setup, not only TLS records after TCP has connected.
            handshakeDeadline.start();
            enableModernTls(socket);
            socket.connect(new InetSocketAddress(host, port), CONNECT_TIMEOUT_MS);
            socket.setSoTimeout(HANDSHAKE_TIMEOUT_MS);
            socket.startHandshake();
            if (!handshakeDeadline.complete()) {
                throw new SocketTimeoutException(
                    "TLS connect and handshake deadline exceeded"
                );
            }
            socket.setSoTimeout(TRANSFER_TIMEOUT_MS);
            return socket;
        } catch (Exception error) {
            boolean deadlineExpired = handshakeDeadline.didExpire();
            handshakeDeadline.cancel();
            closeSocket(socket);
            if (deadlineExpired && !(error instanceof SocketTimeoutException)) {
                SocketTimeoutException timeout = new SocketTimeoutException(
                    "TLS connect and handshake deadline exceeded"
                );
                timeout.initCause(error);
                throw timeout;
            }
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

    private void rejectPeer(DataOutputStream output, String code, String message)
        throws Exception {
        // The status carries the code; the message stays Russian so a peer on
        // an older build, which only checks the status is not "OK", still has
        // something readable to show.
        output.writeUTF(LocalSyncFailure.status(code));
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
                if (read < 0) throw new LocalSyncException(LocalSyncFailure.CONNECTION_INTERRUPTED, "Соединение прервано во время передачи");
                stream.write(buffer, 0, read);
                remaining -= read;
            }
        }
    }

    private File receiveTemporaryArchive(
        DataInputStream input,
        String prefix,
        long expectedBytes
    ) throws Exception {
        reserveTemporaryArchiveBytes(expectedBytes);
        return receiveReservedTemporaryArchive(input, prefix, expectedBytes);
    }

    private File receiveReservedTemporaryArchive(
        DataInputStream input,
        String prefix,
        long expectedBytes
    ) throws Exception {
        File target = null;
        try {
            target = createTempArchive(prefix);
            synchronized (archiveLock) {
                activeArchives.add(target);
            }
            receiveFile(input, target, expectedBytes);
            TempFilePolicy.touch(target, System.currentTimeMillis());
            return target;
        } catch (Exception error) {
            discardActiveArchive(target);
            throw error;
        } finally {
            releaseTemporaryArchiveBytes(expectedBytes);
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

    private void reserveTemporaryArchiveBytes(long bytes) throws Exception {
        synchronized (archiveLock) {
            cleanupExpiredArchiveSessionsLocked();
            cleanupOrphanedArchiveFilesLocked();
            if (wouldExceedTemporaryArchiveQuotaLocked(bytes)) {
                throw new Exception("Temporary sync archive quota is exhausted");
            }
            reservedArchiveBytes += bytes;
        }
    }

    private void releaseTemporaryArchiveBytes(long bytes) {
        synchronized (archiveLock) {
            reservedArchiveBytes = Math.max(0L, reservedArchiveBytes - bytes);
        }
    }

    private void discardActiveArchive(File archive) {
        if (archive == null) return;
        synchronized (archiveLock) {
            activeArchives.remove(archive);
        }
        archive.delete();
    }

    private JSObject archiveResult(File file) throws Exception {
        String token;
        synchronized (archiveLock) {
            cleanupExpiredArchiveSessionsLocked();
            if (deliveredArchives.size() >= MAX_DELIVERED_ARCHIVES) {
                activeArchives.remove(file);
                file.delete();
                throw new Exception("Too many received sync archives are awaiting release");
            }
            if (wouldExceedTemporaryArchiveQuotaLocked(0L)) {
                activeArchives.remove(file);
                file.delete();
                throw new Exception("Temporary sync archive quota is exhausted");
            }
            token = UUID.randomUUID().toString();
            TempFilePolicy.touch(file, System.currentTimeMillis());
            deliveredArchives.put(token, file);
            activeArchives.remove(file);
        }
        cleanupExecutor.schedule(
            () -> discardDeliveredArchive(token),
            DELIVERED_ARCHIVE_TTL_MS,
            TimeUnit.MILLISECONDS
        );
        JSObject result = new JSObject();
        result.put("uri", Uri.fromFile(file).toString());
        result.put("size", file.length());
        result.put("archiveToken", token);
        result.put("maxTemporaryArchiveBytes", MAX_TEMP_ARCHIVE_BYTES);
        return result;
    }

    private void assertArchiveSize(long size) throws Exception {
        if (size <= 0) throw new LocalSyncException(LocalSyncFailure.ARCHIVE_EMPTY, "Архив синхронизации пуст");
        assertArchiveSizeLimit(size);
    }

    private void assertArchiveSizeLimit(long size) throws Exception {
        if (size > MAX_ARCHIVE_BYTES) {
            throw new Exception(
                "Архив синхронизации больше " +
                (MAX_ARCHIVE_BYTES / (1024L * 1024L)) +
                " МБ"
            );
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
        throw new LocalSyncException(LocalSyncFailure.NO_LOCAL_NETWORK, "Подключитесь к Wi-Fi или включите точку доступа");
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

    private String normalizeSessionId(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private long clampSessionDuration(Long requestedDuration) {
        long value = requestedDuration == null
            ? DEFAULT_SESSION_DURATION_MS
            : requestedDuration;
        return Math.max(MIN_SESSION_DURATION_MS, Math.min(MAX_SESSION_DURATION_MS, value));
    }

    private void scheduleHostExpiry(
        ServerSocket expectedServer,
        String expectedSessionId,
        long durationMs
    ) {
        ScheduledFuture<?> previous = hostExpiryTask;
        if (previous != null) previous.cancel(false);
        hostExpiryTask = cleanupExecutor.schedule(
            () -> {
                int transferCount = 0;
                boolean expired = false;
                synchronized (sessionLock) {
                    if (
                        serverSocket == expectedServer &&
                        expectedSessionId.equals(hostSessionId)
                    ) {
                        transferCount = hostCompletedTransfers;
                        stopHostInternal();
                        expired = true;
                    }
                }
                if (expired) notifyHostSessionEnded("expired", transferCount);
            },
            durationMs,
            TimeUnit.MILLISECONDS
        );
    }

    private boolean isHostSessionExpired() {
        long expiresAt = hostSessionExpiresAt;
        return expiresAt <= 0 || System.currentTimeMillis() >= expiresAt;
    }

    private boolean requestPeerApproval(
        String mode,
        String peerAddress,
        String expectedSessionId
    ) throws InterruptedException {
        if (isHostSessionExpired() || !expectedSessionId.equals(hostSessionId)) {
            return false;
        }
        String requestId = UUID.randomUUID().toString();
        PendingApproval approval = new PendingApproval();
        pendingApprovals.put(requestId, approval);

        JSObject payload = new JSObject();
        payload.put("requestId", requestId);
        payload.put("mode", mode);
        payload.put("peerAddress", peerAddress);
        payload.put("sessionId", expectedSessionId);
        payload.put("expiresAt", hostSessionExpiresAt);
        notifyListeners("peerApprovalRequested", payload);

        boolean resolved = approval.await(PEER_APPROVAL_TIMEOUT_MS);
        pendingApprovals.remove(requestId, approval);
        return resolved && approval.isApproved();
    }

    private int recordCompletedTransfer(String mode) {
        int transferCount;
        synchronized (sessionLock) {
            hostCompletedTransfers += 1;
            transferCount = hostCompletedTransfers;
        }
        JSObject payload = new JSObject();
        payload.put("transferCount", transferCount);
        payload.put("mode", mode);
        payload.put("expiresAt", hostSessionExpiresAt);
        payload.put("allowMultipleImports", hostAllowsMultipleImports);
        notifyListeners("hostSessionUpdated", payload);
        return transferCount;
    }

    private void notifyHostSessionEnded(String reason, int transferCount) {
        JSObject payload = new JSObject();
        payload.put("reason", reason);
        payload.put("transferCount", transferCount);
        notifyListeners("hostSessionEnded", payload);
    }

    private String readableMessage(Exception error) {
        return LocalSyncErrorMessages.readable(error);
    }

    private void discardPreparedArchive(String token) {
        File archive;
        synchronized (archiveLock) {
            archive = preparedArchives.remove(token);
        }
        if (archive != null) archive.delete();
    }

    private void discardDeliveredArchive(String token) {
        File archive;
        synchronized (archiveLock) {
            archive = deliveredArchives.remove(token);
        }
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

    private ScheduledFuture<?> scheduleProtocolDeadline(Socket socket) {
        return cleanupExecutor.schedule(
            () -> closeSocket(socket),
            MAX_PROTOCOL_DURATION_MS,
            TimeUnit.MILLISECONDS
        );
    }

    private SyncHandshakeDeadline createHandshakeDeadline(Socket socket) {
        return new SyncHandshakeDeadline(
            (task, delayMillis) -> {
                ScheduledFuture<?> future = cleanupExecutor.schedule(
                    task,
                    delayMillis,
                    TimeUnit.MILLISECONDS
                );
                return () -> future.cancel(false);
            },
            System::nanoTime,
            () -> closeSocket(socket),
            CLIENT_TLS_DEADLINE_MS
        );
    }

    private SyncConnectionDeadline createConnectionDeadline(Socket socket) {
        return new SyncConnectionDeadline(
            (task, delayMillis) -> {
                ScheduledFuture<?> future = cleanupExecutor.schedule(
                    task,
                    delayMillis,
                    TimeUnit.MILLISECONDS
                );
                return () -> future.cancel(false);
            },
            () -> closeSocket(socket),
            MAX_PRE_AUTH_DURATION_MS,
            MAX_PROTOCOL_DURATION_MS
        );
    }

    private static ThreadPoolExecutor createAcceptExecutor() {
        return new ThreadPoolExecutor(
            1,
            1,
            0L,
            TimeUnit.MILLISECONDS,
            new ArrayBlockingQueue<>(1),
            new ThreadPoolExecutor.AbortPolicy()
        );
    }

    private static ThreadPoolExecutor createWorkerExecutor() {
        return new ThreadPoolExecutor(
            4,
            4,
            0L,
            TimeUnit.MILLISECONDS,
            new ArrayBlockingQueue<>(16),
            new ThreadPoolExecutor.AbortPolicy()
        );
    }

    private ArrayList<File> temporaryArchiveFilesOnDisk() {
        ArrayList<File> files = new ArrayList<>();
        File cacheDir = getContext().getCacheDir();
        File[] candidates = cacheDir.listFiles(file ->
            file.isFile() && isTemporaryArchiveName(file.getName())
        );
        if (candidates != null) Collections.addAll(files, candidates);
        return files;
    }

    private boolean isTemporaryArchiveName(String name) {
        if (name == null || !name.endsWith(".zip")) return false;
        return (
            name.startsWith("local-sync-outgoing-") ||
            name.startsWith("local-sync-incoming-") ||
            name.startsWith("local-sync-response-") ||
            name.startsWith("local-sync-import-")
        );
    }

    private boolean wouldExceedTemporaryArchiveQuotaLocked(long additionalBytes) {
        if (additionalBytes < 0L || reservedArchiveBytes < 0L) return true;
        if (Long.MAX_VALUE - reservedArchiveBytes < additionalBytes) return true;
        return TempFilePolicy.wouldExceedAggregate(
            temporaryArchiveFilesOnDisk(),
            reservedArchiveBytes + additionalBytes,
            MAX_TEMP_ARCHIVE_BYTES
        );
    }

    private ArrayList<File> protectedTemporaryArchivesLocked() {
        ArrayList<File> files = new ArrayList<>();
        files.addAll(preparedArchives.values());
        files.addAll(deliveredArchives.values());
        files.addAll(activeArchives);
        File currentHostedArchive = hostedArchive;
        if (currentHostedArchive != null) files.add(currentHostedArchive);
        return files;
    }

    private void cleanupOrphanedArchiveFiles() {
        synchronized (archiveLock) {
            cleanupOrphanedArchiveFilesLocked();
        }
    }

    private void cleanupOrphanedArchiveFilesLocked() {
        long now = System.currentTimeMillis();
        File cacheDir = getContext().getCacheDir();
        ArrayList<File> protectedFiles = protectedTemporaryArchivesLocked();
        for (String prefix : new String[] {
            "local-sync-outgoing-",
            "local-sync-incoming-",
            "local-sync-response-",
            "local-sync-import-",
        }) {
            TempFilePolicy.sweepExpired(
                cacheDir,
                prefix,
                ".zip",
                now,
                PREPARED_ARCHIVE_TTL_MS,
                protectedFiles
            );
        }
    }

    private void cleanupExpiredArchiveSessions() {
        synchronized (archiveLock) {
            cleanupExpiredArchiveSessionsLocked();
            cleanupOrphanedArchiveFilesLocked();
        }
    }

    private void cleanupExpiredArchiveSessionsLocked() {
        cleanupExpiredArchiveMap(preparedArchives, PREPARED_ARCHIVE_TTL_MS);
        cleanupExpiredArchiveMap(deliveredArchives, DELIVERED_ARCHIVE_TTL_MS);
    }

    private void cleanupExpiredArchiveMap(
        ConcurrentHashMap<String, File> archives,
        long ttlMs
    ) {
        long now = System.currentTimeMillis();
        for (java.util.Map.Entry<String, File> entry : archives.entrySet()) {
            File archive = entry.getValue();
            if (
                TempFilePolicy.isExpired(archive, now, ttlMs) &&
                archives.remove(entry.getKey(), archive)
            ) {
                archive.delete();
            }
        }
    }

    private static ScheduledThreadPoolExecutor createCleanupExecutor() {
        ScheduledThreadPoolExecutor executor = new ScheduledThreadPoolExecutor(1);
        // Completed handshakes cancel their pre-auth task. Remove it from the
        // delay queue immediately so high connection churn cannot retain one
        // cancelled task per handshake until its original deadline.
        executor.setRemoveOnCancelPolicy(true);
        return executor;
    }

    private String peerKey(Socket socket) {
        InetAddress address = socket == null ? null : socket.getInetAddress();
        return address == null ? "unknown" : address.getHostAddress();
    }

    private void stopHostInternal() {
        synchronized (sessionLock) {
            ScheduledFuture<?> expiryTask = hostExpiryTask;
            hostExpiryTask = null;
            if (expiryTask != null) expiryTask.cancel(false);
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
            hostSessionId = null;
            hostSessionExpiresAt = 0;
            hostAllowsMultipleImports = false;
            hostCompletedTransfers = 0;
            for (PendingApproval approval : pendingApprovals.values()) {
                approval.resolve(false);
            }
            pendingApprovals.clear();
            exchangeClaim.reset();
            String keyAlias = hostKeyAlias;
            hostKeyAlias = null;
            hostCertificateFingerprint = null;
            deleteTlsKey(keyAlias);
            connectionGuard.resetFailures();
        }
    }

    private static final class ClientOutcome {
        private static final ClientOutcome CONTINUE = new ClientOutcome(false, null, 0);
        private static final ClientOutcome STOP = new ClientOutcome(true, null, 0);

        private final boolean shouldStop;
        private final String endReason;
        private final int transferCount;

        private ClientOutcome(boolean shouldStop, String endReason, int transferCount) {
            this.shouldStop = shouldStop;
            this.endReason = endReason;
            this.transferCount = transferCount;
        }

        private static ClientOutcome completedImport(int transferCount) {
            return new ClientOutcome(true, "completed", transferCount);
        }
    }

    private static final class PendingApproval {
        private final CountDownLatch latch = new CountDownLatch(1);
        private volatile boolean approved;

        private void resolve(boolean value) {
            approved = value;
            latch.countDown();
        }

        private boolean await(long timeoutMs) throws InterruptedException {
            return latch.await(timeoutMs, TimeUnit.MILLISECONDS);
        }

        private boolean isApproved() {
            return approved;
        }
    }

    @Override
    protected void handleOnDestroy() {
        stopHostInternal();
        for (File archive : preparedArchives.values()) archive.delete();
        preparedArchives.clear();
        for (File archive : deliveredArchives.values()) archive.delete();
        deliveredArchives.clear();
        for (File archive : activeArchives) archive.delete();
        activeArchives.clear();
        synchronized (archiveLock) {
            reservedArchiveBytes = 0L;
        }
        acceptExecutor.shutdownNow();
        executor.shutdownNow();
        cleanupExecutor.shutdownNow();
        super.handleOnDestroy();
    }
}
