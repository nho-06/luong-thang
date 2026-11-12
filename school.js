import { validDate, minutesBetween } from "./core.js";

export function studyDates(first, repeat, until) {
  if (!validDate(first)) {
    throw new Error("Chọn ngày học hợp lệ.");
  }

  if (!repeat) return [first];

  if (!validDate(until) || until < first) {
    throw new Error("Ngày kết thúc phải từ ngày học đầu tiên trở đi.");
  }

  const result = [];
  const cursor = new Date(first + "T12:00:00Z");

  while (cursor.toISOString().slice(0, 10) <= until) {
    result.push(cursor.toISOString().slice(0, 10));

    if (result.length > 300) {
      throw new Error("Mỗi lần lưu tối đa 300 buổi học.");
    }

    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return result;
}

export function initSchool({ getData, getStore, today }) {
  const el = id => document.getElementById(id);

  let editing = null;
  let saving = false;
  let pending = null;
  let deleteId = null;

  el("school-date").value = today();

  const deleteDialog = document.createElement("dialog");
  deleteDialog.setAttribute("aria-labelledby", "school-delete-title");

  deleteDialog.innerHTML = `
    <h2 id="school-delete-title">Xóa lịch học</h2>
    <p id="school-delete-description"></p>
    <p id="school-delete-status" role="status"></p>

    <button class="btn" type="button" data-scope="one">
      Xóa buổi này
    </button>

    <button class="text-btn school-delete-all" type="button" data-scope="all">
      Xóa toàn bộ lịch môn
    </button>

    <button class="text-btn" type="button" data-scope="cancel" autofocus>
      Hủy
    </button>
  `;

  document.body.append(deleteDialog);

  deleteDialog.addEventListener("cancel", event => {
    if (saving) event.preventDefault();
  });

  function subjects() {
    const groups = new Map();

    for (const [id, study] of Object.entries(getData().studies || {})) {
      const name = study.name.trim().normalize("NFC").replace(/\s+/g, " ");
      const key = name.toLocaleLowerCase("vi");

      if (!groups.has(key)) {
        groups.set(key, { name, ids: [] });
      }

      groups.get(key).ids.push(id);
    }

    return [...groups.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "vi")
    );
  }

  function renderSubjects() {
    const rows = subjects().map(({ name, ids }) => {
      const row = document.createElement("li");
      row.className = "school-subject";

      const info = document.createElement("div");
      const title = document.createElement("strong");
      const count = document.createElement("small");

      title.textContent = name;
      count.textContent = `${ids.length} buổi học`;
      info.append(title, count);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "text-btn school-delete-all";
      button.dataset.subjectId = ids[0];
      button.textContent = "Xóa toàn bộ lịch";
      button.setAttribute("aria-label", `Xóa toàn bộ lịch môn ${name}`);
      button.disabled = saving || !getStore();

      row.append(info, button);
      return row;
    });

    el("school-subjects").replaceChildren(...rows);
    el("school-subjects-empty").hidden = rows.length > 0;
  }

  function setSaving(value) {
    saving = value;
    el("school-fields").disabled = value;

    for (const button of el("school-subjects").querySelectorAll("button")) {
      button.disabled = value;
    }

    for (const button of deleteDialog.querySelectorAll("button")) {
      button.disabled = value;
    }
  }

  async function deleteLessons(ids, status, success) {
    const store = getStore();

    if (!store) {
      status.textContent = "Đăng nhập Google và chờ sổ tải xong để xóa lịch.";
      return false;
    }

    if (saving) return false;

    setSaving(true);
    status.textContent = "Đang xóa lịch học…";

    try {
      const changes = Object.fromEntries(ids.map(id => [id, null]));

      await store.putMany("studies", changes);

      if (ids.includes(editing)) reset();

      status.textContent = success;
      return true;
    } catch (error) {
      status.textContent = "Chưa xóa được. " + error.message;
      return false;
    } finally {
      setSaving(false);
    }
  }

  function deleteSubject(subject, status) {
    const { name, ids } = subject;
    const message =
      `Xóa toàn bộ ${ids.length} buổi của môn “${name}” ở tất cả các tuần?`;

    if (!confirm(message)) return false;

    return deleteLessons(
      ids,
      status,
      `Đã xóa ${ids.length} buổi của môn “${name}”.`
    );
  }

  el("school-subjects").addEventListener("click", event => {
    const button = event.target.closest("button[data-subject-id]");
    if (!button || saving) return;

    const subject = subjects().find(group =>
      group.ids.includes(button.dataset.subjectId)
    );

    if (subject) {
      deleteSubject(subject, el("school-subjects-message"));
    }
  });

  deleteDialog.addEventListener("click", async event => {
    const button = event.target.closest("button[data-scope]");
    if (!button || saving) return;

    const scope = button.dataset.scope;

    if (scope === "cancel") {
      deleteDialog.close();
      return;
    }

    const status = el("school-delete-status");
    const subject = subjects().find(group => group.ids.includes(deleteId));

    if (!subject) {
      status.textContent = "Buổi học này đã được xóa.";
      return;
    }

    const deleted = scope === "all"
      ? await deleteSubject(subject, status)
      : await deleteLessons([deleteId], status, "Đã xóa buổi học.");

    if (deleted) {
      el("school-message").textContent = status.textContent;
      deleteDialog.close();
    }
  });

  function repeatFields() {
    const enabled = !editing && el("school-repeat").checked;

    el("school-until-label").hidden = !enabled;
    el("school-until").disabled = !enabled;
    el("school-until").required = enabled;
  }

  function readForm() {
    const name = el("school-name").value.trim();

    if (!name || name.length > 100) {
      throw new Error("Nhập tên môn học tối đa 100 ký tự.");
    }

    const date = el("school-date").value;
    const start = el("school-start").value;
    const end = el("school-end").value;

    minutesBetween(start, end);

    const dates = studyDates(
      date,
      !editing && el("school-repeat").checked,
      el("school-until").value
    );

    return {
      dates,
      value: {
        name,
        date,
        start,
        end,
        room: el("school-room").value.trim(),
        note: el("school-note").value.trim()
      }
    };
  }

  function preview() {
    try {
      const form = readForm();

      el("school-preview").textContent = editing
        ? "Sửa riêng buổi học này."
        : `Sẽ tạo ${form.dates.length} buổi học. Các buổi lặp cách nhau 7 ngày.`;
    } catch (error) {
      el("school-preview").textContent = error.message;
    }
  }

  function reset() {
    editing = null;
    pending = null;

    el("school-form").reset();
    el("school-date").value = today();
    el("school-repeat-label").hidden = false;
    el("school-cancel").hidden = true;
    el("school-save").textContent = "Lưu lịch học";
    el("school-preview").textContent = "";

    repeatFields();
  }

  el("school-repeat").addEventListener("change", () => {
    repeatFields();
    preview();
  });

  el("school-form").addEventListener("input", preview);

  el("school-cancel").addEventListener("click", () => {
    if (!saving) reset();
  });

  el("school-form").addEventListener("submit", async event => {
    event.preventDefault();

    const store = getStore();
    if (!store || saving) return;

    setSaving(true);

    try {
      const form = readForm();

      if (editing) {
        await store.put("studies", editing, form.value);
      } else {
        const signature = JSON.stringify(form);

        if (!pending || pending.signature !== signature) {
          const rows = {};

          for (const date of form.dates) {
            rows[store.id()] = { ...form.value, date };
          }

          pending = { signature, rows };
        }

        await store.putMany("studies", pending.rows);
      }

      el("week-date").value = form.dates[0];
      el("week-date").dispatchEvent(new Event("change"));

      el("school-message").textContent = editing
        ? "Đã sửa buổi học."
        : `Đã lưu ${form.dates.length} buổi học lên Firebase.`;

      reset();
    } catch (error) {
      el("school-message").textContent = "Chưa lưu được. " + error.message;
    } finally {
      setSaving(false);
    }
  });

  el("week-days").addEventListener("click", event => {
    const button = event.target.closest(
      "button[data-school-edit], button[data-school-delete]"
    );

    if (!button || saving) return;

    const id = button.dataset.schoolEdit || button.dataset.schoolDelete;
    const study = getData().studies?.[id];
    if (!study) return;

    if (button.dataset.schoolEdit) {
      if (!getStore()) return;

      editing = id;
      pending = null;

      for (const field of ["name", "date", "start", "end", "room", "note"]) {
        el("school-" + field).value = study[field] || "";
      }

      el("school-repeat").checked = false;
      el("school-repeat-label").hidden = true;
      el("school-cancel").hidden = false;
      el("school-save").textContent = "Lưu thay đổi buổi học";

      repeatFields();
      preview();

      el("school-form").closest("details").open = true;
      el("school-form").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

      return;
    }

    deleteId = id;

    const dateLabel = study.date.split("-").reverse().join("/");

    el("school-delete-description").textContent =
      `${study.name} · ${dateLabel} · ${study.start}–${study.end}`;

    el("school-delete-status").textContent = "";
    deleteDialog.showModal();
  });

  repeatFields();

  return {
    renderSubjects,

    enable() {
      el("school-fields").disabled = false;
      renderSubjects();
    }
  };
}