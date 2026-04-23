// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCGAi3ZqKsfxlkpxC-M53DQ3w30xTQ54OY",
  authDomain: "sustainopedia-1864e.firebaseapp.com",
  projectId: "sustainopedia-1864e",
  storageBucket: "sustainopedia-1864e.firebasestorage.app",
  messagingSenderId: "547746286414",
  appId: "1:547746286414:web:a8d3cda0697d44fa0f6c1f",
  measurementId: "G-R0JQWW87F7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);