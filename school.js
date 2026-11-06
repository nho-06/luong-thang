import { validDate, minutesBetween } from "./core.js";

export function studyDates(first, repeat, until) {
  if (!validDate(first)) {
    throw new Error("Chọn ngày học hợp lệ.");
  }

  if (!repeat) return [first];

  if (!validDate(until) || until < first) {
    throw new Error(
      "Ngày kết thúc phải từ ngày học đầu tiên trở đi."
    );
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

  el("school-date").value = today();

  function repeatFields() {
    const enabled =
      !editing && el("school-repeat").checked;

    el("school-until-label").hidden = !enabled;
    el("school-until").disabled = !enabled;
    el("school-until").required = enabled;
  }

  function readForm() {
    const name = el("school-name").value.trim();

    if (!name || name.length > 100) {
      throw new Error(
        "Nhập tên môn học tối đa 100 ký tự."
      );
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
        : "Sẽ tạo " +
          form.dates.length +
          " buổi học. Các buổi lặp cách nhau 7 ngày.";
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

  el("school-form").addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      const store = getStore();

      if (!store || saving) return;

      saving = true;
      el("school-fields").disabled = true;

      try {
        const form = readForm();

        if (editing) {
          await store.put(
            "studies",
            editing,
            form.value
          );
        } else {
          const signature = JSON.stringify(form);

          if (
            !pending ||
            pending.signature !== signature
          ) {
            const rows = {};

            for (const date of form.dates) {
              rows[store.id()] = {
                ...form.value,
                date
              };
            }

            pending = { signature, rows };
          }

          await store.putMany(
            "studies",
            pending.rows
          );
        }

        el("week-date").value = form.dates[0];

        el("week-date").dispatchEvent(
          new Event("change")
        );

        el("school-message").textContent = editing
          ? "Đã sửa buổi học."
          : "Đã lưu " +
            form.dates.length +
            " buổi học lên Firebase.";

        reset();
      } catch (error) {
        el("school-message").textContent =
          "Chưa lưu được. " + error.message;
      } finally {
        saving = false;
        el("school-fields").disabled = false;
      }
    }
  );

  el("week-days").addEventListener(
    "click",
    async event => {
      const button = event.target.closest("button");
      const store = getStore();

      if (!button || !store || saving) return;

      const id =
        button.dataset.schoolEdit ||
        button.dataset.schoolDelete;

      const study = getData().studies?.[id];

      if (!study) return;

      if (button.dataset.schoolEdit) {
        editing = id;
        pending = null;

        for (const field of [
          "name",
          "date",
          "start",
          "end",
          "room",
          "note"
        ]) {
          el("school-" + field).value =
            study[field] || "";
        }

        el("school-repeat").checked = false;
        el("school-repeat-label").hidden = true;
        el("school-cancel").hidden = false;

        el("school-save").textContent =
          "Lưu thay đổi buổi học";

        repeatFields();
        preview();

        el("school-form").closest("details").open = true;

        el("school-form").scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

        return;
      }

      if (!confirm("Xóa riêng buổi học này?")) {
        return;
      }

      saving = true;
      el("school-fields").disabled = true;

      try {
        await store.put("studies", id, null);

        if (editing === id) reset();

        el("school-message").textContent =
          "Đã xóa buổi học.";
      } catch (error) {
        el("school-message").textContent =
          "Chưa xóa được. " + error.message;
      } finally {
        saving = false;
        el("school-fields").disabled = false;
      }
    }
  );

  repeatFields();

  return {
    enable() {
      el("school-fields").disabled = false;
    }
  };
}