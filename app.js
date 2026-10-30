import { openStore } from "./store.js";

import {
  makeShift,
  monthRows,
  summarize,
  currency,
  duration
} from "./core.js";

const el = id => document.getElementById(id);

function setText(id, value) {
  el(id).textContent = value;
}

let data = {
  jobs: {},
  shifts: {}
};

let store = null;

let editingShift = null;
let editingJob = null;
let busy = false;

function today() {
  const date = new Date();

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function escapeHTML(value) {
  const characters = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };

  return String(value ?? "").replace(
    /[&<>"']/g,
    character => characters[character]
  );
}

function notice(message, success = false) {
  const element = el("notice");

  element.textContent = message;
  element.classList.toggle("success", success);
  element.hidden = false;
}

function updateOptions(
  select,
  placeholder,
  jobs
) {
  const previous = select.value;

  select.replaceChildren(
    new Option(placeholder, ""),

    ...jobs.map(([id, job]) => {
      return new Option(job.name, id);
    })
  );

  select.value = previous;
}

function render() {
  const month = el("month").value;

  if (!month) {
    return;
  }

  setText(
    "month-label",
    `Sổ lương tháng ${Number(month.slice(5))} / ${month.slice(0, 4)}`
  );

  const allRows = monthRows(
    data.shifts,
    month
  );

  const summary = summarize(allRows);

  setText("total", currency(summary.pay));
  setText("hours", duration(summary.minutes));
  setText("count", summary.count);

  const workingJobs = new Set(
    allRows.map(shift => shift.jobId)
  );

  setText(
    "job-count",
    `${workingJobs.size} công việc có ca trong tháng`
  );

  const jobs = Object.entries(data.jobs)
    .sort((a, b) => {
      return a[1].name.localeCompare(
        b[1].name,
        "vi"
      );
    });

  updateOptions(
    el("job"),
    "Chọn công việc",
    jobs
  );

  updateOptions(
    el("filter"),
    "Tất cả công việc",
    jobs
  );

  el("jobs-empty").hidden = jobs.length > 0;

  el("jobs").innerHTML = jobs.map(([id, job]) => {
    const jobRows = allRows.filter(shift => {
      return shift.jobId === id;
    });

    const total = summarize(jobRows);

    return `
      <div class="job-card">
        <span class="job-dot"></span>

        <div class="job-info">
          <strong>
            ${escapeHTML(job.name)}
          </strong>

          <small>
            ${currency(job.rate)} / giờ
          </small>
        </div>

        <div class="job-money">
          ${currency(total.pay)}

          <small>
            ${total.count} ca ·
            ${duration(total.minutes)}
          </small>
        </div>

        <div class="job-actions">
          <button
            class="text-btn"
            data-edit-job="${escapeHTML(id)}"
          >
            Sửa
          </button>

          <button
            class="text-btn"
            data-delete-job="${escapeHTML(id)}"
          >
            Xóa
          </button>
        </div>
      </div>
    `;
  }).join("");

  const filteredRows = monthRows(
    data.shifts,
    month,
    el("filter").value
  );

  el("table").hidden = filteredRows.length === 0;

  el("history-empty").hidden =
    filteredRows.length > 0;

  el("rows").innerHTML = filteredRows
    .map(shift => {
      const formattedDate = shift.date
        .split("-")
        .reverse()
        .join("/");

      const restText = shift.rest
        ? ` · nghỉ ${shift.rest}p`
        : "";

      const overnight = shift.end < shift.start
        ? " · qua đêm"
        : "";

      return `
        <tr>
          <td>
            <strong>
              ${escapeHTML(formattedDate)}
            </strong>

            <small>
              ${escapeHTML(shift.jobName)}
            </small>

            ${
              shift.note
                ? `
                  <small>
                    ${escapeHTML(shift.note)}
                  </small>
                `
                : ""
            }
          </td>

          <td>
            ${escapeHTML(shift.start)}
            –
            ${escapeHTML(shift.end)}

            <small>
              ${duration(shift.minutes)}
              ${restText}
              ${overnight}
            </small>
          </td>

          <td>
            ${currency(shift.pay)}

            <small>
              ${currency(shift.rate)}/giờ
            </small>
          </td>

          <td>
            <button
              class="text-btn"
              data-edit-shift="${escapeHTML(shift.id)}"
            >
              Sửa
            </button>

            <button
              class="text-btn"
              data-delete-shift="${escapeHTML(shift.id)}"
            >
              Xóa
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  setText(
    "filtered-total",
    currency(summarize(filteredRows).pay)
  );
}

function getShiftFromForm() {
  const jobId = el("job").value;
  const job = data.jobs[jobId];

  return makeShift({
    jobId,
    jobName: job?.name,

    date: el("date").value,
    start: el("start").value,
    end: el("end").value,

    rest: el("rest").value,
    rate: el("rate").value,

    note: el("note").value
  });
}

function updateEstimate() {
  try {
    const shift = getShiftFromForm();

    setText(
      "estimate-time",
      `${duration(shift.minutes)} thực làm`
    );

    setText(
      "estimate-pay",
      currency(shift.pay)
    );
  } catch (error) {
    const hasTimes =
      el("start").value &&
      el("end").value;

    setText(
      "estimate-time",
      hasTimes
        ? error.message
        : "Nhập giờ để xem tiền ca"
    );

    setText("estimate-pay", "—");
  }
}

function resetShiftForm() {
  editingShift = null;

  el("shift-form").reset();
  el("date").value = today();

  setText(
    "shift-title",
    "Ghi lại một ca làm"
  );

  setText(
    "save-shift",
    "+ Lưu ca làm"
  );

  el("cancel-edit").hidden = true;

  updateEstimate();
}

async function mutate(action, message) {
  if (busy || !store) {
    return false;
  }

  busy = true;

  el("shift-fields").disabled = true;
  el("save-job").disabled = true;

  setText("save-shift", "Đang lưu…");

  try {
    await action();

    notice(message, true);

    return true;
  } catch (error) {
    notice(
      "Chưa lưu được: " + error.message
    );

    return false;
  } finally {
    busy = false;

    el("shift-fields").disabled = false;
    el("save-job").disabled = false;

    setText(
      "save-shift",
      editingShift
        ? "Lưu thay đổi"
        : "+ Lưu ca làm"
    );
  }
}

// Giá trị ban đầu.
el("month").value = today().slice(0, 7);
el("date").value = today();

el("month").addEventListener("change", () => {
  if (!el("month").value) {
    el("month").value = today().slice(0, 7);
  }

  render();
});

el("filter").addEventListener(
  "change",
  render
);

el("job").addEventListener("change", () => {
  const selectedJob =
    data.jobs[el("job").value];

  el("rate").value = selectedJob?.rate || "";

  updateEstimate();
});

el("shift-form").addEventListener(
  "input",
  updateEstimate
);

el("cancel-edit").addEventListener(
  "click",
  () => {
    if (!busy) {
      resetShiftForm();
    }
  }
);

// Thêm hoặc sửa ca làm.
el("shift-form").addEventListener(
  "submit",

  async event => {
    event.preventDefault();

    if (busy || !store) {
      return;
    }

    try {
      const shift = getShiftFromForm();
      const id = editingShift || store.id();

      const saved = await mutate(
        () => store.put("shifts", id, shift),
        "Đã lưu ca làm."
      );

      if (saved) {
        el("month").value =
          shift.date.slice(0, 7);

        el("filter").value = "";

        resetShiftForm();
        render();
      }
    } catch (error) {
      notice(error.message);
    }
  }
);

function showJobDialog(id = null) {
  if (busy || !store) {
    return;
  }

  editingJob = id;

  const job = data.jobs[id];

  setText(
    "job-title",
    job
      ? "Sửa công việc"
      : "Thêm công việc"
  );

  el("job-name").value = job?.name || "";
  el("job-rate").value = job?.rate || "";

  el("job-dialog").showModal();
}

el("add-job").addEventListener(
  "click",
  () => showJobDialog()
);

el("close-dialog").addEventListener(
  "click",
  () => {
    if (!busy) {
      el("job-dialog").close();
    }
  }
);

el("job-dialog").addEventListener(
  "cancel",
  event => {
    if (busy) {
      event.preventDefault();
    }
  }
);

// Thêm hoặc sửa công việc.
el("job-form").addEventListener(
  "submit",

  async event => {
    event.preventDefault();

    if (!store || busy) {
      return;
    }

    const name =
      el("job-name").value.trim();

    const rate =
      Number(el("job-rate").value);

    if (
      !name ||
      !Number.isSafeInteger(rate) ||
      rate <= 0 ||
      rate > 100000000
    ) {
      notice(
        "Nhập tên và lương giờ hợp lệ."
      );

      return;
    }

    const duplicate = Object.entries(data.jobs)
      .some(([id, job]) => {
        return (
          id !== editingJob &&
          job.name.toLocaleLowerCase("vi") ===
            name.toLocaleLowerCase("vi")
        );
      });

    if (duplicate) {
      notice(
        "Tên công việc này đã có."
      );

      return;
    }

    const id = editingJob || store.id();

    const saved = await mutate(
      () => {
        return store.put(
          "jobs",
          id,
          { name, rate }
        );
      },

      "Đã lưu công việc."
    );

    if (saved) {
      el("job-dialog").close();

      if (!editingShift) {
        el("job").value = id;
        el("rate").value = rate;

        updateEstimate();
      }
    }
  }
);

// Các nút sửa/xóa trong danh sách.
document.addEventListener(
  "click",

  async event => {
    const button = event.target.closest("button");

    if (!button || busy || !store) {
      return;
    }

    if (button.dataset.editJob) {
      showJobDialog(
        button.dataset.editJob
      );

      return;
    }

    if (button.dataset.deleteJob) {
      const id = button.dataset.deleteJob;

      const hasShifts = Object.values(data.shifts)
        .some(shift => shift.jobId === id);

      if (hasShifts) {
        notice(
          "Công việc này có lịch sử ca làm. " +
          "Chỉ xóa được sau khi xóa các ca của công việc."
        );

        return;
      }

      if (confirm("Xóa công việc này?")) {
        await mutate(
          () => store.put("jobs", id, null),
          "Đã xóa công việc."
        );
      }

      return;
    }

    if (button.dataset.editShift) {
      const id = button.dataset.editShift;
      const shift = data.shifts[id];

      if (!shift) {
        return;
      }

      editingShift = id;

      el("job").value = shift.jobId;

      const fields = [
        "date",
        "start",
        "end",
        "rest",
        "rate",
        "note"
      ];

      for (const field of fields) {
        el(field).value = shift[field] ?? "";
      }

      setText("shift-title", "Sửa ca làm");
      setText("save-shift", "Lưu thay đổi");

      el("cancel-edit").hidden = false;

      updateEstimate();

      el("shift-form").scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      return;
    }

    if (button.dataset.deleteShift) {
      const id = button.dataset.deleteShift;

      if (!confirm("Xóa ca làm này?")) {
        return;
      }

      const deleted = await mutate(
        () => store.put("shifts", id, null),
        "Đã xóa ca làm."
      );

      if (
        deleted &&
        editingShift === id
      ) {
        resetShiftForm();
      }
    }
  }
);

function download(content, name, type) {
  const blob = new Blob(
    [content],
    { type }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = name;
  link.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1500);
}

// Xuất toàn bộ dữ liệu dự phòng.
el("backup").addEventListener(
  "click",

  () => {
    if (!store) {
      return;
    }

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),

      ...data
    };

    download(
      JSON.stringify(backup, null, 2),

      `sao-luu-luong-${today()}.json`,

      "application/json"
    );
  }
);

// Xuất các ca theo tháng và bộ lọc hiện tại.
el("export").addEventListener(
  "click",

  () => {
    if (!store) {
      return;
    }

    const rows = monthRows(
      data.shifts,
      el("month").value,
      el("filter").value
    );

    if (!rows.length) {
      notice(
        "Chưa có ca làm để xuất."
      );

      return;
    }

    function csvCell(value) {
      let text = String(value ?? "");

      // Tránh nội dung ghi chú bị Excel hiểu là công thức.
      if (/^[=+@\-\t\r]/.test(text)) {
        text = "'" + text;
      }

      return (
        '"' +
        text.replaceAll('"', '""') +
        '"'
      );
    }

    const matrix = [
      [
        "Ngày",
        "Công việc",
        "Giờ vào",
        "Giờ ra",
        "Nghỉ (phút)",
        "Thực làm (phút)",
        "Lương giờ",
        "Tiền công",
        "Ghi chú"
      ],

      ...rows.map(shift => [
        shift.date,
        shift.jobName,
        shift.start,
        shift.end,
        shift.rest,
        shift.minutes,
        shift.rate,
        shift.pay,
        shift.note
      ])
    ];

    const csv = "\uFEFF" + matrix
      .map(row => {
        return row.map(csvCell).join(",");
      })
      .join("\r\n");

    download(
      csv,

      `luong-${el("month").value}.csv`,

      "text/csv;charset=utf-8"
    );
  }
);

// Mở dữ liệu.
openStore(
  value => {
    data = value;
    render();
  },

  (kind, message) => {
    el("status").dataset.kind = kind;
    setText("status", message);
  }
)
  .then(value => {
    store = value;

    el("shift-fields").disabled = false;
    el("add-job").disabled = false;
  })

  .catch(error => {
    setText(
      "status",
      "Chưa kết nối được"
    );

    el("status").dataset.kind = "error";

    notice(
      "Chưa mở được dữ liệu. " +
      "Kiểm tra cấu hình Firebase, bật Anonymous " +
      "và áp dụng Database Rules. " +
      error.message
    );
  });

render();