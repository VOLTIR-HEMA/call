// 1. استيراد الوظائف الأساسية من Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js";

// 2. معلومات إعداد مشروعك من Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDvYc9qhzLizUTXRZOsOoqJenbgf1gdP78",
  authDomain: "calling-91b94.firebaseapp.com",
  projectId: "calling-91b94",
  storageBucket: "calling-91b94.appspot.com", // تأكد من أن هذا هو النطاق الصحيح
  messagingSenderId: "558871808940",
  appId: "1:558871808940:web:f0a659d8315c85a3aac809",
};

// 3. تهيئة خدمات Firebase وتصديرها
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);