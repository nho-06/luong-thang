export function minutesBetween(start, end, rest = 0) {
  function parseTime(value) {
    if (!/^\d{2}:\d{2}$/.test(value)) {
      throw new Error("Giờ chưa hợp lệ.");
    }

    const [hours, minutes] = value.split(":").map(Number);

    if (hours > 23 || minutes > 59) {
      throw new Error("Giờ chưa hợp lệ.");
    }

    return hours * 60 + minutes;
  }

  const startMinutes = parseTime(start);
  let endMinutes = parseTime(end);

  if (startMinutes === endMinutes) {
    throw new Error("Giờ vào và giờ ra phải khác nhau.");
  }

  // Ca qua đêm.
  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60;
  }

  const shiftMinutes = endMinutes - startMinutes;

  if (
    !Number.isInteger(rest) ||
    rest < 0 ||
    rest >= shiftMinutes
  ) {
    throw new Error(
      "Số phút nghỉ phải nhỏ hơn thời gian ca làm."
    );
  }

  return shiftMinutes - rest;
}

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(value + "T00:00:00Z");

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

export function makeShift(value) {
  const rate = Number(value.rate);
  const rest = Number(value.rest);

  if (!value.jobId || !value.jobName?.trim()) {
    throw new Error("Bạn cần chọn một công việc.");
  }

  if (!validDate(value.date)) {
    throw new Error("Ngày làm chưa hợp lệ.");
  }

  if (
    !Number.isSafeInteger(rate) ||
    rate <= 0 ||
    rate > 100000000
  ) {
    throw new Error(
      "Lương giờ cần là số nguyên từ 1 đến 100.000.000đ."
    );
  }

  const minutes = minutesBetween(
    value.start,
    value.end,
    rest
  );

  return {
    jobId: value.jobId,
    jobName: value.jobName.trim(),

    date: value.date,
    start: value.start,
    end: value.end,

    rest,
    rate,
    minutes,

    pay: Math.round(minutes * rate / 60),

    note: String(value.note || "").trim().slice(0, 300)
  };
}

export function monthRows(shifts, month, jobId = "") {
  return Object.entries(shifts || {})
    .map(([id, shift]) => ({
      ...shift,
      id
    }))
    .filter(shift => {
      return (
        shift.date.startsWith(month) &&
        (!jobId || shift.jobId === jobId)
      );
    })
    .sort((a, b) => {
      return (
        b.date.localeCompare(a.date) ||
        b.start.localeCompare(a.start)
      );
    });
}

export function summarize(rows) {
  return rows.reduce(
    (total, shift) => ({
      minutes: total.minutes + shift.minutes,
      pay: total.pay + shift.pay,
      count: total.count + 1
    }),
    {
      minutes: 0,
      pay: 0,
      count: 0
    }
  );
}

export function currency(value) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(value);
}

export function duration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  return remaining
    ? `${hours} giờ ${remaining} phút`
    : `${hours} giờ`;
}