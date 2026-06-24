const DB_NAME = "orimono-tool-v12-db";
const DB_VERSION = 1;
const STORE = "kv";
const STATE_KEY = "state";
const HISTORY_LIMIT = 1000;
const WARP_SKEIN_TYPES = [
  { id: "4000", name: "4000回", length: 5080 },
  { id: "8000", name: "8000回", length: 10160 }
];

const defaults = {
  settings: {
    weftLoss: 11,
    warpLoss: 1,
    skeinLength: 5080,
    drumLength: 7,
    maxWarpLength: 350
  },
  fabrics: [
    { id: "fabric-standard", name: "AB機", widthCm: 38, defaultPicks: 86, warpEnds: 2680, upperEnds: 0, upperMultiplier: 1.4 },
    { id: "fabric-wide", name: "広幅", widthCm: 45, defaultPicks: 78, warpEnds: 3900, upperEnds: 0, upperMultiplier: 1.4 }
  ],
  customers: [
    { id: "customer-default", name: "標準納品先", markType: "remainingM", markValue: 14, note: "残り14mで印" }
  ],
  history: [],
  lastInputs: {
    weftNeed: { fabricId: "fabric-standard", length: 10, unit: "kujira", rolls: 1, picks: 86, ply: 1, loss: 11 },
    weftReverse: { skeins: 1, fabricId: "fabric-standard", picks: 86, ply: 1, loss: 11 },
    warpNeed: { fabricId: "fabric-standard", customerId: "customer-default", skeinTypeId: "4000", length: 84, ends: 2680, stand: "1", loss: 1 },
    warpReverse: { skeins: 20, skeinTypeId: "4000", fabricId: "fabric-standard", customerId: "customer-default", ends: 2680, stand: "1", loss: 1 },
    warpDouble: { fabricId: "fabric-standard", skeinTypeId: "4000", length: 84, loss: 1 }
  }
};

let db;
let appData;
let historyFilter = "all";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet(key) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
}

function idbSet(key, value) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put({ key, value });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function normalizeState(input) {
  const source = input || {};
  const state = {
    settings: { ...clone(defaults.settings), ...(source.settings || {}) },
    fabrics: normalizeCollection(source.fabrics, defaults.fabrics, (item, index) => ({
      id: item.id || makeId("fabric"),
      name: item.name || "未設定",
      widthCm: toNumber(item.widthCm, defaults.fabrics[0].widthCm),
      defaultPicks: toInteger(item.defaultPicks, defaults.fabrics[0].defaultPicks),
      warpEnds: toInteger(item.warpEnds ?? item.ends, defaults.fabrics[index]?.warpEnds || defaults.fabrics[0].warpEnds),
      upperEnds: toInteger(item.upperEnds, defaults.fabrics[index]?.upperEnds ?? defaults.fabrics[0].upperEnds),
      upperMultiplier: toNumber(item.upperMultiplier, defaults.fabrics[index]?.upperMultiplier || defaults.fabrics[0].upperMultiplier)
    })),
    customers: normalizeCollection(source.customers, defaults.customers, (item) => ({
      id: item.id || makeId("customer"),
      name: item.name || item.customer || "未設定",
      markType: "remainingM",
      markValue: toNumber(item.markValue ?? item.value, defaults.customers[0].markValue),
      note: item.note || ""
    })),
    history: Array.isArray(source.history) ? source.history.slice(0, HISTORY_LIMIT) : [],
    lastInputs: {
      weftNeed: { ...clone(defaults.lastInputs.weftNeed), ...(source.lastInputs?.weftNeed || {}) },
      weftReverse: { ...clone(defaults.lastInputs.weftReverse), ...(source.lastInputs?.weftReverse || {}) },
      warpNeed: { ...clone(defaults.lastInputs.warpNeed), ...(source.lastInputs?.warpNeed || {}) },
      warpReverse: { ...clone(defaults.lastInputs.warpReverse), ...(source.lastInputs?.warpReverse || {}) },
      warpDouble: { ...clone(defaults.lastInputs.warpDouble), ...(source.lastInputs?.warpDouble || {}) }
    }
  };

  state.settings.skeinLength = positive(state.settings.skeinLength, defaults.settings.skeinLength);
  state.settings.drumLength = positive(state.settings.drumLength, defaults.settings.drumLength);
  state.settings.maxWarpLength = positive(state.settings.maxWarpLength, defaults.settings.maxWarpLength);
  if (source.lastInputs?.weftReverse?.skeins == null && source.lastInputs?.weftReverse?.yarn) {
    state.lastInputs.weftReverse.skeins = Math.max(1, Math.ceil(Number(source.lastInputs.weftReverse.yarn) / state.settings.skeinLength));
  }
  if (source.lastInputs?.warpReverse?.skeins == null && source.lastInputs?.warpReverse?.yarn) {
    state.lastInputs.warpReverse.skeins = Math.max(1, Math.ceil(Number(source.lastInputs.warpReverse.yarn) / state.settings.skeinLength));
  }
  if (source.lastInputs?.sample?.customerId && source.lastInputs?.warpNeed?.customerId == null) {
    state.lastInputs.warpNeed.customerId = source.lastInputs.sample.customerId;
  }
  if (source.lastInputs?.sample?.customerId && source.lastInputs?.warpReverse?.customerId == null) {
    state.lastInputs.warpReverse.customerId = source.lastInputs.sample.customerId;
  }
  state.lastInputs.weftNeed.fabricId = keepId(state.fabrics, state.lastInputs.weftNeed.fabricId);
  state.lastInputs.weftNeed.rolls = toInteger(state.lastInputs.weftNeed.rolls, defaults.lastInputs.weftNeed.rolls);
  state.lastInputs.weftReverse.fabricId = keepId(state.fabrics, state.lastInputs.weftReverse.fabricId);
  state.lastInputs.warpNeed.fabricId = keepId(state.fabrics, state.lastInputs.warpNeed.fabricId);
  state.lastInputs.warpReverse.fabricId = keepId(state.fabrics, state.lastInputs.warpReverse.fabricId);
  state.lastInputs.warpDouble.fabricId = keepId(state.fabrics, state.lastInputs.warpDouble.fabricId);
  state.lastInputs.warpNeed.customerId = keepId(state.customers, state.lastInputs.warpNeed.customerId);
  state.lastInputs.warpReverse.customerId = keepId(state.customers, state.lastInputs.warpReverse.customerId);
  state.lastInputs.warpNeed.skeinTypeId = keepWarpSkeinType(state.lastInputs.warpNeed.skeinTypeId ?? state.lastInputs.warpNeed.skeinType);
  state.lastInputs.warpReverse.skeinTypeId = keepWarpSkeinType(state.lastInputs.warpReverse.skeinTypeId ?? state.lastInputs.warpReverse.skeinType);
  state.lastInputs.warpDouble.skeinTypeId = keepWarpSkeinType(state.lastInputs.warpDouble.skeinTypeId ?? state.lastInputs.warpDouble.skeinType);
  state.lastInputs.weftReverse.skeins = toInteger(state.lastInputs.weftReverse.skeins, defaults.lastInputs.weftReverse.skeins);
  state.lastInputs.warpReverse.skeins = toInteger(state.lastInputs.warpReverse.skeins, defaults.lastInputs.warpReverse.skeins);
  return state;
}

