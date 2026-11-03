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

  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60;
  }

  const shiftMinutes = endMinutes - startMinutes;

  if (!Number.isInteger(rest) || rest < 0 || rest >= shiftMinutes) {
    throw new Error("Số phút nghỉ phải nhỏ hơn thời gian ca làm.");
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

// Khung đêm từ 22:00 đến trước 10:00 hôm sau.
export function splitMinutes(start, end) {
  const total = minutesBetween(start, end);
  const [hours, minutes] = start.split(":").map(Number);
  const firstMinute = hours * 60 + minutes;

  let day = 0;
  let night = 0;

  for (let offset = 0; offset < total; offset++) {
    const clock = (firstMinute + offset) % 1440;

    if (clock >= 22 * 60 || clock < 10 * 60) {
      night++;
    } else {
      day++;
    }
  }

  return { day, night };
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

  const validRate = amount =>
    Number.isSafeInteger(amount) && amount > 0 && amount <= 100000000;

  if (!validRate(rate)) {
    throw new Error("Lương giờ phải là số nguyên từ 1 đến 100.000.000đ.");
  }

  const base = {
    jobId: value.jobId,
    jobName: value.jobName.trim(),
    date: value.date,
    start: value.start,
    end: value.end,
    note: String(value.note || "").trim().slice(0, 300)
  };

  if (value.payMode !== "split") {
    const minutes = minutesBetween(value.start, value.end, rest);

    return {
      ...base,
      rest,
      rate,
      minutes,
      pay: Math.round(minutes * rate / 60)
    };
  }

  const nightRate = Number(value.nightRate);
  const nightRest = Number(value.nightRest ?? 0);

  if (!validRate(nightRate)) {
    throw new Error("Nhập lương đêm hợp lệ.");
  }

  const raw = splitMinutes(value.start, value.end);

  if (!Number.isInteger(rest) || rest < 0 || rest > raw.day) {
    throw new Error(`Nghỉ khung thường phải từ 0 đến ${raw.day} phút.`);
  }

  if (!Number.isInteger(nightRest) || nightRest < 0 || nightRest > raw.night) {
    throw new Error(`Nghỉ khung đêm phải từ 0 đến ${raw.night} phút.`);
  }

  const dayMinutes = raw.day - rest;
  const nightMinutes = raw.night - nightRest;
  const minutes = dayMinutes + nightMinutes;

  if (minutes <= 0) {
    throw new Error("Ca phải còn thời gian thực làm sau khi trừ nghỉ.");
  }

  return {
    ...base,
    payMode: "split",
    rate,
    nightRate,
    dayRest: rest,
    nightRest,
    rest: rest + nightRest,
    dayMinutes,
    nightMinutes,
    minutes,
    pay: Math.round((dayMinutes * rate + nightMinutes * nightRate) / 60)
  };
}

export function monthRows(shifts, month, jobId = "") {
  return Object.entries(shifts || {})
    .map(([id, shift]) => ({ ...shift, id }))
    .filter(shift => (
      shift.date.startsWith(month) &&
      (!jobId || shift.jobId === jobId)
    ))
    .sort((a, b) => (
      b.date.localeCompare(a.date) ||
      b.start.localeCompare(a.start)
    ));
}

export function summarize(rows) {
  return rows.reduce(
    (total, shift) => ({
      minutes: total.minutes + shift.minutes,
      pay: total.pay + shift.pay,
      count: total.count + 1
    }),
    { minutes: 0, pay: 0, count: 0 }
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