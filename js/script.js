document.addEventListener('DOMContentLoaded', () => {
    // --- 1. إعداد المتغيرات والعناصر ---
    const preCallControls = document.getElementById('pre-call-controls');
    const inCallControls = document.getElementById('in-call-controls');
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const myIdSpan = document.getElementById('my-id');
    const remoteIdInput = document.getElementById('remote-id-input');
    const callBtn = document.getElementById('call-btn');
    const toggleMuteBtn = document.getElementById('toggle-mute-btn');
    const muteIcon = toggleMuteBtn.querySelector('i');
    const toggleVideoBtn = document.getElementById('toggle-video-btn');
    const videoIcon = toggleVideoBtn.querySelector('i');
    const regenerateIdBtn = document.getElementById('regenerate-id-btn');
    const endCallBtn = document.getElementById('end-call-btn');

    let localStream;
    let peer;
    let currentCall;
    let isMuted = false;
    let isVideoOff = false;
    let connectionTimeout;

    // --- 2. الوظائف الأساسية ---

    /**
     * يعرض رسالة فشل الاتصال على الواجهة.
     */
    function handleConnectionFailure(reason = 'unknown') {
        console.error(`[FAILURE] Connection failed. Reason: ${reason}`);
        if (peer && !peer.destroyed) {
            peer.destroy();
        }
        myIdSpan.textContent = "فشل الاتصال";
        myIdSpan.style.color = "var(--red)";
        clearTimeout(connectionTimeout);
    }

    /**
     * ينشئ كودًا عشوائيًا من 5 أرقام.
     */
    function generateRandomId() {
        return Math.floor(10000 + Math.random() * 90000).toString();
    }

    /**
     * الوظيفة الرئيسية لإعداد اتصال PeerJS.
     * هذه هي الوظيفة التي تحل المشكلة.
     */
    function initializePeer() {
        console.log('[INFO] Initializing Peer connection...');
        
        // إذا كان هناك اتصال قديم، قم بتدميره بالكامل.
        if (peer && !peer.destroyed) {
            console.log('[INFO] Destroying previous peer connection.');
            peer.destroy();
        }
        clearTimeout(connectionTimeout);

        myIdSpan.textContent = 'جارِ التحميل...';
        myIdSpan.style.color = 'white';

        const newPeerId = generateRandomId();

        // **الحل القاطع**: نبدأ المؤقت الزمني فورًا.
        // إذا لم يحدث أي شيء (لا نجاح ولا خطأ) خلال 8 ثوانٍ، نعتبره فشلاً.
        connectionTimeout = setTimeout(() => {
            handleConnectionFailure('timeout');
        }, 8000);

        try {
            peer = new Peer(newPeerId, {
                config: {
                    'iceServers': [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' }
                    ]
                }
            });

            // معالج حدث النجاح
            peer.on('open', (id) => {
                console.log(`[SUCCESS] Peer connection open. ID: ${id}`);
                clearTimeout(connectionTimeout); // ألغِ المؤقت لأن الاتصال نجح
                myIdSpan.textContent = id;
                myIdSpan.style.color = 'var(--green)';
                setupCallListeners(); // الآن فقط نجهز لاستقبال المكالمات
            });

            // معالج حدث الأخطاء
            peer.on('error', (err) => {
                console.error(`[ERROR] PeerJS error:`, err);
                clearTimeout(connectionTimeout); // ألغِ المؤقت لأننا حصلنا على خطأ
                if (err.type === 'unavailable-id') {
                    alert(`الكود ${newPeerId} مستخدم. سيتم إنشاء كود جديد.`);
                    initializePeer(); // حاول مرة أخرى بكود جديد
                } else {
                    handleConnectionFailure(err.type);
                }
            });

        } catch (error) {
            console.error(`[FATAL] Failed to create Peer object:`, error);
            handleConnectionFailure('initialization-failed');
        }
    }

    /**
     * يجهز التطبيق لاستقبال المكالمات.
     */
    function setupCallListeners() {
        if (!peer) return;
        peer.on('call', (call) => {
            console.log(`[INFO] Incoming call from ${call.peer}`);
            
            // التأكد من وجود بث فيديو محلي للرد به
            if (!localStream) {
                console.warn('[WARN] No local stream to answer call with. Ignoring call.');
                return;
            }

            call.answer(localStream);
            setupCall(call);
        });
    }

    /**
     * يتعامل مع كائن المكالمة (سواء كانت صادرة أو واردة).
     */
    function setupCall(call) {
        currentCall = call;
        updateUiForCall(true);

        call.on('stream', (remoteStream) => {
            console.log(`[INFO] Received remote stream from ${call.peer}`);
            remoteVideo.srcObject = remoteStream;
        });

        call.on('close', () => {
            console.log(`[INFO] Call with ${call.peer} has ended.`);
            endCall();
        });

        call.on('error', (err) => {
            console.error(`[ERROR] Call error:`, err);
            endCall();
        });
    }

    /**
     * ينهي المكالمة الحالية ويعيد ضبط الواجهة.
     */
    function endCall() {
        if (currentCall) {
            currentCall.close();
            currentCall = null;
        }
        updateUiForCall(false);
        remoteVideo.srcObject = null;
    }

    /**
     * يحدّث واجهة المستخدم بناءً على حالة المكالمة.
     */
    function updateUiForCall(inCall) {
        preCallControls.style.display = inCall ? 'none' : 'flex';
        inCallControls.style.display = inCall ? 'flex' : 'none';
        if (!inCall) {
            // إعادة ضبط أزرار التحكم
            isMuted = false;
            isVideoOff = false;
            if (localStream) {
                localStream.getAudioTracks()[0].enabled = true;
                localStream.getVideoTracks()[0].enabled = true;
            }
            muteIcon.classList.remove('gg-mic-off');
            muteIcon.classList.add('gg-mic');
            videoIcon.classList.remove('gg-no-camera');
            videoIcon.classList.add('gg-camera');
            localVideo.style.display = 'block';
        }
    }

    // --- 3. ربط الأحداث والبدء ---

    // زر إعادة إنشاء الكود
    regenerateIdBtn.addEventListener('click', initializePeer);

    // زر الاتصال
    callBtn.addEventListener('click', () => {
        if (!localStream) {
            alert('يرجى السماح بالوصول إلى الكاميرا والمايكروفون أولاً.');
            return;
        }
        const remoteId = remoteIdInput.value.trim();
        if (!remoteId) {
            alert('يرجى إدخال كود صديقك.');
            return;
        }
        if (!peer || peer.disconnected) {
            alert('الاتصال بالخادم غير جاهز. حاول إنشاء كود جديد.');
            return;
        }
        console.log(`[INFO] Calling ${remoteId}`);
        const call = peer.call(remoteId, localStream);
        setupCall(call);
    });

    // زر كتم الصوت
    toggleMuteBtn.addEventListener('click', () => {
        if (!localStream) return;
        isMuted = !isMuted;
        localStream.getAudioTracks()[0].enabled = !isMuted;
        muteIcon.classList.toggle('gg-mic', !isMuted);
        muteIcon.classList.toggle('gg-mic-off', isMuted);
    });

    // زر إيقاف الكاميرا
    toggleVideoBtn.addEventListener('click', () => {
        if (!localStream) return;
        isVideoOff = !isVideoOff;
        localStream.getVideoTracks()[0].enabled = !isVideoOff;
        localVideo.style.display = isVideoOff ? 'none' : 'block';
        videoIcon.classList.toggle('gg-camera', !isVideoOff);
        videoIcon.classList.toggle('gg-no-camera', isVideoOff);
    });

    // زر إنهاء المكالمة
    endCallBtn.addEventListener('click', endCall);

    // --- 4. بدء تشغيل التطبيق ---

    /**
     * يبدأ التطبيق بالحصول على الوسائط ثم إعداد اتصال Peer.
     */
    async function start() {
        try {
            console.log('[INFO] Requesting user media (camera and mic)...');
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            console.log('[SUCCESS] User media acquired.');
        } catch (err) {
            console.error('[FATAL] Failed to get user media:', err);
            alert('فشل الوصول إلى الكاميرا أو المايكروفون. لا يمكن بدء التطبيق. يرجى التأكد من منح الإذن وتحديث الصفحة.');
            // إيقاف الواجهة في حالة الفشل
            myIdSpan.textContent = "الكاميرا مطلوبة";
            myIdSpan.style.color = "var(--red)";
            return;
        }

        // فقط بعد الحصول على الكاميرا بنجاح، نبدأ في محاولة الاتصال.
        initializePeer();
    }

    start();
});
