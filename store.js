import { firebaseConfig } from "./config.js";

const LOCAL_KEY = "luong-thang-v1";

export async function openStore(onData, onStatus) {
  const hasFirebaseConfig =
    firebaseConfig.apiKey &&
    firebaseConfig.databaseURL;

  if (!hasFirebaseConfig) {
    return openLocalStore(onData, onStatus);
  }

  return openFirebaseStore(onData, onStatus);
}

function openLocalStore(onData, onStatus) {
  let data = {
    jobs: {},
    shifts: {}
  };

  try {
    const saved = localStorage.getItem(LOCAL_KEY);

    if (saved) {
      data = JSON.parse(saved);

      if (!data.jobs || !data.shifts) {
        throw new Error("Dữ liệu không hợp lệ.");
      }
    }
  } catch (error) {
    throw new Error(
      "Không đọc được dữ liệu trên máy. " +
      "Không ghi đè dữ liệu cũ. " +
      error.message
    );
  }

  onData(data);

  onStatus(
    "local",
    "Lưu trên máy · chưa nối Firebase"
  );

  return {
    id() {
      return crypto.randomUUID();
    },

    async put(group, id, value) {
      const next = structuredClone(data);

      if (value === null) {
        delete next[group][id];
      } else {
        next[group][id] = value;
      }

      // Chỉ cập nhật giao diện khi ghi thành công.
      localStorage.setItem(
        LOCAL_KEY,
        JSON.stringify(next)
      );

      data = next;
      onData(data);
    }
  };
}

async function openFirebaseStore(onData, onStatus) {
  onStatus("wait", "Đang kết nối Firebase…");

  const [
    appSDK,
    authSDK,
    databaseSDK
  ] = await Promise.all([
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

  const { initializeApp } = appSDK;

  const {
    getAuth,
    signInAnonymously,
    setPersistence,
    browserLocalPersistence
  } = authSDK;

  const {
    getDatabase,
    ref,
    onValue,
    set,
    push
  } = databaseSDK;

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);

  await setPersistence(
    auth,
    browserLocalPersistence
  );

  // Đợi Firebase khôi phục phiên cũ trước khi tạo phiên mới.
  await auth.authStateReady();

  const user = auth.currentUser ||
    (await signInAnonymously(auth)).user;

  const database = getDatabase(app);

  const userPath = `users/${user.uid}`;
  const userRef = ref(database, userPath);

  onValue(
    ref(database, ".info/connected"),
    snapshot => {
      const connected = snapshot.val();

      onStatus(
        connected ? "cloud" : "wait",

        connected
          ? "Firebase · đã kết nối"
          : "Mất mạng · đang chờ kết nối"
      );
    }
  );

  // Đợi lần đọc đầu tiên để tránh thao tác khi dữ liệu chưa tải.
  await new Promise((resolve, reject) => {
    let initial = true;

    onValue(
      userRef,

      snapshot => {
        const value = snapshot.val() || {};

        onData({
          jobs: value.jobs || {},
          shifts: value.shifts || {}
        });

        if (initial) {
          initial = false;
          resolve();
        }
      },

      error => {
        onStatus(
          "error",
          "Không đọc được dữ liệu Firebase"
        );

        if (initial) {
          initial = false;
          reject(error);
        }
      }
    );
  });

  return {
    id() {
      return push(userRef).key;
    },

    put(group, id, value) {
      const itemRef = ref(
        database,
        `${userPath}/${group}/${id}`
      );

      return set(itemRef, value);
    }
  };
}