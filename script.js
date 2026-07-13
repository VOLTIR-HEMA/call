// انتظر حتى يتم تحميل الصفحة بالكامل
window.addEventListener('load', () => {
    // الحصول على عناصر الواجهة من ملف HTML
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
    const endCallBtn = document.getElementById('end-call-btn');

    let localStream; // لتخزين بث الفيديو المحلي
    let peer; // كائن PeerJS الرئيسي
    let currentCall; // لتخزين المكالمة الحالية
    let isMuted = false;
    let isVideoOff = false;

    // --- الخطوة 1: إعداد PeerJS والحصول على ID ---
    // نقوم بإنشاء كائن Peer جديد. سيتم الاتصال بخادم PeerJS السحابي تلقائيًا
    // والحصول على ID فريد. هذا الـ ID هو الذي ستشاركه مع صديقك.
    // المكتبة تستخدم خوادم STUN/TURN عامة تلقائياً، مما يحل مشكلة الـ VPN.
    peer = new Peer();

    // عندما يكون الـ Peer جاهزًا ويحصل على ID
    peer.on('open', (id) => {
        console.log('My peer ID is: ' + id);
        myIdSpan.textContent = id; // عرض الـ ID على الشاشة
    });

    // --- الخطوة 2: الوصول إلى الكاميرا والمايكروفون ---
    // نطلب من المتصفح الوصول إلى الفيديو والصوت
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
            localStream = stream; // تخزين البث المحلي
            localVideo.srcObject = stream; // عرض الفيديو المحلي على الشاشة
        })
        .catch(err => {
            console.error('Failed to get local stream', err);
            alert('فشل الوصول إلى الكاميرا أو المايكروفون. يرجى التأكد من منح الإذن.');
        });

    // --- الخطوة 3: التعامل مع المكالمات الواردة ---
    // عندما يتصل بك شخص آخر باستخدام الـ ID الخاص بك
    peer.on('call', (call) => {
        // تخزين المكالمة الواردة
        currentCall = call;
        updateUiForCall();

        // الرد على المكالمة وإرسال بث الفيديو والصوت المحلي الخاص بك
        call.answer(localStream);

        // عندما يرسل الطرف الآخر بث الفيديو الخاص به
        call.on('stream', (remoteStream) => {
            // عرض الفيديو الخاص به على الشاشة
            remoteVideo.srcObject = remoteStream;
        });

        // عند إغلاق المكالمة من الطرف الآخر
        call.on('close', () => {
            endCall();
        });
    });

    // --- وظائف مساعدة لتحديث الواجهة ---
    function updateUiForCall() {
        preCallControls.style.display = 'none';
        inCallControls.style.display = 'flex';
    }

    function resetUiAfterCall() {
        preCallControls.style.display = 'flex';
        inCallControls.style.display = 'none';
        remoteVideo.srcObject = null;

        // إعادة الأيقونات والحالة إلى الوضع الافتراضي
        isMuted = false;
        localStream.getAudioTracks()[0].enabled = true;
        muteIcon.classList.remove('gg-mic-off');
        muteIcon.classList.add('gg-mic');

        isVideoOff = false;
        localStream.getVideoTracks()[0].enabled = true;
        videoIcon.classList.remove('gg-no-camera');
        videoIcon.classList.add('gg-camera');
    }

    // --- الخطوة 4: إجراء مكالمة ---
    // عند الضغط على زر "اتصال"
    callBtn.addEventListener('click', () => {
        const remoteId = remoteIdInput.value;
        const call = peer.call(remoteId, localStream); // اتصل بالـ ID الذي تم إدخاله

        // تخزين المكالمة الصادرة
        currentCall = call;
        updateUiForCall();

        call.on('stream', (remoteStream) => {
            remoteVideo.srcObject = remoteStream;
        });

        // عند إغلاق المكالمة من الطرف الآخر
        call.on('close', () => {
            endCall();
        });
    });

    // --- الخطوة 5: إضافة وظائف الأزرار الجديدة ---

    // زر كتم الصوت
    toggleMuteBtn.addEventListener('click', () => {
        isMuted = !isMuted; // عكس الحالة
        localStream.getAudioTracks()[0].enabled = !isMuted;
        // تغيير الأيقونة بناءً على الحالة
        muteIcon.classList.toggle('gg-mic', !isMuted);
        muteIcon.classList.toggle('gg-mic-off', isMuted);
    });

    // زر إيقاف/تشغيل الكاميرا
    toggleVideoBtn.addEventListener('click', () => {
        isVideoOff = !isVideoOff; // عكس الحالة
        localStream.getVideoTracks()[0].enabled = !isVideoOff;
        // إخفاء/إظهار الفيديو المحلي وتغيير الأيقونة
        localVideo.style.display = isVideoOff ? 'none' : 'block';
        videoIcon.classList.toggle('gg-camera', !isVideoOff);
        videoIcon.classList.toggle('gg-no-camera', isVideoOff);
    });

    // زر إنهاء المكالمة
    endCallBtn.addEventListener('click', () => {
        if (currentCall) {
            currentCall.close(); // إغلاق الاتصال
            endCall();
        }
    });

    // وظيفة لإنهاء المكالمة وتنظيف الواجهة
    function endCall() {
        resetUiAfterCall();
        currentCall = null;
    }
    });
});