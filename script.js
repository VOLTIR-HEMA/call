import { auth, db, storage } from './firebase-init.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteField, onSnapshot, arrayUnion, arrayRemove, writeBatch, serverTimestamp, addDoc, orderBy, limit, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js";

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. إعداد المتغيرات والعناصر ---
    // عناصر المصادقة
    const authContainer = document.getElementById('auth-container');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const authError = document.getElementById('auth-error');
    const toggleToSignup = document.getElementById('toggle-to-signup');
    const toggleToLogin = document.getElementById('toggle-to-login');
    
    // عناصر الواجهة الرئيسية
    const sidebar = document.getElementById('sidebar');
    const sidebarAvatar = document.getElementById('sidebar-avatar');
    const sidebarUsername = document.getElementById('sidebar-username');
    const addFriendBtn = document.getElementById('add-friend-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const friendsList = document.getElementById('friends-list');
    const mainContent = document.getElementById('main-content');
    const welcomeMessage = document.querySelector('.welcome-message');
    const friendContextMenu = document.getElementById('friend-context-menu');
    const settingsModal = document.getElementById('settings-modal');
    const notificationContainer = document.getElementById('notification-container');
    const ringtone = document.getElementById('ringtone');

    // عناصر المكالمة الواردة
    const incomingCallContainer = document.getElementById('incoming-call-container');
    const callerAvatar = document.getElementById('caller-avatar');
    const callerName = document.getElementById('caller-name');
    const answerBtn = document.getElementById('answer-btn');
    const rejectBtn = document.getElementById('reject-btn');

    // عناصر الشات
    const chatView = document.getElementById('chat-view');
    const chatHeader = document.getElementById('chat-header');
    const chatFriendAvatar = document.getElementById('chat-friend-avatar');
    const chatFriendStatus = document.getElementById('chat-friend-status');
    const chatFriendName = document.getElementById('chat-friend-name');
    const chatContainer = document.getElementById('chat-container'); // This is now for in-call chat
    const messagesContainer = document.getElementById('messages');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const toggleChatBtn = document.getElementById('toggle-chat-btn');

    // عناصر التطبيق
    const callView = document.getElementById('call-view');
    const inCallControls = document.getElementById('in-call-controls');
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const toggleMuteBtn = document.getElementById('toggle-mute-btn');
    const muteIcon = toggleMuteBtn.querySelector('i');
    const toggleVideoBtn = document.getElementById('toggle-video-btn');
    const videoIcon = toggleVideoBtn.querySelector('i');
    const endCallBtn = document.getElementById('end-call-btn');

    let currentUser = null;
    let localStream;
    let peer;
    let currentCall;
    let isMuted = false;
    let isVideoOff = false;
    let connectionTimeout;
    let dataConnection;
    let incomingCall;
    let presenceListener = null; // للاحتفاظ بمرجع للاستماع
    let chatListener = null;
    let notificationsListener = null;
    let friendsAndPresenceListener = null;
    let peerInitialized = false;

    // --- 1.5. وظائف المصادقة والتحكم بالواجهة ---

    function showApp() {
        authContainer.style.display = 'none';
        appContainer.style.display = 'flex';
        start(); // ابدأ تشغيل الكاميرا والتطبيق
    }

    function showAuth() {
        authContainer.style.display = 'flex';
        appContainer.style.display = 'none';
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        if (peer && !peer.destroyed) peer.destroy();
    }

    async function handleSignup() {
        const username = document.getElementById('signup-username').value.trim().toLowerCase();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        const avatarFile = document.getElementById('signup-avatar').files[0];

        if (!username || !email || !password) {
            authError.textContent = "يرجى ملء جميع الحقول.";
            return;
        }
        if (username.length < 3) {
            authError.textContent = "اسم المستخدم يجب أن يكون 3 أحرف على الأقل.";
            return;
        }

        try {
            // التحقق من أن اسم المستخدم غير مستخدم
            const q = query(collection(db, "users"), where("username", "==", username));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                authError.textContent = "اسم المستخدم هذا مستخدم بالفعل.";
                return;
            }

            // إنشاء المستخدم في Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            let photoURL = null;
            // رفع الصورة الشخصية إذا تم اختيارها
            if (avatarFile) {
                const storageRef = ref(storage, `profile_pictures/${user.uid}`);
                const snapshot = await uploadBytes(storageRef, avatarFile);
                photoURL = await getDownloadURL(snapshot.ref);
                console.log('تم رفع الصورة بنجاح:', photoURL);
            }

            // تخزين معلومات المستخدم في Firestore
            await setDoc(doc(db, "users", user.uid), {
                username: username,
                email: email,
                photoURL: photoURL, // قد تكون null
                createdAt: serverTimestamp(),
                friends: [] // مصفوفة لتخزين UIDs الأصدقاء
            });

            console.log("تم إنشاء الحساب بنجاح!");
            // سيقوم onAuthStateChanged بالتعامل مع تسجيل الدخول
        } catch (error) {
            console.error("خطأ في إنشاء الحساب:", error);
            authError.textContent = "حدث خطأ. حاول مرة أخرى. (قد يكون الإيميل مستخدماً)";
        }
    }

    async function handleLogin() {
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        if (!email || !password) {
            authError.textContent = "يرجى إدخال البريد الإلكتروني وكلمة المرور.";
            return;
        }
        try {
            await signInWithEmailAndPassword(auth, email, password);
            console.log("تم تسجيل الدخول بنجاح!");
            authError.textContent = '';
            // سيقوم onAuthStateChanged بالتعامل مع تسجيل الدخول
        } catch (error) {
            console.error("خطأ في تسجيل الدخول:", error);
            authError.textContent = "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
        }
    }

    async function handleLogout() {
        if (currentUser) {
            // تحديث الحالة إلى offline قبل تسجيل الخروج
            const presenceRef = doc(db, "presence", currentUser.uid);
            try {
                await updateDoc(presenceRef, {
                    status: "offline",
                    peerId: deleteField() // حذف حقل peerId
                });
                console.log("تم تحديث الحالة إلى offline.");
            } catch (error) {
                console.error("خطأ في تحديث الحالة عند الخروج:", error);
            }
        }
        // إيقاف الاستماع لقائمة المتصلين
        if (presenceListener) {
            presenceListener();
            presenceListener = null;
        }
        // إيقاف الاستماع المدمج للأصدقاء والحالة
        if (friendsAndPresenceListener) {
            friendsAndPresenceListener();
            friendsAndPresenceListener = null;
        }
        // إيقاف الاستماع للإشعارات
        if (notificationsListener) {
            notificationsListener();
            notificationsListener = null;
        }
        // إيقاف الاستماع للشات
        if (chatListener) {
            chatListener();
            chatListener = null;
        }
        await signOut(auth);
        console.log("تم تسجيل الخروج.");
    }

    // --- 2. الوظائف الأساسية ---

    /**
     * يعرض رسالة فشل الاتصال على الواجهة.
     */
    function handleConnectionFailure(reason = 'unknown') {
        console.error(`[FAILURE] Connection failed. Reason: ${reason}`);
        if (peer && !peer.destroyed) {
            peer.destroy();
        }
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
    function initializePeer(onSuccess) {
        console.log('[INFO] Initializing Peer connection...');
        if (peer && !peer.destroyed) peer.destroy();

        // إذا كان هناك اتصال قديم، قم بتدميره بالكامل.
        if (peer && !peer.destroyed) {
            console.log('[INFO] Destroying previous peer connection.');
            peer.destroy();
        }
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
                (async () => {
                    console.log(`[SUCCESS] Peer connection open. ID: ${id}`);
                    clearTimeout(connectionTimeout); // ألغِ المؤقت لأن الاتصال نجح

                    // *** الخطوة الجديدة: ربط peerId بالمستخدم في Firestore ***
                    if (currentUser) {
                        await setDoc(doc(db, "presence", currentUser.uid), {
                            peerId: id,
                            status: "online"
                        }, { merge: true });
                    }
                    peerInitialized = true;
                    if (onSuccess) onSuccess();
                    setupCallListeners(); // الآن فقط نجهز لاستقبال المكالمات
                })();
            });

            // معالج حدث الأخطاء
            peer.on('error', (err) => {
                console.error(`[ERROR] PeerJS error:`, err);
                clearTimeout(connectionTimeout); // ألغِ المؤقت لأننا حصلنا على خطأ
                if (err.type === 'unavailable-id') {
                    alert(`الكود ${newPeerId} مستخدم. سيتم إنشاء كود جديد.`);
                    initializePeer(onSuccess); // حاول مرة أخرى بكود جديد
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

        // الاستماع للمكالمات الصوتية/الفيديو
        peer.on('call', async (call) => {
            console.log(`[INFO] Incoming media call from ${call.peer}`);
            incomingCall = call;

            // جلب بيانات المتصل
            const callerId = (await getDocs(query(collection(db, "presence"), where("peerId", "==", call.peer)))).docs[0].id;
            const callerDoc = await getDoc(doc(db, "users", callerId));
            const callerData = callerDoc.data();

            // عرض واجهة المكالمة الواردة
            callerName.textContent = `...${callerData.username} يتصل بك`;
            callerAvatar.src = callerData.photoURL || 'https://via.placeholder.com/100';
            incomingCallContainer.style.display = 'flex';
            ringtone.play();
        });

        // الاستماع لاتصالات البيانات (للشات)
        peer.on('connection', (conn) => {
            console.log(`[INFO] Incoming data connection from ${conn.peer}`);
            dataConnection = conn; // Accept the connection
            setupDataConnectionListeners();
        });
    }

    function setupDataConnectionListeners() {
        if (!dataConnection) return;
        dataConnection.on('data', (data) => {
            console.log('Received message:', data);
            const activeChatFriendId = chatView.dataset.friendId;

            // التعامل مع أحداث الكتابة
            if (data.type === 'typing' && data.senderId === activeChatFriendId) {
                chatFriendStatus.textContent = 'يكتب الآن...';
                // إعادة الحالة إلى "متصل" بعد فترة
                clearTimeout(window.typingTimeout);
                window.typingTimeout = setTimeout(() => {
                    const friendItem = document.querySelector(`.friend-item[data-uid="${activeChatFriendId}"]`);
                    if (friendItem) {
                        const statusText = friendItem.querySelector('.status span').textContent;
                        chatFriendStatus.textContent = statusText;
                    }
                }, 2000);
            }
        });
        dataConnection.on('open', () => {
            console.log('Data connection opened.');
        });
    }

    /**
     * يتعامل مع كائن المكالمة (سواء كانت صادرة أو واردة).
     */
    function setupCall(call) {
        currentCall = call;
        welcomeMessage.style.display = 'none';
        callView.style.display = 'block';
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
            // إرسال رسالة للمستخدم الآخر بأن المكالمة انتهت
            if (dataConnection && dataConnection.open) {
                dataConnection.close();
            }
            dataConnection = null;
            currentCall.close();
            currentCall = null;
        }
        callView.style.display = 'none';
        welcomeMessage.style.display = 'block';
        updateUiForCall(false);
        remoteVideo.srcObject = null;
    }

    function updateUiForCall(inCall) {
        sidebar.style.display = inCall ? 'none' : 'flex';
        chatContainer.classList.remove('visible');
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

    async function startCall(username, video = true) {
        username = username.toLowerCase();
        if (!username) return;

        // 1. ابحث عن المستخدم للحصول على uid
        const userQuery = query(collection(db, "users"), where("username", "==", username));
        const userSnapshot = await getDocs(userQuery);

        if (userSnapshot.empty) {
            alert("لم يتم العثور على مستخدم بهذا الاسم.");
            return;
        }

        const userDoc = userSnapshot.docs[0];
        const userId = userDoc.id;

        // 2. استخدم uid للبحث عن حالة الحضور (presence)
        const presenceDoc = await getDoc(doc(db, "presence", userId));

        if (!presenceDoc.exists() || presenceDoc.data().status !== 'online') {
            alert("هذا المستخدم غير متصل حالياً.");
            return;
        }

        const remotePeerId = presenceDoc.data().peerId;
        console.log(`[INFO] Found peerId ${remotePeerId} for username ${username}. Calling...`);

        const mediaConstraints = { video: video, audio: true };
        const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        localVideo.srcObject = stream;
        localStream = stream;

        // ابدأ اتصال الفيديو
        const call = peer.call(remotePeerId, stream);
        setupCall(call);
    }

    function appendMessage(sender, text, type, isSelf) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', type); // type can be 'sent' or 'received'
        
        // لا نعرض اسم المرسل إذا كان هو "أنا"
        if (!isSelf) {
            const senderElement = document.createElement('strong');
            senderElement.textContent = sender;
            messageElement.appendChild(senderElement);
        }
        
        const textElement = document.createElement('span');
        textElement.textContent = text;
        messageElement.appendChild(textElement);

        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight; // التمرير للأسفل تلقائياً
    }

    function showNotification(message) {
        const notificationElement = document.createElement('div');
        notificationElement.className = 'toast-notification';
        notificationElement.textContent = message;
        notificationContainer.appendChild(notificationElement);

        // إظهار الإشعار
        setTimeout(() => {
            notificationElement.classList.add('show');
        }, 100);

        // إخفاء وحذف الإشعار بعد 5 ثوانٍ
        setTimeout(() => {
            notificationElement.classList.remove('show');
            setTimeout(() => notificationElement.remove(), 500);
        }, 5000);
    }

    function openChatView(friendId, friendData) {
        // إخفاء الواجهات الأخرى
        welcomeMessage.style.display = 'none';
        callView.style.display = 'none';

        // إعداد رأس الشات
        chatFriendAvatar.src = friendData.photoURL || 'https://via.placeholder.com/40';
        chatFriendName.textContent = friendData.username;
        const friendItem = document.querySelector(`.friend-item[data-uid="${friendId}"]`);
        const statusText = friendItem ? friendItem.querySelector('.status span').textContent : 'غير متصل';
        chatFriendStatus.textContent = statusText;
        chatView.dataset.friendId = friendId;

        // إظهار واجهة الشات
        chatView.style.display = 'flex';
        messagesContainer.innerHTML = ''; // مسح الرسائل القديمة

        // إيقاف المستمع القديم إذا كان موجوداً
        if (chatListener) {
            chatListener();
        }

        // إنشاء chatId فريد وثابت
        const chatId = [currentUser.uid, friendId].sort().join('_');
        const messagesRef = collection(db, "chats", chatId, "messages");
        const q = query(messagesRef, orderBy("createdAt", "asc"));

        // الاستماع للرسائل من Firestore
        chatListener = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const messageData = change.doc.data();
                    const isSelf = messageData.senderId === currentUser.uid;
                    appendMessage(
                        isSelf ? 'أنا' : friendData.username,
                        messageData.text,
                        isSelf ? 'sent' : 'received',
                        isSelf
                    );
                }
            });
        });

        // ربط أزرار الاتصال في رأس الشات
        document.getElementById('chat-video-call-btn').onclick = () => startCall(friendData.username, true);
        document.getElementById('chat-voice-call-btn').onclick = () => startCall(friendData.username, false);

        // إنشاء اتصال بيانات إذا لم يكن موجوداً
        getDoc(doc(db, "presence", friendId)).then(presenceDoc => {
            if (presenceDoc.exists() && presenceDoc.data().status === 'online') {
                if (!dataConnection || dataConnection.peer !== presenceDoc.data().peerId) {
                    const remotePeerId = presenceDoc.data().peerId;
                    console.log(`[INFO] Opening data connection to ${friendData.username} with peerId ${remotePeerId}`);
                    dataConnection = peer.connect(remotePeerId);
                    setupDataConnectionListeners();
                }
            } else {
                console.warn("Cannot open data connection for typing indicator, user is offline.");
            }
        });
    }

    // --- 2.5 وظائف نظام الأصدقاء ---

    async function searchUsers(searchTerm, resultsContainer) {
        resultsContainer.innerHTML = '';
        if (searchTerm.length < 3) return;

        const q = query(collection(db, "users"), where("username", ">=", searchTerm), where("username", "<=", searchTerm + '\uf8ff'));
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach(doc => {
            if (doc.id === currentUser.uid) return; // لا تعرض المستخدم الحالي
            const userData = doc.data();
            const resultElement = document.createElement('div');
            resultElement.className = 'search-result';
            resultElement.innerHTML = `
                <img src="${userData.photoURL || 'https://via.placeholder.com/40'}" alt="${userData.username}">
                <span>${userData.username}</span>
                <button data-uid="${doc.id}">إضافة</button>
            `;
            resultsContainer.appendChild(resultElement);
        });

        resultsContainer.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', (e) => sendFriendRequest(e.target.dataset.uid));
        });
    }

    async function sendFriendRequest(toUid) {
        if (currentUser.uid === toUid) return;
        const requestId = [currentUser.uid, toUid].sort().join('_');
        const requestRef = doc(db, "friend_requests", requestId);

        const requestSnap = await getDoc(requestRef);
        if (requestSnap.exists()) {
            alert("طلب الصداقة تم إرساله بالفعل أو أنكم أصدقاء.");
            return;
        }

        await setDoc(requestRef, {
            from: currentUser.uid,
            to: toUid,
            status: 'pending',
            createdAt: serverTimestamp()
        });

        // إنشاء إشعار للمستخدم الآخر
        const fromUser = await getDoc(doc(db, "users", currentUser.uid));
        await addDoc(collection(db, "notifications"), {
            to: toUid,
            message: `لديك طلب صداقة جديد من ${fromUser.data().username}`,
            read: false,
            createdAt: serverTimestamp()
        });
        alert("تم إرسال طلب الصداقة.");
    }

    function listenForFriendRequests(requestsContainer) {
        const q = query(collection(db, "friend_requests"), where("to", "==", currentUser.uid), where("status", "==", "pending"));
        onSnapshot(q, async (snapshot) => {
            if (!requestsContainer) return; // التأكد من وجود الحاوية
            requestsContainer.innerHTML = '';
            for (const requestDoc of snapshot.docs) {
                const requestData = requestDoc.data();
                const fromUserDoc = await getDoc(doc(db, "users", requestData.from));
                const fromUserData = fromUserDoc.data();

                const requestElement = document.createElement('div');
                requestElement.className = 'request-item';
                requestElement.innerHTML = `
                    <img src="${fromUserData.photoURL || 'https://via.placeholder.com/40'}" alt="${fromUserData.username}">
                    <span>${fromUserData.username}</span>
                    <div class="actions">
                        <button class="accept-btn" data-id="${requestDoc.id}" data-from="${requestData.from}">قبول</button>
                        <button class="reject-btn" data-id="${requestDoc.id}">رفض</button>
                    </div>
                `;
                requestsContainer.appendChild(requestElement);
            }

            requestsContainer.querySelectorAll('.accept-btn').forEach(btn => btn.addEventListener('click', (e) => acceptFriendRequest(e.target.dataset.id, e.target.dataset.from)));
            requestsContainer.querySelectorAll('.reject-btn').forEach(btn => btn.addEventListener('click', (e) => deleteFriendRequest(e.target.dataset.id)));
        });
    }

    async function acceptFriendRequest(requestId, fromUid) {
        const batch = writeBatch(db);

        // إضافة كل مستخدم لقائمة أصدقاء الآخر
        batch.update(doc(db, "users", currentUser.uid), { friends: arrayUnion(fromUid) });
        batch.update(doc(db, "users", fromUid), { friends: arrayUnion(currentUser.uid) });

        // حذف طلب الصداقة
        batch.delete(doc(db, "friend_requests", requestId));

        // إنشاء إشعار للمستخدم الذي أرسل الطلب
        const currentUserDoc = await getDoc(doc(db, "users", currentUser.uid));
        const notificationRef = collection(db, "notifications");
        batch.set(doc(notificationRef), {
            to: fromUid,
            message: `قبل ${currentUserDoc.data().username} طلب صداقتك.`,
            read: false,
            createdAt: serverTimestamp()
        });

        await batch.commit();
    }

    async function deleteFriendRequest(requestId) {
        await deleteDoc(doc(db, "friend_requests", requestId));
    }

    async function removeFriend(friendUid) {
        await updateDoc(doc(db, "users", currentUser.uid), { friends: arrayRemove(friendUid) });
        await updateDoc(doc(db, "users", friendUid), { friends: arrayRemove(currentUser.uid) });
    }

    function listenForFriends() {
        const userRef = doc(db, "users", currentUser.uid);
        friendsAndPresenceListener = onSnapshot(userRef, async (userDoc) => {
            const userData = userDoc.data();
            if (!userData || !userData.friends) return;

            friendsList.innerHTML = '';
            for (const friendId of userData.friends) {
                const friendDoc = await getDoc(doc(db, "users", friendId));
                const friendData = friendDoc.data();

                const presenceDoc = await getDoc(doc(db, "presence", friendId));
                const isOnline = presenceDoc.exists() && presenceDoc.data().status === 'online';

                const friendElement = document.createElement('div');
                friendElement.className = 'friend-item';
                friendElement.dataset.uid = friendId;
                friendElement.dataset.username = friendData.username;

                friendElement.innerHTML = `
                    <img src="${friendData.photoURL || 'https://via.placeholder.com/40'}" alt="${friendData.username}">
                    <div class="info">
                        <span>${friendData.username}</span>
                        <div class="status">
                            <div class="status-dot ${isOnline ? 'online' : ''}"></div>
                            <span>${isOnline ? 'متصل' : 'غير متصل'}</span>
                        </div>
                    </div>
                `;
                friendsList.appendChild(friendElement);
            }
        });
    }

    function listenForNotifications() {
        if (!currentUser) return;
        const q = query(collection(db, "notifications"), where("to", "==", currentUser.uid), where("read", "==", false), orderBy("createdAt", "desc"), limit(1));
        notificationsListener = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if (change.type === "added") {
                    const notification = change.doc.data();
                    showNotification(notification.message);
                    // تحديث الإشعار إلى "مقروء"
                    await updateDoc(doc(db, "notifications", change.doc.id), { read: true });
                }
            });
        });
    }

    // --- 2.6 وظائف الإعدادات والواجهات المنبثقة ---

    function showSettingsModal(initialTab = 'profile') {
        const modalContent = settingsModal.querySelector('.modal-content');
        const user = auth.currentUser;
        modalContent.innerHTML = `
            <button class="modal-close-btn"><i class="gg-icon gg-close"></i></button>
            <div class="tab-buttons">
                <button class="tab-btn ${initialTab === 'profile' ? 'active' : ''}" data-tab="profile-tab">الملف الشخصي</button>
                <button class="tab-btn ${initialTab === 'add' ? 'active' : ''}" data-tab="add-friend-tab">إضافة صديق</button>
                <button class="tab-btn ${initialTab === 'requests' ? 'active' : ''}" data-tab="requests-tab">الطلبات</button>
            </div>

            <div id="profile-tab" class="tab-content ${initialTab === 'profile' ? 'active' : ''}">
                <h2>الملف الشخصي</h2>
                <div class="auth-form">
                    <img src="${user.photoURL || 'https://via.placeholder.com/100'}" style="width:100px; height:100px; border-radius:50%; object-fit:cover; margin: 0 auto 10px;">
                    <div class="profile-info">
                        <h3>${user.displayName || user.email.split('@')[0]}</h3>
                        <button id="copy-username-btn" title="نسخ اسم المستخدم"><i class="gg-icon gg-copy"></i></button>
                    </div>
                    <label for="update-username" style="font-size: 0.9em; margin-bottom: 5px;">تعديل اسم المستخدم:</label>
                    <input type="text" id="update-username" placeholder="أدخل الاسم الجديد هنا">
                    <input type="file" id="update-avatar" accept="image/*">
                    <button id="save-profile-btn">حفظ التغييرات</button>
                    <button id="logout-btn" style="background-color: var(--red); margin-top: 10px;">تسجيل الخروج</button>
                </div>
            </div>

            <div id="add-friend-tab" class="tab-content ${initialTab === 'add' ? 'active' : ''}">
                <h2>إضافة صديق</h2>
                <input type="text" id="search-user-input" placeholder="ابحث باسم المستخدم..." class="auth-form" style="width:100%; box-sizing: border-box;">
                <div id="search-results-list" style="margin-top: 15px;"></div>
            </div>

            <div id="requests-tab" class="tab-content ${initialTab === 'requests' ? 'active' : ''}">
                <h2>طلبات الصداقة</h2>
                <div id="requests-list"></div>
            </div>
        `;
        settingsModal.style.display = 'flex';

        // ربط الأحداث
        settingsModal.querySelector('.modal-close-btn').addEventListener('click', () => settingsModal.style.display = 'none');
        settingsModal.querySelector('#logout-btn').addEventListener('click', handleLogout);
        settingsModal.querySelector('#save-profile-btn').addEventListener('click', handleProfileUpdate);
        settingsModal.querySelector('#copy-username-btn').addEventListener('click', () => {
            const usernameToCopy = user.displayName || user.email.split('@')[0];
            navigator.clipboard.writeText(usernameToCopy);
            showNotification(`تم نسخ اسم المستخدم: ${usernameToCopy}`);
        });

        const searchInput = settingsModal.querySelector('#search-user-input');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('keyup', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    searchUsers(e.target.value.trim().toLowerCase(), settingsModal.querySelector('#search-results-list'));
                }, 500);
            });
        }

        settingsModal.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                settingsModal.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
                btn.classList.add('active');
                settingsModal.querySelector(`#${btn.dataset.tab}`).classList.add('active');
            });
        });
    }

    async function handleProfileUpdate() {
        const newUsername = document.getElementById('update-username').value.trim().toLowerCase();
        const newAvatarFile = document.getElementById('update-avatar').files[0];
        const user = auth.currentUser;
        let updates = {};
        let authUpdates = {};
        
        if (newUsername && newUsername !== user.displayName) {
            // Check if username is unique before updating
            const q = query(collection(db, "users"), where("username", "==", newUsername));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                alert("اسم المستخدم هذا مستخدم بالفعل.");
                return;
            }
            updates.username = newUsername;
            authUpdates.displayName = newUsername;
        }

        if (newAvatarFile) {
            const storageRef = ref(storage, `profile_pictures/${user.uid}`);
            const snapshot = await uploadBytes(storageRef, newAvatarFile);
            const photoURL = await getDownloadURL(snapshot.ref);
            updates.photoURL = photoURL;
            authUpdates.photoURL = photoURL;
        }

        if (Object.keys(updates).length > 0) {
            await updateDoc(doc(db, "users", user.uid), updates);
        }
        if (Object.keys(authUpdates).length > 0) {
            await updateProfile(user, authUpdates);
        }

        alert("تم تحديث الملف الشخصي بنجاح!");
        settingsModal.style.display = 'none';
    }

    // --- 3. ربط الأحداث والبدء ---

    // فتح قائمة التفاعل مع الصديق
    friendsList.addEventListener('click', (e) => {
        const friendItem = e.target.closest('.friend-item');
        if (!friendItem) return;

        const { uid, username } = friendItem.dataset;
        friendContextMenu.style.display = 'block';
        friendContextMenu.style.top = `${e.clientY}px`;
        friendContextMenu.style.right = `${window.innerWidth - e.clientX}px`; // For RTL

        // ربط الأحداث للقائمة
        document.getElementById('context-menu-video-call').onclick = () => startCall(username, true);
        document.getElementById('context-menu-voice-call').onclick = () => startCall(username, false);
        document.getElementById('context-menu-chat').onclick = async () => {
            const friendDoc = await getDoc(doc(db, "users", uid));
            if (friendDoc.exists()) {
                openChatView(uid, friendDoc.data());
            }
        };
        document.getElementById('context-menu-remove').onclick = () => {
            if (confirm(`هل أنت متأكد من حذف ${username}؟`)) removeFriend(uid);
        };
    });

    // إخفاء القائمة عند النقر في أي مكان آخر
    document.addEventListener('click', (e) => {
        if (!friendContextMenu.contains(e.target) && !e.target.closest('.friend-item')) {
            friendContextMenu.style.display = 'none';
        }
        if (settingsModal.style.display === 'flex' && !settingsModal.querySelector('.modal-content').contains(e.target) && !e.target.closest('#settings-btn, #add-friend-btn')) {
            settingsModal.style.display = 'none';
        }
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

    // زر إظهار/إخفاء الشات
    toggleChatBtn.addEventListener('click', () => {
        chatContainer.classList.toggle('visible');
    });

    // زر إنهاء المكالمة
    endCallBtn.addEventListener('click', endCall);

    // أزرار المكالمة الواردة
    answerBtn.addEventListener('click', () => {
        if (incomingCall) {
            incomingCall.answer(localStream);
            setupCall(incomingCall);
            incomingCallContainer.style.display = 'none';
            ringtone.pause();
            ringtone.currentTime = 0;
            incomingCall = null;
        }
    });

    rejectBtn.addEventListener('click', () => {
        // PeerJS لا يدعم الرفض الصريح، لكن يمكننا إغلاق الاتصال من طرفنا
        if (incomingCall) {
            incomingCall.close(); // يرسل إشارة للمتصل بأن المكالمة انتهت
            incomingCallContainer.style.display = 'none';
            ringtone.pause();
            ringtone.currentTime = 0;
            incomingCall = null;
        }
    });

    // نموذج الشات
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const messageText = chatInput.value.trim();
        const friendId = chatView.dataset.friendId;

        if (messageText && friendId) {
            const chatId = [currentUser.uid, friendId].sort().join('_');
            const messagesRef = collection(db, "chats", chatId, "messages");

            addDoc(messagesRef, {
                text: messageText,
                senderId: currentUser.uid,
                createdAt: serverTimestamp()
            });

            // تحديث معلومات المحادثة (اختياري، مفيد لواجهة مثل واتساب)
            setDoc(doc(db, "chats", chatId), {
                participants: [currentUser.uid, friendId],
                lastMessage: {
                    text: messageText,
                    createdAt: serverTimestamp()
                }
            }, { merge: true });

            chatInput.value = '';
        } else {
            chatInput.value = '';
        }
    });

    // ربط أحداث المصادقة
    signupBtn.addEventListener('click', handleSignup);
    loginBtn.addEventListener('click', handleLogin);
    
    toggleToSignup.addEventListener('click', () => {
        loginForm.style.display = 'none';
        signupForm.style.display = 'flex';
        authError.textContent = '';
    });
    toggleToLogin.addEventListener('click', () => {
        signupForm.style.display = 'none';
        loginForm.style.display = 'flex';
        authError.textContent = '';
    });

    // أزرار الشريط الجانبي
    settingsBtn.addEventListener('click', () => showSettingsModal('profile'));
    addFriendBtn.addEventListener('click', () => showSettingsModal('add'));

    // إرسال مؤشر الكتابة
    chatInput.addEventListener('input', () => {
        if (dataConnection && dataConnection.open) {
            dataConnection.send({
                type: 'typing',
                senderId: currentUser.uid
            });
        }
    });
    // --- 4. بدء تشغيل التطبيق ---

    /**
     * يبدأ التطبيق بالحصول على الوسائط ثم إعداد اتصال Peer.
     */
    async function start() {
        try {
            // الحصول على إذن الكاميرا مبكراً ولكن لا يتم تشغيلها إلا عند الحاجة
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            stream.getTracks().forEach(track => track.stop()); // إيقافها فوراً
            console.log('[SUCCESS] User media permission granted.');
            initializePeer(); // إعداد اتصال PeerJS في الخلفية
        } catch (err) {
            console.error('[FATAL] Failed to get user media:', err);
            alert('فشل الوصول إلى الكاميرا أو المايكروفون. لا يمكن بدء التطبيق. يرجى التأكد من منح الإذن وتحديث الصفحة.');
        }
    }

    // --- 5. نقطة البداية الجديدة ---
    // استمع لتغيرات حالة المصادقة
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // المستخدم مسجل دخوله
            currentUser = user;
            console.log(`المستخدم ${user.uid} مسجل دخوله.`);
            sidebarAvatar.src = user.photoURL || 'https://via.placeholder.com/40';
            sidebarUsername.textContent = user.displayName || user.email.split('@')[0];
            showApp();
            listenForFriends();
            listenForNotifications();

        } else {
            // المستخدم قام بتسجيل الخروج
            currentUser = null;
            console.log("لا يوجد مستخدم مسجل دخوله.");
            showAuth();
        }
    });

});
