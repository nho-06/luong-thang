import { initSchool } from "./school.js";
import { openStore } from "./store.js";
import {
  makeShift,
  monthRows,
  summarize,
  currency,
  duration
} from "./core.js";

const el = id => document.getElementById(id);

let data = {
  jobs: {},
  shifts: {},
  plans: {},
  studies: {}
};

let store = null;
let editingShift = null;
let editingJob = null;
let editingPlan = null;
let busy = false;
let planBusy = false;

const school = initSchool({
  getData: () => data,
  getStore: () => store,
  today
});

function setText(id, value) {
  el(id).textContent = value;
}

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

function updateOptions(select, placeholder, jobs) {
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
  renderWeek();

  const month = el("month").value;
  if (!month) return;

  setText(
    "month-label",
    `Sổ lương tháng ${Number(month.slice(5))} / ${month.slice(0, 4)}`
  );

  const allRows = monthRows(data.shifts, month);
  const summary = summarize(allRows);

  const workingJobs = new Set(
    allRows.map(shift => shift.jobId)
  );

  setText("total", currency(summary.pay));
  setText("hours", duration(summary.minutes));
  setText("count", summary.count);

  setText(
    "job-count",
    `${workingJobs.size} công việc có ca trong tháng`
  );

  const jobs = Object.entries(data.jobs).sort(
    (a, b) => a[1].name.localeCompare(b[1].name, "vi")
  );

  updateOptions(el("job"), "Chọn công việc", jobs);

  updateOptions(
    el("filter"),
    "Tất cả công việc",
    jobs
  );

  el("jobs-empty").hidden = jobs.length > 0;

  el("jobs").innerHTML = jobs.map(([id, job]) => {
    const jobRows = allRows.filter(
      shift => shift.jobId === id
    );

    const total = summarize(jobRows);

    return `
      <div class="job-card">
        <span class="job-dot"></span>

        <div class="job-info">
          <strong>${escapeHTML(job.name)}</strong>
          <small>
            Thường ${currency(job.rate)}/giờ ·
            Đêm ${currency(job.nightRate ?? job.rate)}/giờ
          </small>
        </div>

        <div class="job-money">
          ${currency(total.pay)}
          <small>
            ${total.count} ca · ${duration(total.minutes)}
          </small>
        </div>

        <div class="job-actions">
          <button
            type="button"
            class="text-btn"
            data-edit-job="${escapeHTML(id)}"
          >Sửa</button>

          <button
            type="button"
            class="text-btn"
            data-delete-job="${escapeHTML(id)}"
          >Xóa</button>
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
  el("history-empty").hidden = filteredRows.length > 0;

  el("rows").innerHTML = filteredRows.map(shift => {
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

    const rateDetails = shift.payMode === "split"
      ? `
          Thường ${duration(shift.dayMinutes)}
          × ${currency(shift.rate)}/giờ<br>
          Đêm ${duration(shift.nightMinutes)}
          × ${currency(shift.nightRate)}/giờ
        `
      : `${currency(shift.rate)}/giờ · ca cũ một mức`;

    return `
      <tr>
        <td>
          <strong>${escapeHTML(formattedDate)}</strong>
          <small>${escapeHTML(shift.jobName)}</small>
          ${
            shift.note
              ? `<small>${escapeHTML(shift.note)}</small>`
              : ""
          }
        </td>

        <td>
          ${escapeHTML(shift.start)} – ${escapeHTML(shift.end)}
          <small>
            ${duration(shift.minutes)}${restText}${overnight}
          </small>
        </td>

        <td>
          ${currency(shift.pay)}
          <small>${rateDetails}</small>
        </td>

        <td>
          <button
            type="button"
            class="text-btn"
            data-edit-shift="${escapeHTML(shift.id)}"
          >Sửa</button>

          <button
            type="button"
            class="text-btn"
            data-delete-shift="${escapeHTML(shift.id)}"
          >Xóa</button>
        </td>
      </tr>
    `;
  }).join("");

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
    payMode: el("use-night").checked
      ? "split"
      : "legacy",
    nightRate: el("night-rate").value,
    nightRest: el("night-rest").value,
    note: el("note").value
  });
}

function updateEstimate() {
  try {
    const shift = getShiftFromForm();

    setText(
      "estimate-time",
      shift.payMode === "split"
        ? `Thường ${duration(shift.dayMinutes)} · Đêm ${duration(shift.nightMinutes)}`
        : `${duration(shift.minutes)} thực làm · một mức`
    );

    setText("estimate-pay", currency(shift.pay));
  } catch (error) {
    const hasTimes =
      el("start").value && el("end").value;

    setText(
      "estimate-time",
      hasTimes
        ? error.message
        : "Nhập giờ để xem tiền ca"
    );

    setText("estimate-pay", "—");
  }
}

function updateNightFields() {
  const enabled = el("use-night").checked;

  el("night-fields").hidden = !enabled;
  el("night-rate").disabled = !enabled;
  el("night-rest").disabled = !enabled;

  setText(
    "rest-label",
    enabled
      ? "Nghỉ khung thường (phút)"
      : "Nghỉ cả ca (phút)"
  );
}

function resetShiftForm() {
  editingShift = null;

  el("shift-form").reset();
  el("date").value = today();
  el("legacy-hint").hidden = true;
  el("cancel-edit").hidden = true;

  updateNightFields();

  setText("shift-title", "Ghi lại một ca làm");
  setText("save-shift", "+ Lưu ca làm");

  updateEstimate();
}

async function mutate(action, message) {
  if (busy || !store) return false;

  busy = true;

  el("shift-fields").disabled = true;
  el("save-job").disabled = true;

  setText("save-shift", "Đang lưu…");

  try {
    await action();
    notice(message, true);
    return true;
  } catch (error) {
    notice("Chưa lưu được: " + error.message);
    return false;
  } finally {
    busy = false;

    el("shift-fields").disabled = false;
    el("save-job").disabled = false;

    setText(
      "save-shift",
      editingShift ? "Lưu thay đổi" : "+ Lưu ca làm"
    );
  }
}

el("month").value = today().slice(0, 7);
el("date").value = today();
el("week-date").value = today();
el("plan-date").value = today();

updateNightFields();

el("use-night").addEventListener("change", () => {
  updateNightFields();
  updateEstimate();
});

el("month").addEventListener("change", () => {
  if (!el("month").value) {
    el("month").value = today().slice(0, 7);
  }

  render();
});

el("filter").addEventListener("change", render);

el("job").addEventListener("change", () => {
  const selectedJob = data.jobs[el("job").value];

  el("rate").value = selectedJob?.rate || "";

  el("night-rate").value =
    selectedJob?.nightRate ??
    selectedJob?.rate ??
    "";

  updateEstimate();
});

el("shift-form").addEventListener(
  "input",
  updateEstimate
);

el("cancel-edit").addEventListener("click", () => {
  if (!busy) resetShiftForm();
});

el("shift-form").addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    if (busy || !store) return;

    try {
      const shift = getShiftFromForm();
      const id = editingShift || store.id();

      const saved = await mutate(
        () => store.put("shifts", id, shift),
        "Đã lưu ca làm."
      );

      if (saved) {
        el("month").value = shift.date.slice(0, 7);
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
  if (busy || !store) return;

  editingJob = id;

  const job = data.jobs[id];

  setText(
    "job-title",
    job ? "Sửa công việc" : "Thêm công việc"
  );

  el("job-name").value = job?.name || "";
  el("job-rate").value = job?.rate || "";

  el("job-night-rate").value =
    job?.nightRate ?? job?.rate ?? "";

  el("job-dialog").showModal();
}

el("add-job").addEventListener(
  "click",
  () => showJobDialog()
);

el("close-dialog").addEventListener("click", () => {
  if (!busy) el("job-dialog").close();
});

el("job-dialog").addEventListener(
  "cancel",
  event => {
    if (busy) event.preventDefault();
  }
);

el("job-form").addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    if (!store || busy) return;

    const name = el("job-name").value.trim();
    const rate = Number(el("job-rate").value);

    const nightRate = Number(
      el("job-night-rate").value
    );

    if (
      !name ||
      name.length > 60 ||
      !Number.isSafeInteger(rate) ||
      rate <= 0 ||
      rate > 100000000 ||
      !Number.isSafeInteger(nightRate) ||
      nightRate <= 0 ||
      nightRate > 100000000
    ) {
      notice("Nhập tên và lương giờ hợp lệ.");
      return;
    }

    const duplicate = Object.entries(data.jobs).some(
      ([id, job]) => {
        return (
          id !== editingJob &&
          job.name.toLocaleLowerCase("vi") ===
            name.toLocaleLowerCase("vi")
        );
      }
    );

    if (duplicate) {
      notice("Tên công việc này đã có.");
      return;
    }

    const id = editingJob || store.id();

    const saved = await mutate(
      () => store.put("jobs", id, {
        name,
        rate,
        nightRate
      }),
      "Đã lưu công việc."
    );

    if (saved) {
      el("job-dialog").close();

      if (!editingShift) {
        el("job").value = id;
        el("rate").value = rate;
        el("night-rate").value = nightRate;

        updateEstimate();
      }
    }
  }
);

document.addEventListener("click", async event => {
  const button = event.target.closest("button");

  if (!button || busy || !store) return;

  if (button.dataset.editJob) {
    showJobDialog(button.dataset.editJob);
    return;
  }

  if (button.dataset.deleteJob) {
    const id = button.dataset.deleteJob;

    const hasShifts = Object.values(data.shifts).some(
      shift => shift.jobId === id
    );

    const hasPlans = Object.values(
      data.plans || {}
    ).some(plan => plan.jobId === id);

    if (hasShifts || hasPlans) {
      notice(
        "Công việc này có ca làm hoặc lịch dự kiến. " +
        "Hãy xóa các ca liên quan trước khi xóa công việc."
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

    if (!shift) return;

    editingShift = id;

    el("job").value = shift.jobId;

    for (const field of [
      "date",
      "start",
      "end",
      "rate",
      "note"
    ]) {
      el(field).value = shift[field] ?? "";
    }

    el("use-night").checked =
      shift.payMode === "split";

    el("night-rate").value =
      shift.nightRate ?? shift.rate;

    el("rest").value = shift.payMode === "split"
      ? shift.dayRest
      : shift.rest;

    el("night-rest").value = shift.nightRest ?? 0;

    el("legacy-hint").hidden =
      shift.payMode === "split";

    el("cancel-edit").hidden = false;

    updateNightFields();

    setText("shift-title", "Sửa ca làm");
    setText("save-shift", "Lưu thay đổi");

    updateEstimate();

    el("shift-form").scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    return;
  }

  if (button.dataset.deleteShift) {
    const id = button.dataset.deleteShift;

    if (!confirm("Xóa ca làm này?")) return;

    const deleted = await mutate(
      () => store.put("shifts", id, null),
      "Đã xóa ca làm."
    );

    if (deleted && editingShift === id) {
      resetShiftForm();
    }
  }
});

function download(content, name, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = name;
  link.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1500);
}

el("backup").addEventListener("click", () => {
  if (!store) return;

  const backup = {
    version: 4,
    exportedAt: new Date().toISOString(),
    ...data
  };

  download(
    JSON.stringify(backup, null, 2),
    `sao-luu-luong-${today()}.json`,
    "application/json"
  );
});

el("export").addEventListener("click", () => {
  if (!store) return;

  const rows = monthRows(
    data.shifts,
    el("month").value,
    el("filter").value
  );

  if (!rows.length) {
    notice("Chưa có ca làm để xuất.");
    return;
  }

  function csvCell(value) {
    let text = String(value ?? "");

    if (/^[=+@\-\t\r]/.test(text)) {
      text = "'" + text;
    }

    return '"' + text.replaceAll('"', '""') + '"';
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
      "Ghi chú",
      "Lương đêm",
      "Phút thường",
      "Phút đêm",
      "Nghỉ thường",
      "Nghỉ đêm",
      "Cách tính"
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
      shift.note,
      shift.nightRate ?? "",
      shift.dayMinutes ?? "",
      shift.nightMinutes ?? "",
      shift.dayRest ?? "",
      shift.nightRest ?? "",
      shift.payMode === "split"
        ? "Hai mức"
        : "Một mức"
    ])
  ];

  const csv = "\uFEFF" + matrix.map(
    row => row.map(csvCell).join(",")
  ).join("\r\n");

  download(
    csv,
    `luong-${el("month").value}.csv`,
    "text/csv;charset=utf-8"
  );
});

function addDays(date, amount) {
  const value = new Date(date + "T12:00:00Z");

  value.setUTCDate(value.getUTCDate() + amount);

  return value.toISOString().slice(0, 10);
}

function monday(date) {
  const day = new Date(
    date + "T12:00:00Z"
  ).getUTCDay();

  return addDays(date, -((day + 6) % 7));
}

function calendarEntries() {
  const entries = {};

  for (const [id, shift] of Object.entries(
    data.shifts || {}
  )) {
    entries["shift-" + id] = {
      ...shift,
      source: "shift",
      sourceId: id
    };
  }

  for (const [id, plan] of Object.entries(
    data.plans || {}
  )) {
    entries["plan-" + id] = {
      ...plan,
      source: "plan",
      sourceId: id
    };
  }

  for (const [id, study] of Object.entries(
    data.studies || {}
  )) {
    entries["study-" + id] = {
      ...study,
      jobName: study.name,
      source: "study",
      sourceId: id
    };
  }

  return entries;
}

function weekSegments(entries, first) {
  const days = Array.from(
    { length: 7 },
    () => []
  );

  function minuteOfDay(time) {
    const [hours, minutes] = time
      .split(":")
      .map(Number);

    return hours * 60 + minutes;
  }

  for (const [id, entry] of Object.entries(
    entries || {}
  )) {
    const start = minuteOfDay(entry.start);
    const end = minuteOfDay(entry.end);

    const overnight = end < start;

    const parts = [
      {
        date: entry.date,
        start,
        end: overnight ? 1440 : end
      }
    ];

    if (overnight && end > 0) {
      parts.push({
        date: addDays(entry.date, 1),
        start: 0,
        end
      });
    }

    for (const part of parts) {
      const index = Math.round(
        (
          Date.parse(part.date + "T12:00:00Z") -
          Date.parse(first + "T12:00:00Z")
        ) / 86400000
      );

      if (
        index >= 0 &&
        index < 7 &&
        part.end > part.start
      ) {
        days[index].push({
          ...part,
          plan: entry,
          id,
          continued: part.date !== entry.date
        });
      }
    }
  }

  return days;
}

function renderWeek() {
  const first = monday(
    el("week-date").value || today()
  );

  const last = addDays(first, 6);
  const container = el("week-days");

  const previousScroll = container.querySelector(
    ".week-timeline-scroll"
  );

  const scrollTop =
    previousScroll?.scrollTop ?? 7 * 72;

  const scrollLeft =
    previousScroll?.scrollLeft ?? 0;

  updateOptions(
    el("plan-job"),
    "Chọn công việc",
    Object.entries(data.jobs)
  );

  const entries = calendarEntries();

  const weekRows = Object.values(entries).filter(
    entry => entry.date >= first && entry.date <= last
  );

  const recorded = summarize(
    weekRows.filter(row => row.source === "shift")
  );

  const planned = summarize(
    weekRows.filter(row => row.source === "plan")
  );

  const studyCount = weekRows.filter(
    row => row.source === "study"
  ).length;

  setText(
    "week-summary",
    first.split("-").reverse().join("/") +
    " – " +
    last.split("-").reverse().join("/") +
    " · Đã ghi " +
    recorded.count +
    " ca, " +
    duration(recorded.minutes) +
    ", " +
    currency(recorded.pay) +
    " · Dự kiến " +
    planned.count +
    " ca, " +
    duration(planned.minutes) +
    ", " +
    currency(planned.pay) +
    " · " +
    studyCount +
    " buổi học"
  );

  const names = [
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
    "Chủ nhật"
  ];

  const segments = weekSegments(entries, first);

  const headings = names.map((name, index) => {
    const date = addDays(first, index);

    return `
      <div class="week-column-heading">
        <strong>${name}</strong>
        <span>${date.slice(8)}/${date.slice(5, 7)}</span>
      </div>
    `;
  }).join("");

  const hours = Array.from(
    { length: 24 },
    (_, hour) => `
      <div
        class="week-hour"
        style="top:${hour * 72}px"
      >
        ${String(hour).padStart(2, "0")}:00
      </div>
    `
  ).join("");

  const columns = segments.map((rows, index) => {
    rows.sort(
      (a, b) => a.start - b.start || b.end - a.end
    );

    const laneEnds = [];

    const placed = rows.map(row => {
      let lane = laneEnds.findIndex(
        end => end <= row.start
      );

      if (lane === -1) {
        lane = laneEnds.length;
      }

      laneEnds[lane] = Math.max(
        row.end,
        row.start + 7
      );

      return { ...row, lane };
    });

    const laneCount = Math.max(1, laneEnds.length);

    const blocks = placed.map(row => {
      const entry = row.plan;

      const label =
        entry.jobName +
        " · " +
        entry.start +
        "–" +
        entry.end;

      const editAttribute = {
        shift: "data-edit-shift",
        plan: "data-plan-edit",
        study: "data-school-edit"
      }[entry.source];

      const deleteAttribute = {
        shift: "data-delete-shift",
        plan: "data-plan-delete",
        study: "data-school-delete"
      }[entry.source];

      const height = Math.max(
        8,
        (row.end - row.start) * 1.2
      );

      const sourceLabel = entry.source === "study"
        ? "Lịch học"
        : entry.source === "shift"
          ? "Ca đã ghi"
          : "Dự kiến";

      const details = row.continued
        ? "Tiếp từ hôm trước"
        : entry.source === "study"
          ? escapeHTML(entry.room || "")
          : currency(entry.pay) + " / cả ca";

      return `
        <div
          class="week-time-block"
          data-source="${entry.source}"
          style="
            top:${row.start * 1.2}px;
            height:${height}px;
            left:calc(${row.lane * 100 / laneCount}% + 2px);
            width:calc(${100 / laneCount}% - 4px)
          "
          title="${escapeHTML(label)}"
        >
          <strong>${escapeHTML(entry.jobName)}</strong>
          <small>${sourceLabel}</small>

          <span>
            ${escapeHTML(entry.start)}–${escapeHTML(entry.end)}
          </span>

          <small>${details}</small>

          <div class="week-time-actions">
            <button
              type="button"
              class="text-btn"
              ${editAttribute}="${escapeHTML(entry.sourceId)}"
              aria-label="Sửa ${escapeHTML(label)}"
            >Sửa</button>

            <button
              type="button"
              class="text-btn"
              ${deleteAttribute}="${escapeHTML(entry.sourceId)}"
              aria-label="Xóa ${escapeHTML(label)}"
            >Xóa</button>
          </div>
        </div>
      `;
    }).join("");

    return `
      <div
        class="week-time-column"
        aria-label="${names[index]}"
      >
        ${blocks}
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <p class="hint">
      Cuộn dọc để xem giờ, vuốt ngang để xem các ngày.
      Xanh lá là ca đã ghi, vàng là dự kiến,
      xanh dương là lịch học.
      Ca qua đêm hiển thị tiếp ở ngày kế tiếp.
      Trong ca ngắn, cuộn bên trong ô để xem nút sửa và xóa.
    </p>

    <div
      class="week-timeline-scroll"
      tabindex="0"
      aria-label="Lịch tuần theo giờ"
    >
      <div class="week-timeline">
        <div class="week-timeline-heading">
          <div class="week-hour-heading">Giờ</div>
          ${headings}
        </div>

        <div class="week-timeline-body">
          <div class="week-hours">${hours}</div>
          ${columns}
        </div>
      </div>
    </div>
  `;

  const scroller = container.querySelector(
    ".week-timeline-scroll"
  );

  scroller.scrollTop = scrollTop;
  scroller.scrollLeft = scrollLeft;
}

function planFromForm() {
  const jobId = el("plan-job").value;

  return makeShift({
    jobId,
    jobName: data.jobs[jobId]?.name,
    date: el("plan-date").value,
    start: el("plan-start").value,
    end: el("plan-end").value,
    rate: el("plan-rate").value,
    nightRate: el("plan-night-rate").value,
    rest: el("plan-rest").value,
    nightRest: el("plan-night-rest").value,
    payMode: "split",
    note: ""
  });
}

function estimatePlan() {
  try {
    const plan = planFromForm();

    setText(
      "plan-estimate",
      duration(plan.minutes) +
      " · Dự kiến " +
      currency(plan.pay)
    );
  } catch (error) {
    setText("plan-estimate", error.message);
  }
}

function resetPlan() {
  editingPlan = null;

  el("plan-form").reset();

  el("plan-date").value =
    el("week-date").value || today();

  el("plan-cancel").hidden = true;

  setText("plan-estimate", "");
  setText("plan-save", "Lưu lịch dự kiến");
}

el("week-date").addEventListener(
  "change",
  renderWeek
);

el("week-prev").addEventListener("click", () => {
  el("week-date").value = addDays(
    el("week-date").value || today(),
    -7
  );

  renderWeek();
});

el("week-next").addEventListener("click", () => {
  el("week-date").value = addDays(
    el("week-date").value || today(),
    7
  );

  renderWeek();
});

el("plan-job").addEventListener("change", () => {
  const job = data.jobs[el("plan-job").value];

  el("plan-rate").value = job?.rate ?? "";

  el("plan-night-rate").value =
    job?.nightRate ?? job?.rate ?? "";

  estimatePlan();
});

el("plan-form").addEventListener(
  "input",
  estimatePlan
);

el("plan-cancel").addEventListener("click", () => {
  if (!planBusy) resetPlan();
});

el("plan-form").addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    if (!store || planBusy) return;

    planBusy = true;
    el("plan-fields").disabled = true;

    try {
      const plan = planFromForm();

      await store.put(
        "plans",
        editingPlan || store.id(),
        plan
      );

      el("week-date").value = plan.date;

      resetPlan();
      renderWeek();

      setText(
        "plan-message",
        "Đã lưu lịch dự kiến lên Firebase."
      );
    } catch (error) {
      setText(
        "plan-message",
        "Chưa lưu được lịch. " + error.message
      );
    } finally {
      planBusy = false;
      el("plan-fields").disabled = false;
    }
  }
);

el("week-days").addEventListener(
  "click",
  async event => {
    const button = event.target.closest("button");

    if (!button || !store || planBusy) return;

    const id =
      button.dataset.planEdit ||
      button.dataset.planDelete;

    const plan = data.plans?.[id];

    if (!plan) return;

    if (button.dataset.planEdit) {
      editingPlan = id;

      el("plan-job").value = plan.jobId;

      for (const field of [
        "date",
        "start",
        "end",
        "rate"
      ]) {
        el("plan-" + field).value = plan[field];
      }

      el("plan-night-rate").value = plan.nightRate;
      el("plan-rest").value = plan.dayRest;
      el("plan-night-rest").value = plan.nightRest;
      el("plan-cancel").hidden = false;

      setText(
        "plan-save",
        "Lưu thay đổi lịch"
      );

      estimatePlan();

      el("plan-form").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

      return;
    }

    if (!confirm("Xóa ca dự kiến này?")) return;

    planBusy = true;
    el("plan-fields").disabled = true;

    try {
      await store.put("plans", id, null);

      if (editingPlan === id) resetPlan();

      setText(
        "plan-message",
        "Đã xóa ca dự kiến."
      );
    } catch (error) {
      setText(
        "plan-message",
        "Chưa xóa được. " + error.message
      );
    } finally {
      planBusy = false;
      el("plan-fields").disabled = false;
    }
  }
);

openStore(
  value => {
    data = value;
    render();
  },

  (kind, message) => {
    el("status").dataset.kind = kind;
    setText("status", message);
  },

  (signIn, email) => {
    const button = el("google-sign-in");

    button.disabled = false;

    if (email) {
      setText("account-email", email);
    }

    button.addEventListener("click", async () => {
      button.disabled = true;

      try {
        await signIn();
      } catch (error) {
        notice(
          "Đăng nhập Google chưa thành công. " +
          error.message
        );

        button.disabled = false;
      }
    });
  }
)
  .then(value => {
    if (!value) return;

    store = value;

    school.enable();

    el("plan-fields").disabled = false;
    el("shift-fields").disabled = false;
    el("add-job").disabled = false;
  })
  .catch(error => {
    setText("status", "Chưa kết nối được");

    el("status").dataset.kind = "error";

    notice(
      "Chưa mở được dữ liệu. " +
      "Kiểm tra cấu hình Firebase, bật Google " +
      "và áp dụng Database Rules. " +
      error.message
    );
  });

render();