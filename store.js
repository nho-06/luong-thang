import { firebaseConfig } from "./config.js";

const OWNER = "Tz9fec60iPXfg5gYPYycYxaFPwG3";

function checkPath(group, id) {
  if (
    !["jobs", "shifts"].includes(group) ||
    typeof id !== "string" ||
    !id ||
    /[.#$\[\]\/\u0000-\u001F\u007F]/.test(id)
  ) {
    throw new Error("Đường dẫn dữ liệu không hợp lệ.");
  }
}

export async function openStore(onData, onStatus, onAuthReady) {
  if (!firebaseConfig.apiKey || !firebaseConfig.databaseURL) {
    throw new Error("config.js cần có apiKey và databaseURL của dự án Firebase.");
  }

  onStatus("wait", "Đang kết nối Firebase…");

  let appSDK;
  let authSDK;
  let dbSDK;

  try {
    [appSDK, authSDK, dbSDK] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js")
    ]);
  } catch (error) {
    console.error("[Lương tháng] Lỗi tải Firebase SDK", error);
    throw new Error("Không tải được Firebase SDK từ www.gstatic.com. Xem lỗi gốc trong Console.");
  }

  const { initializeApp, getApps, getApp } = appSDK;
  const {
    getAuth,
    setPersistence,
    browserLocalPersistence,
    signInWithPopup,
    GoogleAuthProvider
  } = authSDK;
  const { getDatabase, ref, onValue, set, push } = dbSDK;

  const app = getApps().some(app => app.name === "[DEFAULT]")
    ? getApp()
    : initializeApp(firebaseConfig);

  if (
    app.options.projectId !== firebaseConfig.projectId ||
    app.options.apiKey !== firebaseConfig.apiKey
  ) {
    throw new Error("Ứng dụng đang dùng cấu hình Firebase khác config.js.");
  }

  const auth = getAuth(app);
  await setPersistence(auth, browserLocalPersistence);
  await auth.authStateReady();

  onAuthReady(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    await signInWithPopup(auth, provider);
    location.reload();
  }, auth.currentUser?.email);

  const user = auth.currentUser;

  if (!user) {
    onStatus("wait", "Đăng nhập Google để mở sổ");
    return null;
  }

  const db = getDatabase(app, firebaseConfig.databaseURL);
  const userPath = `users/${OWNER}`;
  const userRef = ref(db, userPath);

  let loaded = false;
  let failed = false;
  let connected = false;

  function showStatus() {
    if (failed) {
      onStatus("error", "Chưa mở được sổ");
    } else if (!connected) {
      onStatus("wait", "Đang chờ kết nối…");
    } else if (!loaded) {
      onStatus("wait", "Đang tải sổ cũ…");
    } else {
      onStatus("cloud", "Firebase · đã kết nối");
    }
  }

  const stopConnection = onValue(ref(db, ".info/connected"), snapshot => {
    connected = snapshot.val() === true;
    showStatus();
  });

  let stopData;

  try {
    await new Promise((resolve, reject) => {
      stopData = onValue(
        userRef,
        snapshot => {
          if (!snapshot.exists()) {
            failed = true;
            showStatus();
            reject(new Error("Không tìm thấy sổ cũ. Kiểm tra databaseURL và nhánh users trong Firebase."));
            return;
          }

          const value = snapshot.val();

          onData({
            jobs: value.jobs || {},
            shifts: value.shifts || {}
          });

          loaded = true;
          failed = false;
          showStatus();
          resolve();
        },
        error => {
          failed = true;
          showStatus();
          console.error("[Lương tháng] Lỗi đọc sổ", error);

          reject(new Error(
            `Firebase từ chối đọc sổ (${error.code || error.message}). ` +
            "Kiểm tra Gmail trong settings/ownerEmail và Rules đã Publish."
          ));
        }
      );
    });
  } catch (error) {
    stopConnection();
    stopData?.();
    throw error;
  }

  return {
    id: () => push(userRef).key,

    async put(group, id, value) {
      if (auth.currentUser?.uid !== user.uid) {
        throw new Error("Phiên đã thay đổi. Hãy tải lại trang.");
      }

      if (failed || !loaded) {
        throw new Error("Chưa có quyền truy cập sổ.");
      }

      checkPath(group, id);
      await set(ref(db, `${userPath}/${group}/${id}`), value);
    }
  };
}