function normalizeCollection(items, fallback, map) {
  const source = Array.isArray(items) && items.length ? items : clone(fallback);
  const mapped = source.map(map).filter((item) => item.name);
  return mapped.length ? mapped : clone(fallback);
}

function keepId(collection, id) {
  return collection.some((item) => item.id === id) ? id : collection[0]?.id;
}

function keepWarpSkeinType(id) {
  return WARP_SKEIN_TYPES.some((item) => item.id === String(id)) ? String(id) : WARP_SKEIN_TYPES[0].id;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function value(id, fallback = 0) {
  return toNumber($(`#${id}`)?.value, fallback);
}

function setValue(id, val) {
  const element = $(`#${id}`);
  if (element && val != null) element.value = val;
}

function fmtLength(number) {
  return number.toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtYarn(number) {
  return Math.round(number).toLocaleString("ja-JP");
}

function fmtLoose(number, digits = 2) {
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString("ja-JP", { maximumFractionDigits: digits });
}

function factor(percent) {
  return 1 + Number(percent) / 100;
}

function getFabric(id) {
  return appData.fabrics.find((item) => item.id === id) || appData.fabrics[0];
}

function getCustomer(id) {
  return appData.customers.find((item) => item.id === id) || appData.customers[0];
}

function getWarpSkeinType(id) {
  return WARP_SKEIN_TYPES.find((item) => item.id === String(id)) || WARP_SKEIN_TYPES[0];
}

function standLabel(value) {
  return Number(value) === 2 ? "羽二重立" : "素入立";
}

function validatePositive(label, number) {
  return Number.isFinite(number) && number > 0 ? "" : `${label}は0より大きい数値で入力してください`;
}

function validateInteger(label, number, min = 1) {
  return Number.isInteger(Number(number)) && Number(number) >= min ? "" : `${label}は${min}以上の整数で入力してください`;
}

function firstError(errors) {
  return errors.find(Boolean) || "";
}

function errorHtml(message) {
  return message ? `<div class="errorBox">${message}</div>` : "";
}

function warningHtml(message) {
  return message ? `<div class="warning">${message}</div>` : "";
}

function resultBox(big, label, details, prefix = "") {
  const rows = details.map(([key, val]) => `<div><dt>${key}</dt><dd>${val}</dd></div>`).join("");
  return `
    ${prefix}
    <div class="bigNumber"><span>${label}</span><strong>${big}</strong></div>
    <dl class="detailList">${rows}</dl>
  `;
}

async function saveState(message = "保存済み", renderSummaryOnly = true) {
  await idbSet(STATE_KEY, appData);
  $("#saveState").textContent = message;
  clearTimeout(saveState.timer);
  saveState.timer = setTimeout(() => {
    $("#saveState").textContent = navigator.onLine ? "保存済み" : "オフライン";
  }, 1300);
  if (renderSummaryOnly) renderHome();
}

function renderHome() {
  $("#homeFabricCount").textContent = appData.fabrics.length;
  $("#homeCustomerCount").textContent = appData.customers.length;
  $("#homeHistoryCount").textContent = appData.history.length;
  $("#homeMaxWarp").textContent = `${fmtLoose(appData.settings.maxWarpLength, 0)}m`;
}

function renderSelects() {
  $$("[data-fabric-select]").forEach((select) => {
    const current = select.value;
    select.innerHTML = appData.fabrics
      .map((fabric) => `<option value="${escapeHtml(fabric.id)}">${escapeHtml(fabric.name)} / ${fmtLoose(fabric.widthCm)}cm / ${fmtLoose(fabric.warpEnds, 0)}本</option>`)
      .join("");
    select.value = appData.fabrics.some((fabric) => fabric.id === current) ? current : appData.fabrics[0]?.id;
    applyFabricDefault(select);
  });

  $$("[data-customer-select]").forEach((select) => {
    const current = select.value;
    select.innerHTML = appData.customers.map((customer) => {
      const mark = `残り${fmtLoose(customer.markValue)}m`;
      return `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)} / ${mark}</option>`;
    }).join("");
    select.value = appData.customers.some((customer) => customer.id === current) ? current : appData.customers[0]?.id;
  });
}

function applyFabricDefault(select) {
  const picksTarget = select.dataset.picksTarget;
  const endsTarget = select.dataset.endsTarget;
  const fabric = getFabric(select.value);
  if (picksTarget && fabric) setValue(picksTarget, fabric.defaultPicks);
  if (endsTarget && fabric) setValue(endsTarget, fabric.warpEnds);
}

function restoreInputs() {
  const last = appData.lastInputs;
  Object.entries({
    weftFabric: last.weftNeed.fabricId,
    weftLength: last.weftNeed.length,
    weftUnit: last.weftNeed.unit,
    weftRolls: last.weftNeed.rolls,
    weftPicks: last.weftNeed.picks,
    weftPly: last.weftNeed.ply,
    weftLoss: last.weftNeed.loss,
    weftReverseSkeins: last.weftReverse.skeins,
    weftReverseFabric: last.weftReverse.fabricId,
    weftReversePicks: last.weftReverse.picks,
    weftReversePly: last.weftReverse.ply,
    weftReverseLoss: last.weftReverse.loss,
    warpFabric: last.warpNeed.fabricId,
    warpSkeinType: last.warpNeed.skeinTypeId,
    warpLength: last.warpNeed.length,
    warpEnds: last.warpNeed.ends,
    warpStand: last.warpNeed.stand,
    warpLoss: last.warpNeed.loss,
    warpCustomer: last.warpNeed.customerId,
    warpReverseSkeins: last.warpReverse.skeins,
    warpReverseSkeinType: last.warpReverse.skeinTypeId,
    warpReverseFabric: last.warpReverse.fabricId,
    warpReverseEnds: last.warpReverse.ends,
    warpReverseStand: last.warpReverse.stand,
    warpReverseLoss: last.warpReverse.loss,
    warpReverseCustomer: last.warpReverse.customerId,
    warpDoubleFabric: last.warpDouble.fabricId,
    warpDoubleLength: last.warpDouble.length,
    warpDoubleSkeinType: last.warpDouble.skeinTypeId,
    warpDoubleLoss: last.warpDouble.loss,
    settingWeftLoss: appData.settings.weftLoss,
    settingWarpLoss: appData.settings.warpLoss,
    settingSkeinLength: appData.settings.skeinLength,
    settingDrumLength: appData.settings.drumLength,
    settingMaxWarpLength: appData.settings.maxWarpLength
  }).forEach(([id, val]) => setValue(id, val));
}

function captureInputs() {
  appData.lastInputs.weftNeed = {
    fabricId: $("#weftFabric").value,
    length: value("weftLength"),
    unit: $("#weftUnit").value,
    rolls: value("weftRolls"),
    picks: value("weftPicks"),
    ply: value("weftPly"),
    loss: value("weftLoss")
  };
  appData.lastInputs.weftReverse = {
    skeins: value("weftReverseSkeins"),
    fabricId: $("#weftReverseFabric").value,
    picks: value("weftReversePicks"),
    ply: value("weftReversePly"),
    loss: value("weftReverseLoss")
  };
  appData.lastInputs.warpNeed = {
    fabricId: $("#warpFabric").value,
    customerId: $("#warpCustomer").value,
    skeinTypeId: $("#warpSkeinType").value,
    length: value("warpLength"),
    ends: value("warpEnds"),
    stand: $("#warpStand").value,
    loss: value("warpLoss")
  };
  appData.lastInputs.warpReverse = {
    skeins: value("warpReverseSkeins"),
    skeinTypeId: $("#warpReverseSkeinType").value,
    fabricId: $("#warpReverseFabric").value,
    customerId: $("#warpReverseCustomer").value,
    ends: value("warpReverseEnds"),
    stand: $("#warpReverseStand").value,
    loss: value("warpReverseLoss")
  };
  appData.lastInputs.warpDouble = {
    fabricId: $("#warpDoubleFabric").value,
    length: value("warpDoubleLength"),
    skeinTypeId: $("#warpDoubleSkeinType").value,
    loss: value("warpDoubleLoss")
  };
}

function toKane(length, unit) {
  if (unit === "kujira") return length * 1.25;
  if (unit === "meter") return length / 0.3788;
  return length;
}

function fromKane(kane) {
  return { kujira: kane / 1.25, kane, meter: kane * 0.3788 };
}

function calculateWeftNeed(saveHistory = false) {
  const fabric = getFabric($("#weftFabric").value);
  const length = value("weftLength");
  const unit = $("#weftUnit").value;
  const rolls = value("weftRolls");
  const picks = value("weftPicks");
  const ply = value("weftPly");
  const loss = value("weftLoss");
  const error = firstError([
    validatePositive("長さ", length),
    validateInteger("反数", rolls, 1),
    validateInteger("打込み", picks, 1),
    validateInteger("合わせ本数", ply, 1),
    validatePositive("ロス率", loss + 1)
  ]);

  if (error) {
    $("#weftNeedResult").innerHTML = errorHtml(error);
    return null;
  }

  const totalLength = length * rolls;
  const kane = toKane(totalLength, unit);
  const theoretical = kane * 10 * picks * fabric.widthCm / 100;
  const withLoss = theoretical * factor(loss);
  const rawTotal = withLoss * ply;
  const skeins = Math.ceil(rawTotal / appData.settings.skeinLength);
  const remainder = skeins * appData.settings.skeinLength - rawTotal;

  $("#weftNeedResult").innerHTML = resultBox(`${skeins}綛`, "必要綛数", [
    ["総長さ", `${fmtLength(totalLength)}${unitLabel(unit)}`],
    ["理論糸量", `${fmtYarn(theoretical)}m`],
    ["ロス込み糸量", `${fmtYarn(withLoss)}m`],
    ["原糸総量", `${fmtYarn(rawTotal)}m`],
    ["余り予定", `${fmtYarn(remainder)}m`],
    ["曲尺換算", `${fmtLength(kane)}曲尺`]
  ]);

  if (saveHistory) {
    addHistory({
      type: "weft",
      title: "緯糸計算",
      summary: `${fabric.name} / ${fmtLoose(length)}${unitLabel(unit)} × ${fmtLoose(rolls, 0)}反 / ${skeins}綛`,
      data: { fabricName: fabric.name, length, unit, rolls, totalLength, picks, ply, skeins }
    });
  }
  return { theoretical, withLoss, rawTotal, skeins, remainder };
}

function calculateWeftReverse() {
  const fabric = getFabric($("#weftReverseFabric").value);
  const skeins = value("weftReverseSkeins");
  const picks = value("weftReversePicks");
  const ply = value("weftReversePly");
  const loss = value("weftReverseLoss");
  const error = firstError([
    validateInteger("綛数", skeins, 1),
    validateInteger("打込み", picks, 1),
    validateInteger("合わせ本数", ply, 1)
  ]);

  if (error) {
    $("#weftReverseResult").innerHTML = errorHtml(error);
    return;
  }

  const yarn = skeins * appData.settings.skeinLength;
  const denominator = (10 * picks * fabric.widthCm / 100) * factor(loss) * ply;
  const units = fromKane(yarn / denominator);
  $("#weftReverseResult").innerHTML = resultBox(`${fmtLength(units.kujira)}鯨尺`, "織れる長さ", [
    ["綛数", `${fmtLoose(skeins, 0)}綛`],
    ["換算糸量", `${fmtYarn(yarn)}m`],
    ["鯨尺", `${fmtLength(units.kujira)}鯨尺`],
    ["曲尺", `${fmtLength(units.kane)}曲尺`],
    ["m", `${fmtLength(units.meter)}m`]
  ]);
}

function normalizeWarpLengthInput(id) {
  const element = $(`#${id}`);
  const raw = Number(element.value);
  if (!Number.isFinite(raw) || raw <= 0) return "";
  const drum = appData.settings.drumLength;
  const corrected = Math.max(drum, Math.round(raw / drum) * drum);
  if (Math.abs(corrected - raw) > 0.0001) {
    element.value = corrected;
    return `${fmtLoose(raw)}mを${fmtLoose(corrected)}mに補正しました`;
  }
  return "";
}

function getMarkInfo(length, customer) {
  if (!customer) return { rows: [], summary: "" };
  const drum = appData.settings.drumLength;
  const remainMeters = customer.markValue;
  const markLabel = `残り${fmtLoose(customer.markValue)}m`;
  const endLabel = `${fmtLength(length)}m / ${fmtLoose(length / drum)}周`;

  if (length <= remainMeters) {
    return {
      summary: "印なし",
      rows: [
        ["納品先", customer.name],
        ["印判定", "印なし"],
        ["印設定", markLabel],
        ["終了位置", endLabel]
      ]
    };
  }

  const markPosition = length - remainMeters;
  const markRounds = markPosition / drum;
  return {
    summary: `印 ${fmtLength(markPosition)}m / ${fmtLoose(markRounds)}周目`,
    rows: [
      ["納品先", customer.name],
      ["印判定", "印あり"],
      ["印位置", `${fmtLength(markPosition)}m地点`],
      ["印周数", `${fmtLoose(markRounds)}周目`],
      ["終了位置", endLabel],
      ["備考", customer.note || "-"]
    ]
  };
}

function calculateWarpNeed(saveHistory = false, normalizeLength = false) {
  const correction = normalizeLength ? normalizeWarpLengthInput("warpLength") : "";
  const fabric = getFabric($("#warpFabric").value);
  const customer = getCustomer($("#warpCustomer").value);
  const skeinType = getWarpSkeinType($("#warpSkeinType").value);
  const length = value("warpLength");
  const ends = value("warpEnds");
  const stand = Number($("#warpStand").value);
  const loss = value("warpLoss");
  const error = firstError([
    validatePositive("整経長", length),
    validateInteger("経糸本数", ends, 1),
    length > appData.settings.maxWarpLength ? "最大整経長超過" : ""
  ]);

  if (error) {
    $("#warpNeedResult").innerHTML = errorHtml(error);
    return null;
  }

  const needed = length * ends * stand * factor(loss);
  const skeins = Math.ceil(needed / skeinType.length);
  const rounds = length / appData.settings.drumLength;
  const mark = getMarkInfo(length, customer);
  $("#warpNeedResult").innerHTML = resultBox(`${skeins}綛`, "必要綛数", [
    ["織物種類", fabric?.name || "-"],
    ["綛種類", `${skeinType.name}（${fmtYarn(skeinType.length)}m）`],
    ["整経長", `${fmtLength(length)}m`],
    ["必要糸量", `${fmtYarn(needed)}m`],
    ["経糸本数", `${fmtLoose(ends, 0)}本`],
    ["立て方", standLabel(stand)],
    ["周数", `${fmtLength(rounds)}周`],
    ...mark.rows
  ], correction ? warningHtml(correction) : "");

  if (saveHistory) {
    addHistory({
      type: "warp",
      title: "整経計算",
      summary: `${fabric?.name || "-"} / ${skeinType.name} / ${fmtLoose(length)}m / ${fmtLoose(ends, 0)}本 / ${skeins}綛`,
      data: { fabricName: fabric?.name || "-", customerName: customer?.name || "-", markSummary: mark.summary, skeinTypeName: skeinType.name, skeinLength: skeinType.length, length, ends, standLabel: standLabel(stand), loss, needed, skeins, rounds }
    });
  }
  return { needed, skeins, rounds };
}

function calculateWarpReverse(saveHistory = false) {
  const skeins = value("warpReverseSkeins");
  const skeinType = getWarpSkeinType($("#warpReverseSkeinType").value);
  const fabric = getFabric($("#warpReverseFabric").value);
  const customer = getCustomer($("#warpReverseCustomer").value);
  const ends = value("warpReverseEnds");
  const stand = Number($("#warpReverseStand").value);
  const loss = value("warpReverseLoss");
  const error = firstError([
    validateInteger("綛数", skeins, 1),
    validateInteger("経糸本数", ends, 1)
  ]);

  if (error) {
    $("#warpReverseResult").innerHTML = errorHtml(error);
    return null;
  }

  const yarn = skeins * skeinType.length;
  const theoretical = yarn / (ends * stand * factor(loss));
  const drum = appData.settings.drumLength;
  const maxActual = Math.floor(appData.settings.maxWarpLength / drum) * drum;
  let actual = Math.floor(theoretical / drum) * drum;
  let capped = false;
  if (actual > maxActual) {
    actual = maxActual;
    capped = true;
  }
  const rounds = actual / drum;
  const mark = getMarkInfo(actual, customer);
  $("#warpReverseResult").innerHTML = resultBox(`${fmtLength(actual)}m`, "実整経長", [
    ["織物種類", fabric?.name || "-"],
    ["綛種類", `${skeinType.name}（${fmtYarn(skeinType.length)}m）`],
    ["綛数", `${fmtLoose(skeins, 0)}綛`],
    ["換算糸量", `${fmtYarn(yarn)}m`],
    ["理論整経長", `${fmtLength(theoretical)}m`],
    ["実整経長", `${fmtLength(actual)}m`],
    ["周数", `${fmtLoose(rounds)}周`],
    ["立て方", standLabel(stand)],
    ...mark.rows
  ], capped ? warningHtml("最大整経長までに制限しました") : "");

  if (saveHistory) {
    addHistory({
      type: "warpReverse",
      title: "整経逆算",
      summary: `${fabric?.name || "-"} / ${skeinType.name} / ${fmtLoose(skeins, 0)}綛 / ${fmtLength(actual)}m / ${fmtLoose(rounds)}周`,
      data: { fabricName: fabric?.name || "-", customerName: customer?.name || "-", markSummary: mark.summary, skeinTypeName: skeinType.name, skeinLength: skeinType.length, skeins, yarn, ends, standLabel: standLabel(stand), theoretical, actual, rounds }
    });
  }
  return { theoretical, actual, rounds };
}

function calculateWarpDouble(saveHistory = false, normalizeLength = false) {
  const correction = normalizeLength ? normalizeWarpLengthInput("warpDoubleLength") : "";
  const fabric = getFabric($("#warpDoubleFabric").value);
  const skeinType = getWarpSkeinType($("#warpDoubleSkeinType").value);
  const length = value("warpDoubleLength");
  const loss = value("warpDoubleLoss");
  const groundEnds = Number(fabric?.warpEnds || 0);
  const upperEnds = Number(fabric?.upperEnds || 0);
  const upperMultiplier = Number(fabric?.upperMultiplier || 0);
  const error = firstError([
    validatePositive("整経長", length),
    length > appData.settings.maxWarpLength ? "最大整経長超過" : "",
    validateInteger("地立本数", groundEnds, 1),
    upperEnds > 0 ? "" : "織物マスターに上立本数を設定してください",
    validatePositive("上立倍率", upperMultiplier),
    validatePositive("ロス率", loss + 1)
  ]);

  if (error) {
    $("#warpDoubleResult").innerHTML = errorHtml(error);
    return null;
  }

  const lossFactor = factor(loss);
  const groundYarn = length * groundEnds * lossFactor;
  const upperYarn = length * upperEnds * upperMultiplier * lossFactor;
  const totalYarn = groundYarn + upperYarn;
  const groundSkeins = groundYarn / skeinType.length;
  const upperSkeins = upperYarn / skeinType.length;
  const totalSkeins = totalYarn / skeinType.length;
  const actualSkeins = Math.ceil(totalSkeins);
  const leftover = actualSkeins * skeinType.length - totalYarn;

  $("#warpDoubleResult").innerHTML = resultBox(`${actualSkeins}綛`, "実使用綛数", [
    ["織物種類", fabric?.name || "-"],
    ["整経長", `${fmtLength(length)}m`],
    ["綛種類", `${skeinType.name}（${fmtYarn(skeinType.length)}m）`],
    ["地立本数", `${fmtLoose(groundEnds, 0)}本`],
    ["上立本数", `${fmtLoose(upperEnds, 0)}本`],
    ["上立倍率", fmtLoose(upperMultiplier, 2)],
    ["地立必要糸量", `${fmtYarn(groundYarn)}m`],
    ["上立必要糸量", `${fmtYarn(upperYarn)}m`],
    ["総必要糸量", `${fmtYarn(totalYarn)}m`],
    ["地立必要綛数", `${fmtLoose(groundSkeins, 2)}綛`],
    ["上立必要綛数", `${fmtLoose(upperSkeins, 2)}綛`],
    ["合計必要綛数", `${fmtLoose(totalSkeins, 2)}綛`],
    ["実使用綛数", `${fmtLoose(actualSkeins, 0)}綛`],
    ["余り糸量", `${fmtYarn(leftover)}m`]
  ], correction ? warningHtml(correction) : "");

  if (saveHistory) {
    addHistory({
      type: "warpDouble",
      title: "2立整経",
      summary: `${fabric?.name || "-"} / ${skeinType.name} / ${fmtLoose(length)}m / ${actualSkeins}綛`,
      data: {
        fabricName: fabric?.name || "-",
        skeinTypeName: skeinType.name,
        skeinLength: skeinType.length,
        length,
        loss,
        groundEnds,
        upperEnds,
        upperMultiplier,
        groundYarn,
        upperYarn,
        totalYarn,
        groundSkeins,
        upperSkeins,
        totalSkeins,
        actualSkeins,
        leftover
      }
    });
  }

  return { groundYarn, upperYarn, totalYarn, groundSkeins, upperSkeins, totalSkeins, actualSkeins, leftover };
}

function unitLabel(unit) {
  if (unit === "kujira") return "鯨尺";
  if (unit === "meter") return "m";
  return "曲尺";
}

function addHistory(entry) {
  appData.history.unshift({
    id: makeId("history"),
    timestamp: new Date().toISOString(),
    ...entry
  });
  appData.history = appData.history.slice(0, HISTORY_LIMIT);
  renderHistory();
  saveState("履歴保存");
}

function renderHistory() {
  const items = appData.history.filter((item) => historyFilter === "all" || item.type === historyFilter);
  $("#historyList").innerHTML = items.map((item) => `
    <article class="recordRow">
      <header><strong>${escapeHtml(item.title)}</strong><small>${new Date(item.timestamp).toLocaleString("ja-JP")}</small></header>
      <div class="rowMeta">${escapeHtml(historyMeta(item))}</div>
      <div class="rowActions"><button class="danger" type="button" data-delete-history="${escapeHtml(item.id)}">削除</button></div>
    </article>
  `).join("") || `<div class="empty">履歴がありません</div>`;
}

function historyMeta(item) {
  if (item.type === "weft") {
    const data = item.data || {};
    const rolls = data.rolls || 1;
    const totalLength = data.totalLength || (Number(data.length || 0) * rolls);
    return `織物名 ${data.fabricName || "-"} / 長さ ${fmtLoose(data.length)}${unitLabel(data.unit)} × ${fmtLoose(rolls, 0)}反 / 総長さ ${fmtLoose(totalLength)}${unitLabel(data.unit)} / 打込み ${fmtLoose(data.picks, 0)} / 合わせ ${fmtLoose(data.ply, 0)}本 / 必要綛数 ${fmtLoose(data.skeins, 0)}綛`;
  }
  if (item.type === "warp") {
    const data = item.data || {};
    return `織物名 ${data.fabricName || "-"} / 綛種類 ${data.skeinTypeName || "4000回"} / 整経長 ${fmtLoose(data.length)}m / 経糸本数 ${fmtLoose(data.ends, 0)}本 / ${data.standLabel || "-"} / ロス率 ${fmtLoose(data.loss)}% / 必要糸量 ${fmtYarn(data.needed || 0)}m / 必要綛数 ${fmtLoose(data.skeins, 0)}綛 / 周数 ${fmtLength(data.rounds || 0)} / 納品先 ${data.customerName || "-"} / ${data.markSummary || "印なし"}`;
  }
  if (item.type === "warpReverse") {
    const data = item.data || {};
    return `織物名 ${data.fabricName || "-"} / 綛種類 ${data.skeinTypeName || "4000回"} / 綛数 ${fmtLoose(data.skeins, 0)}綛 / 糸量 ${fmtYarn(data.yarn || 0)}m / 経糸本数 ${fmtLoose(data.ends, 0)}本 / ${data.standLabel || "-"} / 整経可能長 ${fmtLength(data.theoretical || 0)}m / 実整経長 ${fmtLength(data.actual || 0)}m / 周数 ${fmtLoose(data.rounds || 0)}周 / 納品先 ${data.customerName || "-"} / ${data.markSummary || "印なし"}`;
  }
  if (item.type === "warpDouble") {
    const data = item.data || {};
    return `織物名 ${data.fabricName || "-"} / 綛種類 ${data.skeinTypeName || "4000回"} / 整経長 ${fmtLoose(data.length)}m / 地立 ${fmtLoose(data.groundEnds, 0)}本 / 上立 ${fmtLoose(data.upperEnds, 0)}本 × ${fmtLoose(data.upperMultiplier)} / 総必要糸量 ${fmtYarn(data.totalYarn || 0)}m / 合計必要綛数 ${fmtLoose(data.totalSkeins || 0)}綛 / 実使用綛数 ${fmtLoose(data.actualSkeins || 0)}綛`;
  }
  return item.summary || "";
}

function renderMasters() {
  $("#fabricList").innerHTML = appData.fabrics.map((fabric) => `
    <article class="recordRow">
      <header><strong>${escapeHtml(fabric.name)}</strong><small>${fmtLoose(fabric.widthCm)}cm</small></header>
      <div class="rowMeta">打込み初期値 ${fmtLoose(fabric.defaultPicks, 0)} / 地立本数 ${fmtLoose(fabric.warpEnds, 0)}本 / 上立本数 ${fmtLoose(fabric.upperEnds, 0)}本 / 上立倍率 ${fmtLoose(fabric.upperMultiplier)}</div>
      <div class="rowActions">
        <button type="button" data-edit-fabric="${escapeHtml(fabric.id)}">編集</button>
        <button class="danger" type="button" data-delete-fabric="${escapeHtml(fabric.id)}">削除</button>
      </div>
    </article>
  `).join("");

  $("#customerList").innerHTML = appData.customers.map((customer) => {
    const mark = `残り${fmtLoose(customer.markValue)}m`;
    return `
      <article class="recordRow">
        <header><strong>${escapeHtml(customer.name)}</strong><small>${mark}</small></header>
        <div class="rowMeta">${escapeHtml(customer.note || "-")}</div>
        <div class="rowActions">
          <button type="button" data-edit-customer="${escapeHtml(customer.id)}">編集</button>
          <button class="danger" type="button" data-delete-customer="${escapeHtml(customer.id)}">削除</button>
        </div>
      </article>
    `;
  }).join("");
}

function clearFabricForm() {
  setValue("fabricId", "");
  setValue("fabricName", "");
  setValue("fabricWidth", "");
  setValue("fabricPicks", "");
  setValue("fabricWarpEnds", "");
  setValue("fabricUpperEnds", "");
  setValue("fabricUpperMultiplier", "");
}

function clearCustomerForm() {
  setValue("customerId", "");
  setValue("customerName", "");
  setValue("customerMarkValue", "");
  setValue("customerNote", "");
}

function saveFabric() {
  const item = {
    id: $("#fabricId").value || makeId("fabric"),
    name: $("#fabricName").value.trim(),
    widthCm: value("fabricWidth"),
    defaultPicks: value("fabricPicks"),
    warpEnds: value("fabricWarpEnds"),
    upperEnds: value("fabricUpperEnds"),
    upperMultiplier: value("fabricUpperMultiplier")
  };
  const error = firstError([
    item.name ? "" : "名称を入力してください",
    validatePositive("巾", item.widthCm),
    validateInteger("打込み", item.defaultPicks, 1),
    validateInteger("経糸本数", item.warpEnds, 1),
    validateInteger("上立本数", item.upperEnds, 1),
    validatePositive("上立倍率", item.upperMultiplier)
  ]);
  if (error) {
    alert(error);
    return;
  }
  const index = appData.fabrics.findIndex((fabric) => fabric.id === item.id);
  if (index >= 0) appData.fabrics[index] = item;
  else appData.fabrics.push(item);
  clearFabricForm();
  renderSelects();
  renderMasters();
  calculateWarpNeed(false);
  calculateWarpReverse(false);
  calculateWarpDouble(false);
  saveState("マスター保存");
}

function saveCustomer() {
  const item = {
    id: $("#customerId").value || makeId("customer"),
    name: $("#customerName").value.trim(),
    markType: "remainingM",
    markValue: value("customerMarkValue"),
    note: $("#customerNote").value.trim()
  };
  const error = firstError([item.name ? "" : "納品先名を入力してください", validatePositive("印設定値", item.markValue)]);
  if (error) {
    alert(error);
    return;
  }
  const index = appData.customers.findIndex((customer) => customer.id === item.id);
  if (index >= 0) appData.customers[index] = item;
  else appData.customers.push(item);
  clearCustomerForm();
  renderSelects();
  renderMasters();
  saveState("マスター保存");
}

function deleteById(collection, id, label) {
  if (appData[collection].length <= 1) {
    alert(`${label}は最低1件必要です`);
    return;
  }
  if (!confirm(`${label}を削除しますか？`)) return;
  appData[collection] = appData[collection].filter((item) => item.id !== id);
  renderSelects();
  renderMasters();
  saveState("削除済み");
}

function renderAll() {
  renderSelects();
  restoreInputs();
  renderMasters();
  renderHistory();
  renderHome();
  calculateWeftNeed(false);
  calculateWeftReverse();
  calculateWarpNeed(false);
  calculateWarpReverse(false);
  calculateWarpDouble(false);
}

function switchPage(page) {
  $$(".page").forEach((section) => section.classList.toggle("active", section.id === `page-${page}`));
  $$(".bottomNav button").forEach((button) => button.classList.toggle("active", button.dataset.nav === page));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function switchTab(group, panel) {
  $$(`[data-tab-group="${group}"] [data-tab]`).forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === panel);
  });
  const page = $(`#page-${group}`) || $("#page-masters");
  $$("[data-panel]", page).forEach((section) => {
    section.classList.toggle("active", section.dataset.panel === panel);
  });
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv() {
  const rows = [["kind", "id", "name", "widthCm", "defaultPicks", "warpEnds", "upperEnds", "upperMultiplier", "markType", "markValue", "note", "timestamp", "type", "summary", "payloadJson"]];
  appData.fabrics.forEach((fabric) => rows.push(["fabric", fabric.id, fabric.name, fabric.widthCm, fabric.defaultPicks, fabric.warpEnds, fabric.upperEnds, fabric.upperMultiplier, "", "", "", "", "", "", ""]));
  appData.customers.forEach((customer) => rows.push(["customer", customer.id, customer.name, "", "", "", "", "", customer.markType, customer.markValue, customer.note, "", "", "", ""]));
  appData.history.forEach((history) => rows.push(["history", history.id, "", "", "", "", "", "", "", "", "", history.timestamp, history.type, history.summary || "", JSON.stringify(history)]));
  rows.push(["settings", "settings", "", "", "", "", "", "", "", "", "", "", "", "", JSON.stringify(appData.settings)]);
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((items) => items.some((item) => item !== ""));
}

async function importCsv(text) {
  const rows = parseCsv(text);
  const header = rows.shift();
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  const next = { ...clone(appData), fabrics: [], customers: [], history: [] };
  rows.forEach((row) => {
    const kind = row[index.kind];
    if (kind === "fabric") {
      next.fabrics.push({
        id: row[index.id] || makeId("fabric"),
        name: row[index.name],
        widthCm: Number(row[index.widthCm]),
        defaultPicks: Number(row[index.defaultPicks]),
        warpEnds: Number(row[index.warpEnds]),
        upperEnds: Number(row[index.upperEnds]),
        upperMultiplier: Number(row[index.upperMultiplier])
      });
    }
    if (kind === "customer") {
      next.customers.push({ id: row[index.id] || makeId("customer"), name: row[index.name], markType: "remainingM", markValue: Number(row[index.markValue]), note: row[index.note] || "" });
    }
    if (kind === "history" && row[index.payloadJson]) next.history.push(JSON.parse(row[index.payloadJson]));
    if (kind === "settings" && row[index.payloadJson]) next.settings = { ...next.settings, ...JSON.parse(row[index.payloadJson]) };
  });
  appData = normalizeState(next);
  await saveState("CSV取込", false);
  renderAll();
}

function download(text, filename, type) {
  const blob = new Blob([text], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-nav]");
    if (nav) switchPage(nav.dataset.nav);

    const tab = event.target.closest("[data-tab]");
    if (tab) switchTab(tab.closest("[data-tab-group]").dataset.tabGroup, tab.dataset.tab);

    const editFabric = event.target.closest("[data-edit-fabric]");
    if (editFabric) {
      const fabric = getFabric(editFabric.dataset.editFabric);
      setValue("fabricId", fabric.id);
      setValue("fabricName", fabric.name);
      setValue("fabricWidth", fabric.widthCm);
      setValue("fabricPicks", fabric.defaultPicks);
      setValue("fabricWarpEnds", fabric.warpEnds);
      setValue("fabricUpperEnds", fabric.upperEnds);
      setValue("fabricUpperMultiplier", fabric.upperMultiplier);
    }

    const editCustomer = event.target.closest("[data-edit-customer]");
    if (editCustomer) {
      const customer = getCustomer(editCustomer.dataset.editCustomer);
      setValue("customerId", customer.id);
      setValue("customerName", customer.name);
      setValue("customerMarkValue", customer.markValue);
      setValue("customerNote", customer.note);
    }

    const deleteFabric = event.target.closest("[data-delete-fabric]");
    if (deleteFabric) deleteById("fabrics", deleteFabric.dataset.deleteFabric, "織物マスター");

    const deleteCustomer = event.target.closest("[data-delete-customer]");
    if (deleteCustomer) deleteById("customers", deleteCustomer.dataset.deleteCustomer, "納品先マスター");

    const deleteHistory = event.target.closest("[data-delete-history]");
    if (deleteHistory) {
      appData.history = appData.history.filter((item) => item.id !== deleteHistory.dataset.deleteHistory);
      renderHistory();
      saveState("履歴削除");
    }

    const historyButton = event.target.closest("[data-history-filter]");
    if (historyButton) {
      historyFilter = historyButton.dataset.historyFilter;
      $$(".historyFilters button").forEach((button) => button.classList.toggle("active", button === historyButton));
      renderHistory();
    }
  });

  $$("[data-fabric-select]").forEach((select) => {
    select.addEventListener("change", () => {
      applyFabricDefault(select);
      calculateWeftNeed(false);
      calculateWeftReverse();
      calculateWarpNeed(false);
      calculateWarpReverse(false);
      calculateWarpDouble(false);
      captureInputs();
      saveState("入力保存");
    });
  });

  [
    ["weftNeedForm", () => calculateWeftNeed(false)],
    ["weftReverseForm", calculateWeftReverse],
    ["warpNeedForm", () => calculateWarpNeed(false)],
    ["warpReverseForm", () => calculateWarpReverse(false)],
    ["warpDoubleForm", () => calculateWarpDouble(false)]
  ].forEach(([id, handler]) => {
    const form = $(`#${id}`);
    form.addEventListener("input", () => {
      handler();
      captureInputs();
      saveState("入力保存");
    });
    form.addEventListener("change", () => {
      handler();
      captureInputs();
      saveState("入力保存");
    });
  });

  $("#warpLength").addEventListener("blur", () => calculateWarpNeed(false, true));
  $("#warpDoubleLength").addEventListener("blur", () => calculateWarpDouble(false, true));

  $("#weftNeedForm").addEventListener("submit", (event) => {
    event.preventDefault();
    captureInputs();
    calculateWeftNeed(true);
    saveState("入力保存");
  });
  $("#weftReverseForm").addEventListener("submit", (event) => {
    event.preventDefault();
    calculateWeftReverse();
  });
  $("#warpNeedForm").addEventListener("submit", (event) => {
    event.preventDefault();
    captureInputs();
    calculateWarpNeed(true, true);
    saveState("入力保存");
  });
  $("#warpReverseForm").addEventListener("submit", (event) => {
    event.preventDefault();
    captureInputs();
    calculateWarpReverse(true);
    saveState("入力保存");
  });
  $("#warpDoubleForm").addEventListener("submit", (event) => {
    event.preventDefault();
    captureInputs();
    calculateWarpDouble(true, true);
    saveState("入力保存");
  });

  $("#fabricForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveFabric();
  });
  $("#customerForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveCustomer();
  });
  $("#fabricClear").addEventListener("click", clearFabricForm);
  $("#customerClear").addEventListener("click", clearCustomerForm);

  $("#settingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    appData.settings = {
      weftLoss: value("settingWeftLoss"),
      warpLoss: value("settingWarpLoss"),
      skeinLength: value("settingSkeinLength"),
      drumLength: value("settingDrumLength"),
      maxWarpLength: value("settingMaxWarpLength")
    };
    appData = normalizeState(appData);
    restoreInputs();
    renderHome();
    calculateWarpNeed(false);
    calculateWarpReverse(false);
    calculateWarpDouble(false);
    await saveState("設定保存");
  });

  $("#csvExport").addEventListener("click", () => download(toCsv(), "orimono-tool-backup.csv", "text/csv;charset=utf-8"));
  $("#jsonExport").addEventListener("click", () => download(JSON.stringify(appData, null, 2), "orimono-tool-data.json", "application/json;charset=utf-8"));
  $("#csvImport").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    await importCsv(await file.text());
    event.target.value = "";
  });
  $("#jsonImport").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    appData = normalizeState(JSON.parse(await file.text()));
    await saveState("インポート", false);
    renderAll();
    event.target.value = "";
  });
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./service-worker.js");
    } catch {
      $("#saveState").textContent = "ローカル保存";
    }
  }
}

async function init() {
  try {
    db = await openDatabase();
    appData = normalizeState(await idbGet(STATE_KEY));
    await saveState("保存済み", false);
    bindEvents();
    renderAll();
    registerServiceWorker();
    window.__orimonoToolReady = true;
  } catch (error) {
    $("#saveState").textContent = "保存不可";
    console.error(error);
  }
}

init();
