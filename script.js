import { auth, db, storage } from './firebase-init.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, sendPasswordResetEmail, deleteUser, sendEmailVerification } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteField, onSnapshot, arrayUnion, arrayRemove, writeBatch, serverTimestamp, addDoc, orderBy, limit, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js";

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. DOM Elements ---
    const authContainer = document.getElementById('auth-container');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const authError = document.getElementById('auth-error');
    const toggleToSignup = document.getElementById('toggle-to-signup');
    const toggleToLogin = document.getElementById('toggle-to-login');
    const verifyEmailContainer = document.getElementById('verify-email-container');
    
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

    const incomingCallContainer = document.getElementById('incoming-call-container');
    const callerAvatar = document.getElementById('caller-avatar');
    const callerName = document.getElementById('caller-name');
    const answerBtn = document.getElementById('answer-btn');
    const rejectBtn = document.getElementById('reject-btn');

    const chatView = document.getElementById('chat-view');
    const chatFriendAvatar = document.getElementById('chat-friend-avatar');
    const chatFriendStatus = document.getElementById('chat-friend-status');
    const chatFriendName = document.getElementById('chat-friend-name');
    const messagesContainer = document.getElementById('messages');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    
    const callView = document.getElementById('call-view');
    const inCallControls = document.getElementById('in-call-controls');
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const toggleMuteBtn = document.getElementById('toggle-mute-btn');
    const toggleVideoBtn = document.getElementById('toggle-video-btn');
    const toggleChatBtn = document.getElementById('toggle-chat-btn');
    const endCallBtn = document.getElementById('end-call-btn');

    // --- 2. App State ---
    let currentUser = null;
    let localStream;
    let peer;
    let currentCall;
    let dataConnection;
    let incomingCall;
    let listeners = {
        chat: null,
        notifications: null,
        friends: null
    };

    // --- 3. Core Functions ---

    // --- Auth & UI State ---
    function showApp() {
        authContainer.style.display = 'none';
        verifyEmailContainer.style.display = 'none';
        appContainer.style.display = 'flex';
        start();
    }

    function showAuth() {
        authContainer.style.display = 'flex';
        loginForm.style.display = 'flex';
        signupForm.style.display = 'none';
        verifyEmailContainer.style.display = 'none';
        appContainer.style.display = 'none';
        if (localStream) localStream.getTracks().forEach(track => track.stop());
        if (peer && !peer.destroyed) peer.destroy();
    }

    async function handleSignup(e) {
        e.preventDefault();
        const username = signupForm.querySelector('#signup-username').value.trim().toLowerCase();
        const email = signupForm.querySelector('#signup-email').value.trim();
        const password = signupForm.querySelector('#signup-password').value;
        const avatarFile = signupForm.querySelector('#signup-avatar').files[0];
        const signupButton = signupForm.querySelector('button[type="submit"]');
        const signupError = document.getElementById('signup-error');

        if (!username || !email || !password) {
            signupError.textContent = "الرجاء ملء جميع الحقول.";
            return;
        }
        signupButton.disabled = true;
        signupError.textContent = ''; // Clear previous errors

        try {
            // 1. Check if username exists
            signupButton.textContent = 'التحقق من اسم المستخدم...';
            const q = query(collection(db, "users"), where("username", "==", username));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                signupError.textContent = "اسم المستخدم هذا مستخدم بالفعل.";
                signupButton.disabled = false;
                signupButton.textContent = 'إنشاء حساب';
                return;
            }

            // 2. Create user with email and password
            signupButton.textContent = 'جاري إنشاء الحساب...';
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            // From this point on, if anything fails, we must delete the created user.
            const user = userCredential.user;

            // 3. Upload avatar if it exists
            let photoURL = null;
            if (avatarFile) {
                signupButton.textContent = 'جاري رفع الصورة...';
                const storageRef = ref(storage, `profile_pictures/${user.uid}`);
                const snapshot = await uploadBytes(storageRef, avatarFile);
                photoURL = await getDownloadURL(snapshot.ref);
            }

            // 4. Update Firebase Auth profile
            await updateProfile(user, { displayName: username, photoURL });

            // 5. Create user document in Firestore
            signupButton.textContent = 'جاري حفظ البيانات...';
            await setDoc(doc(db, "users", user.uid), {
                username,
                email,
                photoURL,
                createdAt: serverTimestamp(),
                friends: []
            });

            // 6. Send verification email
            await sendEmailVerification(user);

            // The onAuthStateChanged listener will handle showing the app.
            signupError.textContent = 'تم! تحقق من بريدك الإلكتروني للتفعيل.';
            console.log("Account created successfully! Waiting for auth state change.");
            // The button will be re-enabled/hidden by the view change, no need to touch it here.

        } catch (error) {
            console.error("Signup Error:", error);

            // **Robust Error Handling**: If user creation succeeded in Auth but a later step failed,
            // delete the partially created user to allow them to try again cleanly.
            if (error.code !== 'auth/email-already-in-use' && error.code !== 'auth/weak-password') {
                const user = auth.currentUser;
                if (user && user.email === email) { // Ensure we are deleting the correct user
                    try {
                        await deleteUser(user);
                        console.log("Partial user deleted due to signup failure.");
                    } catch (deleteError) {
                        console.error("CRITICAL: Failed to delete partial user:", deleteError);
                    }
                }
            }

            // Provide more specific feedback to the user
            switch (error.code) {
                case 'auth/email-already-in-use':
                    signupError.textContent = 'هذا البريد الإلكتروني مستخدم بالفعل.';
                    break;
                case 'auth/weak-password':
                    signupError.textContent = 'كلمة المرور ضعيفة جدًا (6 أحرف على الأقل).';
                    break;
                default: // For other errors, including network issues or invalid emails
                    signupError.textContent = "حدث خطأ. تأكد من صحة البيانات واتصالك بالإنترنت.";
            }
            signupButton.disabled = false;
            signupButton.textContent = 'إنشاء حساب';
        }
    }

    async function handleLogin(e) {
        e.preventDefault();
        const email = loginForm.querySelector('#login-email').value.trim();
        const password = loginForm.querySelector('#login-password').value;
        if (!email || !password) {
            authError.textContent = "يرجى إدخال البريد الإلكتروني وكلمة المرور.";
            return;
        }
        try {
            authError.textContent = 'جاري تسجيل الدخول...';
            await signInWithEmailAndPassword(auth, email, password);
            authError.textContent = '';
        } catch (error) {
            console.error("Login Error:", error);
            // Provide more specific feedback for login errors
            switch (error.code) {
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                case 'auth/invalid-credential':
                    authError.textContent = "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
                    break;
                default:
                    authError.textContent = "حدث خطأ أثناء محاولة تسجيل الدخول.";
                    break;
            }
        }
    }

    async function handlePasswordReset() {
        const email = prompt("الرجاء إدخال بريدك الإلكتروني لإرسال رابط إعادة تعيين كلمة المرور:");
        if (!email) return;

        const errorEl = document.getElementById('auth-error');
        errorEl.textContent = 'جاري إرسال البريد...';
        try {
            await sendPasswordResetEmail(auth, email);
            alert(`تم إرسال رابط إعادة تعيين كلمة المرور إلى ${email}. يرجى التحقق من بريدك الوارد (والبريد المزعج).`);
            errorEl.textContent = '';
        } catch (error) {
            console.error("Password Reset Error:", error);
            switch (error.code) {
                case 'auth/user-not-found':
                    errorEl.textContent = "لم يتم العثور على حساب مرتبط بهذا البريد الإلكتروني.";
                    break;
                default:
                    errorEl.textContent = "حدث خطأ أثناء محاولة إرسال البريد الإلكتروني.";
            }
        }
    }

    function showVerificationScreen() {
        authContainer.style.display = 'flex';
        loginForm.style.display = 'none';
        signupForm.style.display = 'none';
        verifyEmailContainer.style.display = 'block';
        appContainer.style.display = 'none';

        document.getElementById('resend-verification-email').onclick = async () => {
            const errorEl = document.getElementById('verify-email-error');
            try {
                await sendEmailVerification(auth.currentUser);
                errorEl.textContent = 'تم إرسال بريد التفعيل مرة أخرى.';
            } catch (error) {
                errorEl.textContent = 'حدث خطأ. يرجى المحاولة بعد قليل.';
            }
        };
        document.getElementById('back-to-login').onclick = handleLogout;
    }

    async function handleLogout() {
        if (currentUser) {
            try {
                await updateDoc(doc(db, "presence", currentUser.uid), { status: "offline", peerId: deleteField() });
            } catch (error) {
                console.error("Logout presence update error:", error);
            }
        }
        Object.values(listeners).forEach(unsubscribe => unsubscribe && unsubscribe());
        await signOut(auth);
    }

    // --- PeerJS & Calling ---
    function initializePeer() {
        if (peer && !peer.destroyed) peer.destroy();
        const newPeerId = generateRandomId();
        try {
            peer = new Peer(newPeerId, { config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] } });
            peer.on('open', async (id) => {
                if (currentUser) {
                    await setDoc(doc(db, "presence", currentUser.uid), { peerId: id, status: "online" }, { merge: true });
                }
                setupCallListeners();
            });
            peer.on('error', (err) => {
                console.error("PeerJS Error:", err);
                if (err.type === 'unavailable-id') initializePeer();
            });
        } catch (error) {
            console.error("PeerJS Initialization Error:", error);
        }
    }

    function setupCallListeners() {
        if (!peer) return;
        peer.on('call', async (call) => {
            incomingCall = call;
            const presenceQuery = query(collection(db, "presence"), where("peerId", "==", call.peer));
            const presenceSnapshot = await getDocs(presenceQuery);
            if (presenceSnapshot.empty) return;
            const callerId = presenceSnapshot.docs[0].id;
            const callerDoc = await getDoc(doc(db, "users", callerId));
            if (!callerDoc.exists()) return;
            const callerData = callerDoc.data();
            callerName.textContent = `...${callerData.username} يتصل بك`;
            callerAvatar.src = callerData.photoURL || 'https://via.placeholder.com/100';
            incomingCallContainer.style.display = 'flex';
            ringtone.play();
        });
        peer.on('connection', (conn) => {
            dataConnection = conn;
            setupDataConnectionListeners();
        });
    }

    function setupDataConnectionListeners() {
        if (!dataConnection) return;
        dataConnection.on('data', (data) => {
            const activeChatFriendId = chatView.dataset.friendId;
            if (data.type === 'typing' && data.senderId === activeChatFriendId) {
                chatFriendStatus.textContent = 'يكتب الآن...';
                clearTimeout(window.typingTimeout);
                window.typingTimeout = setTimeout(() => {
                    const friendItem = document.querySelector(`.friend-item[data-uid="${activeChatFriendId}"]`);
                    if (friendItem) chatFriendStatus.textContent = friendItem.querySelector('.status span').textContent;
                }, 2000);
            }
        });
    }

    function setupCall(call) {
        currentCall = call;
        welcomeMessage.style.display = 'none';
        callView.style.display = 'block';
        inCallControls.style.display = 'flex';
        sidebar.style.display = 'none';
        call.on('stream', (remoteStream) => { remoteVideo.srcObject = remoteStream; });
        call.on('close', endCall);
        call.on('error', endCall);
    }

    function endCall() {
        if (currentCall) {
            if (dataConnection && dataConnection.open) dataConnection.close();
            dataConnection = null;
            currentCall.close();
            currentCall = null;
        }
        callView.style.display = 'none';
        inCallControls.style.display = 'none';
        sidebar.style.display = 'flex';
        if (chatView.style.display !== 'flex') welcomeMessage.style.display = 'block';
        remoteVideo.srcObject = null;
    }

    async function startCall(username, video = true) {
        try {
            const userQuery = query(collection(db, "users"), where("username", "==", username.toLowerCase()));
            const userSnapshot = await getDocs(userQuery);
            if (userSnapshot.empty) return alert("لم يتم العثور على مستخدم بهذا الاسم.");
            const userId = userSnapshot.docs[0].id;
            const presenceDoc = await getDoc(doc(db, "presence", userId));
            if (!presenceDoc.exists() || presenceDoc.data().status !== 'online') return alert("هذا المستخدم غير متصل حالياً.");
            
            const stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
            localVideo.srcObject = stream;
            localStream = stream;
            
            const call = peer.call(presenceDoc.data().peerId, stream);
            setupCall(call);
        } catch (err) {
            console.error("Start call error:", err);
            alert("فشل بدء المكالمة. تأكد من أذونات الكاميرا/المايكروفون.");
        }
    }

    // --- UI & Helper Functions ---
    function appendMessage(sender, text, type, isSelf) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${type}`;
        let content = `<span>${text}</span>`;
        if (!isSelf) content = `<strong>${sender}</strong>` + content;
        messageElement.innerHTML = content;
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function showNotification(message) {
        const notificationElement = document.createElement('div');
        notificationElement.className = 'toast-notification';
        notificationElement.textContent = message;
        notificationContainer.appendChild(notificationElement);
        setTimeout(() => notificationElement.classList.add('show'), 100);
        setTimeout(() => {
            notificationElement.classList.remove('show');
            setTimeout(() => notificationElement.remove(), 500);
        }, 5000);
    }

    function openChatView(friendId, friendData) {
        welcomeMessage.style.display = 'none';
        callView.style.display = 'none';
        chatFriendAvatar.src = friendData.photoURL || 'https://via.placeholder.com/40';
        chatFriendName.textContent = friendData.username;
        const friendItem = document.querySelector(`.friend-item[data-uid="${friendId}"]`);
        chatFriendStatus.textContent = friendItem ? friendItem.querySelector('.status span').textContent : 'غير متصل';
        chatView.dataset.friendId = friendId;
        chatView.style.display = 'flex';
        messagesContainer.innerHTML = '';
        if (listeners.chat) listeners.chat();
        const chatId = [currentUser.uid, friendId].sort().join('_');
        const messagesRef = collection(db, "chats", chatId, "messages");
        const q = query(messagesRef, orderBy("createdAt", "asc"));
        listeners.chat = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const messageData = change.doc.data();
                    const isSelf = messageData.senderId === currentUser.uid;
                    appendMessage(isSelf ? 'أنا' : friendData.username, messageData.text, isSelf ? 'sent' : 'received', isSelf);
                }
            });
        });
        document.getElementById('chat-video-call-btn').onclick = () => startCall(friendData.username, true);
        document.getElementById('chat-voice-call-btn').onclick = () => startCall(friendData.username, false);
        getDoc(doc(db, "presence", friendId)).then(presenceDoc => {
            if (presenceDoc.exists() && presenceDoc.data().status === 'online') {
                if (!dataConnection || dataConnection.peer !== presenceDoc.data().peerId) {
                    dataConnection = peer.connect(presenceDoc.data().peerId);
                    setupDataConnectionListeners();
                }
            }
        });
    }

    // --- Friends System Functions ---
    async function searchUsers(searchTerm, resultsContainer) {
        resultsContainer.innerHTML = '';
        if (searchTerm.length < 3) return;
        const q = query(collection(db, "users"), where("username", ">=", searchTerm), where("username", "<=", searchTerm + '\uf8ff'));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach(doc => {
            if (doc.id === currentUser.uid) return;
            const userData = doc.data();
            const resultElement = document.createElement('div');
            resultElement.className = 'search-result';
            resultElement.innerHTML = `<img src="${userData.photoURL || 'https://via.placeholder.com/40'}" alt="${userData.username}"><span>${userData.username}</span><button data-uid="${doc.id}">إضافة</button>`;
            resultsContainer.appendChild(resultElement);
        });
        resultsContainer.querySelectorAll('button').forEach(button => button.addEventListener('click', (e) => sendFriendRequest(e.target.dataset.uid)));
    }
    async function sendFriendRequest(toUid) {
        if (currentUser.uid === toUid) return;
        const requestId = [currentUser.uid, toUid].sort().join('_');
        const requestRef = doc(db, "friend_requests", requestId);
        const requestSnap = await getDoc(requestRef);
        if (requestSnap.exists()) { return alert("طلب الصداقة تم إرساله بالفعل أو أنكم أصدقاء."); }
        await setDoc(requestRef, { from: currentUser.uid, to: toUid, status: 'pending', createdAt: serverTimestamp() });
        const fromUser = await getDoc(doc(db, "users", currentUser.uid));
        await addDoc(collection(db, "notifications"), { to: toUid, message: `لديك طلب صداقة جديد من ${fromUser.data().username}`, read: false, createdAt: serverTimestamp() });
        alert("تم إرسال طلب الصداقة.");
    }
    function listenForFriendRequests(requestsContainer) {
        if (!currentUser || !requestsContainer) return;
        const q = query(collection(db, "friend_requests"), where("to", "==", currentUser.uid), where("status", "==", "pending"));
        onSnapshot(q, async (snapshot) => {
            requestsContainer.innerHTML = '';
            for (const requestDoc of snapshot.docs) {
                const requestData = requestDoc.data();
                const fromUserDoc = await getDoc(doc(db, "users", requestData.from));
                if (!fromUserDoc.exists()) continue;
                const fromUserData = fromUserDoc.data();
                const requestElement = document.createElement('div');
                requestElement.className = 'request-item';
                requestElement.innerHTML = `<img src="${fromUserData.photoURL || 'https://via.placeholder.com/40'}" alt="${fromUserData.username}"><span>${fromUserData.username}</span><div class="actions"><button class="accept-btn" data-id="${requestDoc.id}" data-from="${requestData.from}">قبول</button><button class="reject-btn" data-id="${requestDoc.id}">رفض</button></div>`;
                requestsContainer.appendChild(requestElement);
            }
            requestsContainer.querySelectorAll('.accept-btn').forEach(btn => btn.addEventListener('click', (e) => acceptFriendRequest(e.target.dataset.id, e.target.dataset.from)));
            requestsContainer.querySelectorAll('.reject-btn').forEach(btn => btn.addEventListener('click', (e) => deleteFriendRequest(e.target.dataset.id)));
        });
    }
    async function acceptFriendRequest(requestId, fromUid) {
        const batch = writeBatch(db);
        batch.update(doc(db, "users", currentUser.uid), { friends: arrayUnion(fromUid) });
        batch.update(doc(db, "users", fromUid), { friends: arrayUnion(currentUser.uid) });
        batch.delete(doc(db, "friend_requests", requestId));
        const currentUserDoc = await getDoc(doc(db, "users", currentUser.uid));
        batch.set(doc(collection(db, "notifications")), { to: fromUid, message: `قبل ${currentUserDoc.data().username} طلب صداقتك.`, read: false, createdAt: serverTimestamp() });
        await batch.commit();
    }
    async function deleteFriendRequest(requestId) { await deleteDoc(doc(db, "friend_requests", requestId)); }
    async function removeFriend(friendUid) {
        await updateDoc(doc(db, "users", currentUser.uid), { friends: arrayRemove(friendUid) });
        await updateDoc(doc(db, "users", friendUid), { friends: arrayRemove(currentUser.uid) });
    }
    function listenForFriends() {
        if (!currentUser) return;
        const userRef = doc(db, "users", currentUser.uid);
        listeners.friends = onSnapshot(userRef, async (userDoc) => {
            if (!userDoc.exists() || !userDoc.data().friends) return;
            friendsList.innerHTML = '';
            for (const friendId of userDoc.data().friends) {
                const friendDoc = await getDoc(doc(db, "users", friendId));
                if (!friendDoc.exists()) continue;
                const friendData = friendDoc.data();
                const presenceDoc = await getDoc(doc(db, "presence", friendId));
                const isOnline = presenceDoc.exists() && presenceDoc.data().status === 'online';
                const friendElement = document.createElement('div');
                friendElement.className = 'friend-item';
                friendElement.dataset.uid = friendId;
                friendElement.dataset.username = friendData.username;
                friendElement.innerHTML = `<img src="${friendData.photoURL || 'https://via.placeholder.com/40'}" alt="${friendData.username}"><div class="info"><span>${friendData.username}</span><div class="status"><div class="status-dot ${isOnline ? 'online' : ''}"></div><span>${isOnline ? 'متصل' : 'غير متصل'}</span></div></div>`;
                friendsList.appendChild(friendElement);
            }
        });
    }
    function listenForNotifications() {
        if (!currentUser) return;
        const q = query(collection(db, "notifications"), where("to", "==", currentUser.uid), where("read", "==", false), orderBy("createdAt", "desc"), limit(1));
        listeners.notifications = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if (change.type === "added") {
                    const notification = change.doc.data();
                    showNotification(notification.message);
                    await updateDoc(doc(db, "notifications", change.doc.id), { read: true });
                }
            });
        });
    }
    function showSettingsModal(initialTab = 'profile') {
        const modalContent = settingsModal.querySelector('.modal-content');
        const user = auth.currentUser;
        modalContent.innerHTML = `<button class="modal-close-btn"><i class="gg-icon gg-close"></i></button><div class="tab-buttons"><button class="tab-btn ${initialTab === 'profile' ? 'active' : ''}" data-tab="profile-tab">الملف الشخصي</button><button class="tab-btn ${initialTab === 'add' ? 'active' : ''}" data-tab="add-friend-tab">إضافة صديق</button><button class="tab-btn ${initialTab === 'requests' ? 'active' : ''}" data-tab="requests-tab">الطلبات</button></div><div id="profile-tab" class="tab-content ${initialTab === 'profile' ? 'active' : ''}"><h2>الملف الشخصي</h2><div class="auth-form"><img src="${user.photoURL || 'https://via.placeholder.com/100'}" style="width:100px; height:100px; border-radius:50%; object-fit:cover; margin: 0 auto 10px;"><div class="profile-info"><h3>${user.displayName || user.email.split('@')[0]}</h3><button id="copy-username-btn" title="نسخ اسم المستخدم"><i class="gg-icon gg-copy"></i></button></div><label for="update-username" style="font-size: 0.9em; margin-bottom: 5px;">تعديل اسم المستخدم:</label><input type="text" id="update-username" placeholder="أدخل الاسم الجديد هنا"><input type="file" id="update-avatar" accept="image/*"><button id="save-profile-btn">حفظ التغييرات</button><button id="logout-btn" style="background-color: var(--red); margin-top: 10px;">تسجيل الخروج</button></div></div><div id="add-friend-tab" class="tab-content ${initialTab === 'add' ? 'active' : ''}"><h2>إضافة صديق</h2><input type="text" id="search-user-input" placeholder="ابحث باسم المستخدم..." class="auth-form" style="width:100%; box-sizing: border-box;"><div id="search-results-list" style="margin-top: 15px;"></div></div><div id="requests-tab" class="tab-content ${initialTab === 'requests' ? 'active' : ''}"><h2>طلبات الصداقة</h2><div id="requests-list"></div></div>`;
        settingsModal.style.display = 'flex';
        settingsModal.querySelector('.modal-close-btn').addEventListener('click', () => settingsModal.style.display = 'none');
        settingsModal.querySelector('#logout-btn').addEventListener('click', handleLogout);
        settingsModal.querySelector('#save-profile-btn').addEventListener('click', handleProfileUpdate);
        settingsModal.querySelector('#copy-username-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(user.displayName || user.email.split('@')[0]);
            showNotification(`تم نسخ اسم المستخدم`);
        });
        const searchInput = settingsModal.querySelector('#search-user-input');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('keyup', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => searchUsers(e.target.value.trim().toLowerCase(), settingsModal.querySelector('#search-results-list')), 500);
            });
        }
        settingsModal.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                settingsModal.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
                btn.classList.add('active');
                settingsModal.querySelector(`#${btn.dataset.tab}`).classList.add('active');
            });
        });
        const requestsContainer = settingsModal.querySelector('#requests-list');
        if (requestsContainer) listenForFriendRequests(requestsContainer);
    }
    async function handleProfileUpdate() {
        const newUsername = document.getElementById('update-username').value.trim().toLowerCase();
        const newAvatarFile = document.getElementById('update-avatar').files[0];
        const user = auth.currentUser;
        let updates = {};
        let authUpdates = {};
        if (newUsername && newUsername !== user.displayName) {
            const q = query(collection(db, "users"), where("username", "==", newUsername));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) { return alert("اسم المستخدم هذا مستخدم بالفعل."); }
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
        if (Object.keys(updates).length > 0) await updateDoc(doc(db, "users", user.uid), updates);
        if (Object.keys(authUpdates).length > 0) await updateProfile(user, authUpdates);
        alert("تم تحديث الملف الشخصي بنجاح!");
        settingsModal.style.display = 'none';
    }

    // --- 4. Event Listeners ---
    // **الحل النهائي: ربط الأحداث مباشرة عند تحميل الصفحة**
    loginForm.addEventListener('submit', handleLogin);
    signupForm.addEventListener('submit', handleSignup);
    toggleToSignup.addEventListener('click', () => {
        loginForm.style.display = 'none';
        signupForm.style.display = 'flex';
        document.getElementById('signup-error').textContent = '';
        authError.textContent = '';
    });
    toggleToLogin.addEventListener('click', () => {
        signupForm.style.display = 'none';
        loginForm.style.display = 'flex';
        authError.textContent = '';
    });
    // The forgot password listener is added in the final block
    friendsList.addEventListener('click', (e) => {
        const friendItem = e.target.closest('.friend-item');
        if (!friendItem) return;
        const { uid, username } = friendItem.dataset;
        friendContextMenu.style.display = 'block';
        friendContextMenu.style.top = `${e.clientY}px`;
        friendContextMenu.style.right = `${window.innerWidth - e.clientX}px`;
        document.getElementById('context-menu-video-call').onclick = () => startCall(username, true);
        document.getElementById('context-menu-voice-call').onclick = () => startCall(username, false);
        document.getElementById('context-menu-chat').onclick = async () => {
            const friendDoc = await getDoc(doc(db, "users", uid));
            if (friendDoc.exists()) openChatView(uid, friendDoc.data());
        };
        document.getElementById('context-menu-remove').onclick = () => {
            if (confirm(`هل أنت متأكد من حذف ${username}؟`)) removeFriend(uid);
        };
    });
    document.addEventListener('click', (e) => {
        if (!friendContextMenu.contains(e.target) && !e.target.closest('.friend-item')) {
            friendContextMenu.style.display = 'none';
        }
        if (settingsModal.style.display === 'flex' && !settingsModal.querySelector('.modal-content').contains(e.target) && !e.target.closest('#settings-btn, #add-friend-btn')) {
            settingsModal.style.display = 'none';
        }
    });
    toggleMuteBtn.addEventListener('click', () => {
        if (!localStream) return;
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        toggleMuteBtn.querySelector('i').className = audioTrack.enabled ? 'gg-icon gg-mic' : 'gg-icon gg-mic-off';
    });
    toggleVideoBtn.addEventListener('click', () => {
        if (!localStream) return;
        const videoTrack = localStream.getVideoTracks()[0];
        videoTrack.enabled = !videoTrack.enabled;
        localVideo.style.display = videoTrack.enabled ? 'block' : 'none';
        toggleVideoBtn.querySelector('i').className = videoTrack.enabled ? 'gg-icon gg-camera' : 'gg-icon gg-no-camera';
    });
    toggleChatBtn.addEventListener('click', () => document.getElementById('chat-container').classList.toggle('visible'));
    endCallBtn.addEventListener('click', endCall);
    answerBtn.addEventListener('click', async () => {
        if (incomingCall) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                localVideo.srcObject = stream;
                localStream = stream;
                incomingCall.answer(stream);
                setupCall(incomingCall);
                incomingCallContainer.style.display = 'none';
                ringtone.pause();
                ringtone.currentTime = 0;
                incomingCall = null;
            } catch(err) {
                alert("فشل الرد على المكالمة. تأكد من أذونات الكاميرا/المايكروفون.");
            }
        }
    });
    rejectBtn.addEventListener('click', () => {
        if (incomingCall) {
            incomingCall.close();
            incomingCallContainer.style.display = 'none';
            ringtone.pause();
            ringtone.currentTime = 0;
            incomingCall = null;
        }
    });
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const messageText = chatInput.value.trim();
        const friendId = chatView.dataset.friendId;
        if (messageText && friendId) {
            const chatId = [currentUser.uid, friendId].sort().join('_');
            const messagesRef = collection(db, "chats", chatId, "messages");
            addDoc(messagesRef, { text: messageText, senderId: currentUser.uid, createdAt: serverTimestamp() });
            setDoc(doc(db, "chats", chatId), { participants: [currentUser.uid, friendId], lastMessage: { text: messageText, createdAt: serverTimestamp() } }, { merge: true });
            chatInput.value = '';
        }
    });
    settingsBtn.addEventListener('click', () => showSettingsModal('profile'));
    addFriendBtn.addEventListener('click', () => showSettingsModal('add'));
    chatInput.addEventListener('input', () => {
        if (dataConnection && dataConnection.open) {
            dataConnection.send({ type: 'typing', senderId: currentUser.uid });
        }
    });

    // Final event listener attachment
    document.getElementById('forgot-password').addEventListener('click', handlePasswordReset);

    // --- 5. App Initialization ---
    async function start() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            stream.getTracks().forEach(track => track.stop());
            initializePeer();
        } catch (err) {
            alert('فشل الوصول إلى الكاميرا أو المايكروفون. يرجى التأكد من منح الإذن وتحديث الصفحة.');
        }
    }

    onAuthStateChanged(auth, (user) => {
        if (user) { // المستخدم سجل دخوله
            if (user.emailVerified) { // وبريده الإلكتروني مفعل
                currentUser = user;
                sidebarAvatar.src = user.photoURL || 'https://via.placeholder.com/40';
                sidebarUsername.textContent = user.displayName;
                showApp();
                listenForFriends();
                listenForNotifications();
            } else { // المستخدم سجل دخوله لكن بريده غير مفعل
                currentUser = null;
                showVerificationScreen();
            }
        } else {
            currentUser = null;
            showAuth();
        }
    });
});
