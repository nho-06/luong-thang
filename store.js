import { firebaseConfig } from "./config.js";

const OWNER = "Tz9fec60iPXfg5gYPYycYxaFPwG3";
const RECOVERY = "FuobH1tYNpWKuUgB9fayopmUSjz1";

const WEB_URL = "https://nho-06.github.io/luong-thang/";
const LOCAL_KEY = "luong-thang-v1";

export function parseJoinCode(value) {
  const text = String(value || "").trim();

  if (/^[a-f0-9]{48}$/.test(text)) {
    return text;
  }

  try {
    const url = new URL(text, "https://example.invalid/");

    const code = new URLSearchParams(
      url.hash.slice(1)
    ).get("join");

    return /^[a-f0-9]{48}$/.test(code || "")
      ? code
      : null;
  } catch {
    return null;
  }
}

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

export async function openStore(onData, onStatus) {
  if (
    !firebaseConfig.apiKey ||
    !firebaseConfig.databaseURL
  ) {
    let data = { jobs: {}, shifts: {} };

    const raw = localStorage.getItem(LOCAL_KEY);

    if (raw) {
      data = JSON.parse(raw);

      if (!data?.jobs || !data?.shifts) {
        throw new Error(
          "Không đọc được dữ liệu lưu trên máy."
        );
      }
    }

    onData(data);

    onStatus(
      "local",
      "Lưu trên máy · chưa nối Firebase"
    );

    return {
      canShare: false,

      id: () => crypto.randomUUID(),

      async put(group, id, value) {
        checkPath(group, id);

        const next = structuredClone(data);

        if (value === null) {
          delete next[group][id];
        } else {
          next[group][id] = value;
        }

        localStorage.setItem(
          LOCAL_KEY,
          JSON.stringify(next)
        );

        data = next;
        onData(data);
      }
    };
  }

  onStatus("wait", "Đang kết nối Firebase…");

  const [appSDK, authSDK, dbSDK] = await Promise.all([
    import(
      "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js"
    ),
    import(
      "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js"
    ),
    import(
      "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js"
    )
  ]);

  const {
    initializeApp,
    getApps,
    getApp
  } = appSDK;

  const {
    getAuth,
    setPersistence,
    browserLocalPersistence,
    signInAnonymously
  } = authSDK;

  const {
    getDatabase,
    ref,
    onValue,
    get,
    set,
    push,
    update,
    remove,
    serverTimestamp
  } = dbSDK;

  const app = getApps().some(
    item => item.name === "[DEFAULT]"
  )
    ? getApp()
    : initializeApp(firebaseConfig);

  if (
    app.options.projectId !== firebaseConfig.projectId ||
    app.options.apiKey !== firebaseConfig.apiKey
  ) {
    throw new Error(
      "Ứng dụng đang dùng cấu hình Firebase khác config.js."
    );
  }

  const auth = getAuth(app);

  await setPersistence(
    auth,
    browserLocalPersistence
  );

  await auth.authStateReady();

  const user = auth.currentUser ||
    (await signInAnonymously(auth)).user;

  await user.getIdToken(true);

  const db = getDatabase(
    app,
    firebaseConfig.databaseURL
  );

  const userPath = `users/${OWNER}`;
  const userRef = ref(db, userPath);

  const canShare = [OWNER, RECOVERY].includes(user.uid);

  let joinCode = parseJoinCode(location.href);

  const joinRequested = new URLSearchParams(
    location.hash.slice(1)
  ).has("join");

  if (joinRequested && !joinCode) {
    throw new Error(
      "Link mở sổ không hợp lệ. Hãy sao chép đầy đủ link riêng."
    );
  }

  // Thiết bị mới mở link riêng để được cấp quyền.
  if (joinCode) {
    onStatus(
      "wait",
      "Đang liên kết thiết bị với sổ cũ…"
    );

    let invitation;

    try {
      invitation = await get(
        ref(db, `accessCodes/${joinCode}`)
      );
    } catch {
      throw new Error(
        "Link riêng đã bị thu hồi, không hợp lệ " +
        "hoặc Rules mới chưa được Publish."
      );
    }

    if (
      !invitation.exists() ||
      invitation.val().ownerUid !== OWNER
    ) {
      throw new Error(
        "Không tìm thấy link mở sổ hợp lệ."
      );
    }

    await set(
      ref(db, `members/${OWNER}/${user.uid}`),
      { code: joinCode }
    );

    // Xóa mã khỏi thanh địa chỉ sau khi liên kết thành công.
    const cleanURL = new URL(location.href);
    cleanURL.hash = "";

    history.replaceState(
      null,
      "",
      cleanURL.pathname + cleanURL.search
    );

    joinCode = null;
  }

  console.info(
    "[Lương tháng] Kết nối Firebase",
    {
      projectId: app.options.projectId,
      uid: user.uid,
      dataOwnerUid: OWNER,
      path: userPath,
      origin: location.origin
    }
  );

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

  const stopConnection = onValue(
    ref(db, ".info/connected"),
    snapshot => {
      connected = snapshot.val() === true;
      showStatus();
    }
  );

  let stopData;

  try {
    await new Promise((resolve, reject) => {
      let initial = true;

      stopData = onValue(
        userRef,

        snapshot => {
          if (!snapshot.exists()) {
            failed = true;
            showStatus();

            if (initial) {
              initial = false;

              reject(
                new Error(
                  "Không tìm thấy sổ cũ. " +
                  "Kiểm tra UID gốc trong Firebase; " +
                  "không tạo lại dữ liệu."
                )
              );
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

        error => {
          failed = true;
          showStatus();

          console.error(
            "[Lương tháng] Lỗi đọc sổ",
            error.code,
            user.uid
          );

          if (initial) {
            initial = false;

            reject(
              new Error(
                "Chưa có quyền mở sổ. Trên thiết bị mới, " +
                "mở link riêng do máy đã có dữ liệu tạo. " +
                "Nếu đang ở máy gốc, kiểm tra Rules đã Publish."
              )
            );
          }
        }
      );
    });
  } catch (error) {
    stopConnection();

    if (stopData) {
      stopData();
    }

    throw error;
  }

  function ensureSession() {
    if (auth.currentUser?.uid !== user.uid) {
      throw new Error(
        "Phiên đã thay đổi. Hãy tải lại trang."
      );
    }

    if (failed || !loaded) {
      throw new Error(
        "Chưa có quyền truy cập sổ."
      );
    }
  }

  return {
    canShare,

    id: () => push(userRef).key,

    async put(group, id, value) {
      ensureSession();
      checkPath(group, id);

      await set(
        ref(db, `${userPath}/${group}/${id}`),
        value
      );
    },

    async createShareLink() {
      ensureSession();

      if (!canShare) {
        throw new Error(
          "Chỉ máy gốc được tạo link mới."
        );
      }

      const indexRef = ref(
        db,
        `shareIndex/${OWNER}`
      );

      const existing = await get(indexRef);

      let code = existing.val();

      if (!/^[a-f0-9]{48}$/.test(code || "")) {
        code = Array.from(
          crypto.getRandomValues(new Uint8Array(24)),
          byte => byte.toString(16).padStart(2, "0")
        ).join("");

        await update(ref(db), {
          [`accessCodes/${code}`]: {
            ownerUid: OWNER,
            createdAt: serverTimestamp()
          },

          [`shareIndex/${OWNER}`]: code
        });
      }

      const base = ["localhost", "127.0.0.1"].includes(
        location.hostname
      )
        ? WEB_URL
        : location.origin + location.pathname;

      return `${base}#join=${code}`;
    },

    async revokeShareLink() {
      ensureSession();

      if (!canShare) {
        throw new Error(
          "Chỉ máy gốc được thu hồi link."
        );
      }

      await remove(
        ref(db, `shareIndex/${OWNER}`)
      );
    }
  };
}