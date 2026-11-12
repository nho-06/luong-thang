import { minutesBetween } from "./core.js";

export function jobColor(job, fallbackName = "") {
  if (job?.color === "yellow" || job?.color === "pink") {
    return job.color;
  }

  const name = job?.name || fallbackName;

  return name.toLocaleLowerCase("vi").includes("lofi garden")
    ? "yellow"
    : "pink";
}

export function initJobShifts({
  getData,
  isBusy,
  onShiftChange,
  onPlanChange
}) {
  const el = id => document.getElementById(id);
  const editor = el("job-templates");

  const fields = [
    {
      job: "job",
      select: "shift-template",
      start: "start",
      end: "end",
      update: onShiftChange
    },
    {
      job: "plan-job",
      select: "plan-template",
      start: "plan-start",
      end: "plan-end",
      update: onPlanChange
    }
  ];

  function addRow(id, template) {
    const row = document.createElement("div");
    row.className = "template-row";
    row.dataset.templateId = id;

    const inputs = [
      ["name", "Tên ca", "text"],
      ["start", "Giờ vào", "time"],
      ["end", "Giờ ra", "time"]
    ];

    for (const [field, label, type] of inputs) {
      const wrapper = document.createElement("label");
      wrapper.textContent = label;

      const input = document.createElement("input");
      input.type = type;
      input.dataset.field = field;
      input.value = template[field] || "";
      input.required = true;

      if (field === "name") {
        input.maxLength = 40;
      }

      wrapper.append(input);
      row.append(wrapper);
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-btn";
    remove.textContent = "Xóa ca";

    remove.addEventListener("click", () => {
      if (!isBusy()) {
        row.remove();
      }
    });

    row.append(remove);
    editor.append(row);
  }

  el("add-template").addEventListener("click", () => {
    if (isBusy()) return;

    if (editor.children.length >= 12) {
      el("template-message").textContent =
        "Mỗi công việc tối đa 12 ca.";
      return;
    }

    el("template-message").textContent = "";

    addRow(crypto.randomUUID(), {
      name: "Ca " + (editor.children.length + 1),
      start: "",
      end: ""
    });
  });

  function refresh() {
    for (const field of fields) {
      const select = el(field.select);
      const previous = select.value;
      const job = getData().jobs[el(field.job).value];

      select.replaceChildren(
        new Option("Tự nhập giờ", "")
      );

      for (const [id, template] of Object.entries(
        job?.templates || {}
      )) {
        const nextDay = template.end < template.start
          ? " (hôm sau)"
          : "";

        select.add(
          new Option(
            template.name +
              " · " +
              template.start +
              "–" +
              template.end +
              nextDay,
            id
          )
        );
      }

      select.value = previous;

      if (select.selectedIndex === -1) {
        select.selectedIndex = 0;
      }
    }
  }

  for (const field of fields) {
    el(field.job).addEventListener("change", () => {
      el(field.select).value = "";
      refresh();
    });

    el(field.select).addEventListener("change", () => {
      const job = getData().jobs[el(field.job).value];
      const template = job?.templates?.[el(field.select).value];

      if (!template) return;

      el(field.start).value = template.start;
      el(field.end).value = template.end;

      field.update();
    });

    for (const timeField of [field.start, field.end]) {
      el(timeField).addEventListener("input", () => {
        el(field.select).value = "";
      });
    }
  }

  return {
    refresh,

    edit(job) {
      editor.replaceChildren();

      el("job-color").value = jobColor(job);
      el("template-message").textContent = "";

      for (const [id, template] of Object.entries(
        job?.templates || {}
      )) {
        addRow(id, template);
      }
    },

    read() {
      const templates = {};

      for (const row of editor.children) {
        const value = {};

        for (const input of row.querySelectorAll("input")) {
          value[input.dataset.field] = input.value.trim();
        }

        if (!value.name || value.name.length > 40) {
          throw new Error(
            "Tên ca phải từ 1 đến 40 ký tự."
          );
        }

        minutesBetween(value.start, value.end);

        templates[row.dataset.templateId] = value;
      }

      return {
        color: el("job-color").value,
        templates
      };
    }
  };
}