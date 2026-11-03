import { firebaseConfig } from "./config.js";

const OWNER = "Tz9fec60iPXfg5gYPYycYxaFPwG3";
const LOCAL_KEY = "luong-thang-v1";

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
    let data = { jobs: {}, shifts: {} };
    const raw = localStorage.getItem(LOCAL_KEY);

    if (raw) {
      data = JSON.parse(raw);
      if (!data?.jobs || !data?.shifts) {
        throw new Error("Không đọc được dữ liệu lưu trên máy.");
      }
    }

    onData(data);
    onStatus("local", "Lưu trên máy · chưa nối Firebase");

    return {
      id: () => crypto.randomUUID(),

      async put(group, id, value) {
        checkPath(group, id);

        const next = structuredClone(data);
        if (value === null) {
          delete next[group][id];
        } else {
          next[group][id] = value;
        }

        localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
        data = next;
        onData(data);
      }
    };
  }

  onStatus("wait", "Đang kết nối Firebase…");

  const [appSDK, authSDK, dbSDK] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js")
  ]);

  const { initializeApp, getApps, getApp } = appSDK;
  const {
    getAuth,
    setPersistence,
    browserLocalPersistence,
    signInWithPopup,
    GoogleAuthProvider
  } = authSDK;
  const { getDatabase, ref, onValue, set, push } = dbSDK;

  const app = getApps().some((app) => app.name === "[DEFAULT]")
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

  console.info("[Lương tháng] Kết nối Firebase", {
    projectId: app.options.projectId,
    uid: user.uid,
    dataOwnerUid: OWNER,
    path: userPath,
    origin: location.origin
  });

  let loaded = false;
  let failed = false;
  let connected = false;

  function showStatus() {
    if (failed) {
      onStatus("error", "Chưa có quyền mở sổ");
    } else if (!connected) {
      onStatus("wait", "Đang chờ kết nối…");
    } else if (!loaded) {
      onStatus("wait", "Đang tải sổ cũ…");
    } else {
      onStatus("cloud", "Firebase · đã kết nối");
    }
  }

  const stopConnection = onValue(ref(db, ".info/connected"), (snapshot) => {
    connected = snapshot.val() === true;
    showStatus();
  });

  let stopData;

  try {
    await new Promise((resolve, reject) => {
      let initial = true;

      stopData = onValue(
        userRef,
        (snapshot) => {
          if (!snapshot.exists()) {
            failed = true;
            showStatus();

            if (initial) {
              initial = false;
              reject(new Error("Không tìm thấy sổ cũ. Kiểm tra UID gốc trong Firebase; không tạo lại dữ liệu."));
            }
            return;
          }

          const value = snapshot.val();
          loaded = true;
          failed = false;
          onData({
            jobs: value.jobs || {},
            shifts: value.shifts || {}
          });
          showStatus();

          if (initial) {
            initial = false;
            resolve();
          }
        },
        (error) => {
          failed = true;
          showStatus();
          console.error("[Lương tháng] Lỗi đọc sổ", error.code, user.uid);

          if (initial) {
            initial = false;
            reject(new Error("Chưa có quyền mở sổ. Chọn đúng Gmail đã đặt tại settings/ownerEmail và kiểm tra Rules đã Publish."));
          }
        }
      );
    });
  } catch (error) {
    stopConnection();
    if (stopData) stopData();
    throw error;
  }

  function ensureSession() {
    if (auth.currentUser?.uid !== user.uid) {
      throw new Error("Phiên đã thay đổi. Hãy tải lại trang.");
    }
    if (failed || !loaded) {
      throw new Error("Chưa có quyền truy cập sổ.");
    }
  }

  return {
    id: () => push(userRef).key,

    async put(group, id, value) {
      ensureSession();
      checkPath(group, id);
      await set(ref(db, `${userPath}/${group}/${id}`), value);
    }
  };
}