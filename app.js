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
  yarnTypes: [
    { id: "yarn-skein", name: "綛", length: 5080, unit: "綛" },
    { id: "yarn-gold", name: "金糸", length: 10000, unit: "本" },
    { id: "yarn-polyester-150d-w", name: "150dテトロンW", length: 60000, unit: "本" }
  ],
  customers: [
    { id: "customer-default", name: "標準納品先", markType: "remainingM", markValue: 14, markValue2: null, warpJointLoss: 4, weavingShrinkage: 8, note: "残り14mで印" }
  ],
  history: [],
  lastInputs: {
    weftNeed: { fabricId: "fabric-standard", yarnTypeId: "yarn-skein", length: 10, unit: "kujira", rolls: 1, picks: 86, ply: 1, loss: 11 },
    weftReverse: { quantity: 1, yarnTypeId: "yarn-skein", fabricId: "fabric-standard", picks: 86, ply: 1, loss: 11 },
    warpNeed: { fabricId: "fabric-standard", customerId: "customer-default", skeinTypeId: "4000", length: 84, ends: 2680, stand: "1", loss: 1 },
    warpReverse: { skeins: 20, skeinTypeId: "4000", fabricId: "fabric-standard", customerId: "customer-default", ends: 2680, stand: "1", loss: 1 },
    warpDouble: { fabricId: "fabric-standard", skeinTypeId: "4000", length: 84, upperLength: 119, loss: 1 }
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
      upperEnds: optionalNonNegativeInteger(item.upperEnds),
      upperMultiplier: optionalPositiveNumber(item.upperMultiplier)
    })),
    yarnTypes: normalizeCollection(source.yarnTypes, defaults.yarnTypes, (item, index) => ({
      id: item.id || makeId("yarn-type"),
      name: item.name || "未設定",
      length: toInteger(item.length ?? item.lengthMeters, defaults.yarnTypes[index]?.length || defaults.yarnTypes[0].length),
      unit: item.unit || item.unitLabel || defaults.yarnTypes[index]?.unit || "本"
    })),
    customers: normalizeCollection(source.customers, defaults.customers, (item) => ({
      id: item.id || makeId("customer"),
      name: item.name || item.customer || "未設定",
      markType: "remainingM",
      markValue: toNumber(item.markValue ?? item.value, defaults.customers[0].markValue),
      markValue2: optionalPositiveNumber(item.markValue2),
      warpJointLoss: Math.max(0, toNumber(item.warpJointLoss ?? item.jointLoss, defaults.customers[0].warpJointLoss)),
      weavingShrinkage: Math.max(0, toNumber(item.weavingShrinkage ?? item.shrinkageRate, defaults.customers[0].weavingShrinkage)),
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
  if (source.lastInputs?.weftReverse?.quantity == null && source.lastInputs?.weftReverse?.skeins != null) {
    state.lastInputs.weftReverse.quantity = source.lastInputs.weftReverse.skeins;
  }
  if (source.lastInputs?.weftReverse?.quantity == null && source.lastInputs?.weftReverse?.yarn) {
    state.lastInputs.weftReverse.quantity = Math.max(1, Math.ceil(Number(source.lastInputs.weftReverse.yarn) / defaults.yarnTypes[0].length));
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
  state.lastInputs.weftNeed.yarnTypeId = keepId(state.yarnTypes, state.lastInputs.weftNeed.yarnTypeId);
  state.lastInputs.weftNeed.rolls = toInteger(state.lastInputs.weftNeed.rolls, defaults.lastInputs.weftNeed.rolls);
  state.lastInputs.weftReverse.fabricId = keepId(state.fabrics, state.lastInputs.weftReverse.fabricId);
  state.lastInputs.weftReverse.yarnTypeId = keepId(state.yarnTypes, state.lastInputs.weftReverse.yarnTypeId);
  state.lastInputs.warpNeed.fabricId = keepId(state.fabrics, state.lastInputs.warpNeed.fabricId);
  state.lastInputs.warpReverse.fabricId = keepId(state.fabrics, state.lastInputs.warpReverse.fabricId);
  state.lastInputs.warpDouble.fabricId = keepId(state.fabrics, state.lastInputs.warpDouble.fabricId);
  state.lastInputs.warpNeed.customerId = keepId(state.customers, state.lastInputs.warpNeed.customerId);
  state.lastInputs.warpReverse.customerId = keepId(state.customers, state.lastInputs.warpReverse.customerId);
  state.lastInputs.warpNeed.skeinTypeId = keepWarpSkeinType(state.lastInputs.warpNeed.skeinTypeId ?? state.lastInputs.warpNeed.skeinType);
  state.lastInputs.warpReverse.skeinTypeId = keepWarpSkeinType(state.lastInputs.warpReverse.skeinTypeId ?? state.lastInputs.warpReverse.skeinType);
  state.lastInputs.warpDouble.skeinTypeId = keepWarpSkeinType(state.lastInputs.warpDouble.skeinTypeId ?? state.lastInputs.warpDouble.skeinType);
  state.lastInputs.weftReverse.quantity = toInteger(state.lastInputs.weftReverse.quantity, defaults.lastInputs.weftReverse.quantity);
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

function hasInput(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function optionalPositiveNumber(value) {
  if (!hasInput(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function optionalNonNegativeInteger(value) {
  if (!hasInput(value)) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function effectiveUpperEnds(fabric) {
  return fabric?.upperEnds == null ? 0 : Number(fabric.upperEnds);
}

function effectiveUpperMultiplier(fabric) {
  return fabric?.upperMultiplier == null ? 1 : Number(fabric.upperMultiplier);
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

function getYarnType(id) {
  return appData.yarnTypes.find((item) => item.id === id) || appData.yarnTypes[0];
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

function validateNonNegativeInteger(label, number) {
  return Number.isInteger(Number(number)) && Number(number) >= 0 ? "" : `${label}は0以上の整数で入力してください`;
}

function validateOptionalPositive(label, value) {
  if (!hasInput(value)) return "";
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? "" : `${label}は0より大きい数値で入力してください`;
}

function validateOptionalNonNegative(label, value) {
  if (!hasInput(value)) return "";
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? "" : `${label}は0以上の数値で入力してください`;
}

function validateOptionalNonNegativeInteger(label, value) {
  if (!hasInput(value)) return "";
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? "" : `${label}は0以上の整数で入力してください`;
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
      const marks = [customer.markValue, customer.markValue2]
        .filter((mark) => mark != null && Number(mark) > 0)
        .map((mark) => `残り${fmtLoose(mark)}m`)
        .join(" / ");
      const mark = marks || "印なし";
      return `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)} / ${mark}</option>`;
    }).join("");
    select.value = appData.customers.some((customer) => customer.id === current) ? current : appData.customers[0]?.id;
  });

  $$("[data-yarn-type-select]").forEach((select) => {
    const current = select.value;
    select.innerHTML = appData.yarnTypes
      .map((yarnType) => `<option value="${escapeHtml(yarnType.id)}">${escapeHtml(yarnType.name)} / ${fmtYarn(yarnType.length)}m</option>`)
      .join("");
    select.value = appData.yarnTypes.some((yarnType) => yarnType.id === current) ? current : appData.yarnTypes[0]?.id;
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
  const doubleFabric = getFabric(last.warpDouble.fabricId);
  const defaultDoubleUpperLength = toWarpUnitLength(last.warpDouble.length * effectiveUpperMultiplier(doubleFabric));
  Object.entries({
    weftFabric: last.weftNeed.fabricId,
    weftYarnType: last.weftNeed.yarnTypeId,
    weftLength: last.weftNeed.length,
    weftUnit: last.weftNeed.unit,
    weftRolls: last.weftNeed.rolls,
    weftPicks: last.weftNeed.picks,
    weftPly: last.weftNeed.ply,
    weftLoss: last.weftNeed.loss,
    weftReverseQuantity: last.weftReverse.quantity,
    weftReverseYarnType: last.weftReverse.yarnTypeId,
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
    warpDoubleUpperLength: defaultDoubleUpperLength,
    warpDoubleSkeinType: last.warpDouble.skeinTypeId,
    warpDoubleLoss: last.warpDouble.loss,
    settingWeftLoss: appData.settings.weftLoss,
    settingWarpLoss: appData.settings.warpLoss,
    settingSkeinLength: appData.settings.skeinLength,
    settingDrumLength: appData.settings.drumLength,
    settingMaxWarpLength: appData.settings.maxWarpLength
  }).forEach(([id, val]) => setValue(id, val));
  const upperLengthElement = $("#warpDoubleUpperLength");
  if (upperLengthElement) upperLengthElement.dataset.manual = "false";
}

function captureInputs() {
  appData.lastInputs.weftNeed = {
    fabricId: $("#weftFabric").value,
    yarnTypeId: $("#weftYarnType").value,
    length: value("weftLength"),
    unit: $("#weftUnit").value,
    rolls: value("weftRolls"),
    picks: value("weftPicks"),
    ply: value("weftPly"),
    loss: value("weftLoss")
  };
  appData.lastInputs.weftReverse = {
    quantity: value("weftReverseQuantity"),
    yarnTypeId: $("#weftReverseYarnType").value,
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
    upperLength: value("warpDoubleUpperLength"),
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
  const yarnType = getYarnType($("#weftYarnType").value);
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
  const realQuantity = rawTotal / yarnType.length;
  const quantity = Math.ceil(realQuantity);
  const remainder = quantity * yarnType.length - rawTotal;
  const quantityLabel = yarnType.unit === "綛" ? "必要綛数" : "必要数量";
  const realQuantityLabel = yarnType.unit === "綛" ? "実必要綛数" : "実必要数量";

  $("#weftNeedResult").innerHTML = resultBox(`${quantity}${yarnType.unit}`, quantityLabel, [
    [realQuantityLabel, `${fmtLoose(realQuantity, 2)}${yarnType.unit}`],
    ["糸種類", `${yarnType.name}（${fmtYarn(yarnType.length)}m）`],
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
      summary: `${fabric.name} / ${yarnType.name} / ${fmtLoose(length)}${unitLabel(unit)} × ${fmtLoose(rolls, 0)}反 / ${quantity}${yarnType.unit}`,
      data: { fabricName: fabric.name, yarnTypeName: yarnType.name, yarnTypeLength: yarnType.length, yarnTypeUnit: yarnType.unit, length, unit, rolls, totalLength, picks, ply, quantity, realQuantity, skeins: quantity }
    });
  }
  return { theoretical, withLoss, rawTotal, quantity, remainder };
}

function calculateWeftReverse() {
  const fabric = getFabric($("#weftReverseFabric").value);
  const yarnType = getYarnType($("#weftReverseYarnType").value);
  const quantity = value("weftReverseQuantity");
  const picks = value("weftReversePicks");
  const ply = value("weftReversePly");
  const loss = value("weftReverseLoss");
  const error = firstError([
    validateInteger("数量", quantity, 1),
    validateInteger("打込み", picks, 1),
    validateInteger("合わせ本数", ply, 1)
  ]);

  if (error) {
    $("#weftReverseResult").innerHTML = errorHtml(error);
    return;
  }

  const yarn = quantity * yarnType.length;
  const denominator = (10 * picks * fabric.widthCm / 100) * factor(loss) * ply;
  const units = fromKane(yarn / denominator);
  $("#weftReverseResult").innerHTML = resultBox(`${fmtLength(units.kujira)}鯨尺`, "織れる長さ", [
    ["糸種類", `${yarnType.name}（${fmtYarn(yarnType.length)}m）`],
    ["数量", `${fmtLoose(quantity, 0)}${yarnType.unit}`],
    ["使用可能糸量", `${fmtYarn(yarn)}m`],
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

function toWarpUnitLength(length) {
  const number = Number(length);
  if (!Number.isFinite(number) || number <= 0) return 0;
  const drum = appData.settings.drumLength;
  return Math.max(drum, Math.round(number / drum) * drum);
}

function getDefaultWarpDoubleUpperLength() {
  const fabric = getFabric($("#warpDoubleFabric")?.value || appData.lastInputs?.warpDouble?.fabricId);
  const groundLength = value("warpDoubleLength", appData.lastInputs?.warpDouble?.length || defaults.lastInputs.warpDouble.length);
  return toWarpUnitLength(groundLength * effectiveUpperMultiplier(fabric));
}

function syncWarpDoubleUpperLength() {
  const element = $("#warpDoubleUpperLength");
  if (!element) return;
  const defaultLength = getDefaultWarpDoubleUpperLength();
  if (defaultLength > 0) {
    element.value = defaultLength;
    element.dataset.manual = "false";
  }
}

function getActualWeavingLength(length, customer) {
  const warpJointLoss = Number(customer?.warpJointLoss || 0);
  const weavingShrinkage = Number(customer?.weavingShrinkage || 0);
  return Math.max(0, length - warpJointLoss - (length * weavingShrinkage / 100));
}

function getMarkInfo(length, customer) {
  if (!customer) return { rows: [], summary: "" };
  const drum = appData.settings.drumLength;
  const markValues = [customer.markValue, customer.markValue2]
    .map((mark) => Number(mark))
    .filter((mark) => Number.isFinite(mark) && mark > 0)
    .sort((a, b) => a - b);
  const markLabels = markValues.map((mark) => `残り${fmtLoose(mark)}m`).join(" / ");
  const endLabel = `${fmtLength(length)}m / ${fmtLoose(length / drum)}周`;
  const activeMarks = markValues.filter((mark) => length > mark);

  if (!activeMarks.length) {
    return {
      summary: "印なし",
      rows: [
        ["納品先", customer.name],
        ["印判定", "印なし"],
        ["印設定", markLabels || "-"],
        ["終了位置", endLabel]
      ]
    };
  }

  const markRounds = activeMarks.map((mark) => `${fmtLoose(mark / drum)}周`);
  return {
    summary: `印 ${markRounds.join(" / ")}`,
    rows: [
      ["納品先", customer.name],
      ["印判定", "印あり"],
      ["印周数", markRounds.join("<br>")],
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
  const realSkeins = needed / skeinType.length;
  const skeins = Math.ceil(realSkeins);
  const rounds = length / appData.settings.drumLength;
  const actualWeavingLength = getActualWeavingLength(length, customer);
  const mark = getMarkInfo(length, customer);
  $("#warpNeedResult").innerHTML = resultBox(`${fmtLength(actualWeavingLength)}m`, "実織長", [
    ["必要綛数", `${skeins}綛`],
    ["実必要綛数", `${fmtLoose(realSkeins, 2)}綛`],
    ["織物種類", fabric?.name || "-"],
    ["綛種類", `${skeinType.name}（${fmtYarn(skeinType.length)}m）`],
    ["整経長", `${fmtLength(length)}m`],
    ["必要糸量", `${fmtYarn(needed)}m`],
    ["経糸本数", `${fmtLoose(ends, 0)}本`],
    ["立て方", standLabel(stand)],
    ["周数", `${fmtLength(rounds)}周`],
    ["経継ロス", `${fmtLength(Number(customer?.warpJointLoss || 0))}m`],
    ["織縮率", `${fmtLoose(Number(customer?.weavingShrinkage || 0))}%`],
    ...mark.rows
  ], correction ? warningHtml(correction) : "");

  if (saveHistory) {
    addHistory({
      type: "warp",
      title: "整経計算",
      summary: `${fabric?.name || "-"} / ${skeinType.name} / ${fmtLoose(length)}m / 実織長 ${fmtLength(actualWeavingLength)}m / ${skeins}綛`,
      data: { fabricName: fabric?.name || "-", customerName: customer?.name || "-", markSummary: mark.summary, skeinTypeName: skeinType.name, skeinLength: skeinType.length, length, ends, standLabel: standLabel(stand), loss, needed, realSkeins, skeins, rounds, actualWeavingLength }
    });
  }
  return { needed, realSkeins, skeins, rounds, actualWeavingLength };
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
  const actualWeavingLength = getActualWeavingLength(actual, customer);
  const mark = getMarkInfo(actual, customer);
  $("#warpReverseResult").innerHTML = resultBox(`${fmtLength(actualWeavingLength)}m`, "実織長", [
    ["織物種類", fabric?.name || "-"],
    ["綛種類", `${skeinType.name}（${fmtYarn(skeinType.length)}m）`],
    ["綛数", `${fmtLoose(skeins, 0)}綛`],
    ["換算糸量", `${fmtYarn(yarn)}m`],
    ["理論整経長", `${fmtLength(theoretical)}m`],
    ["実整経長", `${fmtLength(actual)}m`],
    ["周数", `${fmtLoose(rounds)}周`],
    ["立て方", standLabel(stand)],
    ["経継ロス", `${fmtLength(Number(customer?.warpJointLoss || 0))}m`],
    ["織縮率", `${fmtLoose(Number(customer?.weavingShrinkage || 0))}%`],
    ...mark.rows
  ], capped ? warningHtml("最大整経長までに制限しました") : "");

  if (saveHistory) {
    addHistory({
      type: "warpReverse",
      title: "整経逆算",
      summary: `${fabric?.name || "-"} / ${skeinType.name} / ${fmtLoose(skeins, 0)}綛 / 実織長 ${fmtLength(actualWeavingLength)}m / ${fmtLoose(rounds)}周`,
      data: { fabricName: fabric?.name || "-", customerName: customer?.name || "-", markSummary: mark.summary, skeinTypeName: skeinType.name, skeinLength: skeinType.length, skeins, yarn, ends, standLabel: standLabel(stand), theoretical, actual, rounds, actualWeavingLength }
    });
  }
  return { theoretical, actual, rounds, actualWeavingLength };
}

function calculateWarpDouble(saveHistory = false, normalizeLength = false) {
  const corrections = [];
  if (normalizeLength) {
    const groundCorrection = normalizeWarpLengthInput("warpDoubleLength");
    if (groundCorrection) {
      corrections.push(`地立整経長: ${groundCorrection}`);
      syncWarpDoubleUpperLength();
    }
    const upperCorrection = normalizeWarpLengthInput("warpDoubleUpperLength");
    if (upperCorrection) corrections.push(`上立整経長: ${upperCorrection}`);
  }
  const fabric = getFabric($("#warpDoubleFabric").value);
  const skeinType = getWarpSkeinType($("#warpDoubleSkeinType").value);
  const length = value("warpDoubleLength");
  const upperLength = value("warpDoubleUpperLength");
  const loss = value("warpDoubleLoss");
  const groundEnds = Number(fabric?.warpEnds || 0);
  const upperEnds = effectiveUpperEnds(fabric);
  const upperMultiplier = effectiveUpperMultiplier(fabric);
  const error = firstError([
    validatePositive("地立整経長", length),
    validatePositive("上立整経長", upperLength),
    length > appData.settings.maxWarpLength ? "地立整経長が最大整経長を超過しています" : "",
    upperLength > appData.settings.maxWarpLength ? "上立整経長が最大整経長を超過しています" : "",
    validateInteger("地立本数", groundEnds, 1),
    validateNonNegativeInteger("上立本数", upperEnds),
    validatePositive("上立倍率", upperMultiplier),
    validatePositive("ロス率", loss + 1)
  ]);

  if (error) {
    $("#warpDoubleResult").innerHTML = errorHtml(error);
    return null;
  }

  const groundYarn = length * groundEnds;
  const upperYarn = upperLength * upperEnds;
  const totalYarn = (groundYarn + upperYarn) * factor(loss);
  const totalSkeins = totalYarn / skeinType.length;
  const actualSkeins = Math.ceil(totalSkeins);
  const leftover = actualSkeins * skeinType.length - totalYarn;

  $("#warpDoubleResult").innerHTML = resultBox(`${actualSkeins}綛`, "実使用綛数", [
    ["織物種類", fabric?.name || "-"],
    ["地立整経長", `${fmtLength(length)}m`],
    ["上立整経長", `${fmtLength(upperLength)}m`],
    ["綛種類", `${skeinType.name}（${fmtYarn(skeinType.length)}m）`],
    ["地立本数", `${fmtLoose(groundEnds, 0)}本`],
    ["上立本数", `${fmtLoose(upperEnds, 0)}本`],
    ["上立倍率", `${fmtLoose(upperMultiplier)}`],
    ["地立必要糸量", `${fmtYarn(groundYarn)}m`],
    ["上立必要糸量", `${fmtYarn(upperYarn)}m`],
    ["総必要糸量", `${fmtYarn(totalYarn)}m`],
    ["実必要綛数", `${fmtLoose(totalSkeins, 2)}綛`],
    ["実使用綛数", `${fmtLoose(actualSkeins, 0)}綛`],
    ["余り糸量", `${fmtYarn(leftover)}m`]
  ], corrections.length ? warningHtml(corrections.join("<br>")) : "");

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
        upperLength,
        loss,
        groundEnds,
        upperEnds,
        upperMultiplier,
        groundYarn,
        upperYarn,
        totalYarn,
        totalSkeins,
        actualSkeins,
        leftover
      }
    });
  }

  return { groundYarn, upperYarn, totalYarn, totalSkeins, actualSkeins, leftover };
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
    const quantity = data.quantity ?? data.skeins ?? 0;
    return `織物名 ${data.fabricName || "-"} / 糸種類 ${data.yarnTypeName || "綛"} / 長さ ${fmtLoose(data.length)}${unitLabel(data.unit)} × ${fmtLoose(rolls, 0)}反 / 総長さ ${fmtLoose(totalLength)}${unitLabel(data.unit)} / 打込み ${fmtLoose(data.picks, 0)} / 合わせ ${fmtLoose(data.ply, 0)}本 / 必要数量 ${fmtLoose(quantity, 0)}${data.yarnTypeUnit || "綛"} / 実必要数量 ${fmtLoose(data.realQuantity || quantity, 2)}${data.yarnTypeUnit || "綛"}`;
  }
  if (item.type === "warp") {
    const data = item.data || {};
    return `織物名 ${data.fabricName || "-"} / 綛種類 ${data.skeinTypeName || "4000回"} / 整経長 ${fmtLoose(data.length)}m / 実織長 ${fmtLength(data.actualWeavingLength ?? data.length ?? 0)}m / 経糸本数 ${fmtLoose(data.ends, 0)}本 / ${data.standLabel || "-"} / ロス率 ${fmtLoose(data.loss)}% / 必要糸量 ${fmtYarn(data.needed || 0)}m / 必要綛数 ${fmtLoose(data.skeins, 0)}綛 / 実必要綛数 ${fmtLoose(data.realSkeins || data.skeins || 0, 2)}綛 / 周数 ${fmtLength(data.rounds || 0)} / 納品先 ${data.customerName || "-"} / ${data.markSummary || "印なし"}`;
  }
  if (item.type === "warpReverse") {
    const data = item.data || {};
    return `織物名 ${data.fabricName || "-"} / 綛種類 ${data.skeinTypeName || "4000回"} / 綛数 ${fmtLoose(data.skeins, 0)}綛 / 糸量 ${fmtYarn(data.yarn || 0)}m / 経糸本数 ${fmtLoose(data.ends, 0)}本 / ${data.standLabel || "-"} / 整経可能長 ${fmtLength(data.theoretical || 0)}m / 実整経長 ${fmtLength(data.actual || 0)}m / 実織長 ${fmtLength(data.actualWeavingLength ?? data.actual ?? 0)}m / 周数 ${fmtLoose(data.rounds || 0)}周 / 納品先 ${data.customerName || "-"} / ${data.markSummary || "印なし"}`;
  }
  if (item.type === "warpDouble") {
    const data = item.data || {};
    return `織物名 ${data.fabricName || "-"} / 綛種類 ${data.skeinTypeName || "4000回"} / 地立整経長 ${fmtLoose(data.length)}m / 上立整経長 ${fmtLoose(data.upperLength || 0)}m / 地立 ${fmtLoose(data.groundEnds, 0)}本 / 上立 ${fmtLoose(data.upperEnds, 0)}本 / 総必要糸量 ${fmtYarn(data.totalYarn || 0)}m / 必要綛数 ${fmtLoose(data.totalSkeins || 0)}綛 / 実使用綛数 ${fmtLoose(data.actualSkeins || 0)}綛`;
  }
  return item.summary || "";
}

function renderMasters() {
  $("#fabricList").innerHTML = appData.fabrics.map((fabric) => `
    <article class="recordRow">
      <header><strong>${escapeHtml(fabric.name)}</strong><small>${fmtLoose(fabric.widthCm)}cm</small></header>
      <div class="rowMeta">打込み初期値 ${fmtLoose(fabric.defaultPicks, 0)} / 地立本数 ${fmtLoose(fabric.warpEnds, 0)}本 / 上立本数 ${fabric.upperEnds == null ? "未入力（0本扱い）" : `${fmtLoose(fabric.upperEnds, 0)}本`} / 上立倍率 ${fabric.upperMultiplier == null ? "未入力（1扱い）" : fmtLoose(fabric.upperMultiplier)}</div>
      <div class="rowActions">
        <button type="button" data-edit-fabric="${escapeHtml(fabric.id)}">編集</button>
        <button class="danger" type="button" data-delete-fabric="${escapeHtml(fabric.id)}">削除</button>
      </div>
    </article>
  `).join("");

  $("#yarnTypeList").innerHTML = appData.yarnTypes.map((yarnType) => `
    <article class="recordRow">
      <header><strong>${escapeHtml(yarnType.name)}</strong><small>${fmtYarn(yarnType.length)}m</small></header>
      <div class="rowMeta">表示単位 ${escapeHtml(yarnType.unit)}</div>
      <div class="rowActions">
        <button type="button" data-edit-yarn-type="${escapeHtml(yarnType.id)}">編集</button>
        <button class="danger" type="button" data-delete-yarn-type="${escapeHtml(yarnType.id)}">削除</button>
      </div>
    </article>
  `).join("");

  $("#customerList").innerHTML = appData.customers.map((customer) => {
    const marks = [customer.markValue, customer.markValue2]
      .filter((mark) => mark != null && Number(mark) > 0)
      .map((mark) => `残り${fmtLoose(mark)}m`)
      .join(" / ");
    return `
      <article class="recordRow">
        <header><strong>${escapeHtml(customer.name)}</strong><small>${escapeHtml(marks || "印なし")}</small></header>
        <div class="rowMeta">経継ロス ${fmtLength(Number(customer.warpJointLoss || 0))}m / 織縮率 ${fmtLoose(Number(customer.weavingShrinkage || 0))}% / ${escapeHtml(customer.note || "-")}</div>
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
  setValue("customerWarpJointLoss", "");
  setValue("customerWeavingShrinkage", "");
  setValue("customerMarkValue", "");
  setValue("customerMarkValue2", "");
  setValue("customerNote", "");
}

function clearYarnTypeForm() {
  setValue("yarnTypeId", "");
  setValue("yarnTypeName", "");
  setValue("yarnTypeLength", "");
  setValue("yarnTypeUnit", "本");
}

function saveFabric() {
  const upperEndsRaw = $("#fabricUpperEnds").value;
  const upperMultiplierRaw = $("#fabricUpperMultiplier").value;
  const item = {
    id: $("#fabricId").value || makeId("fabric"),
    name: $("#fabricName").value.trim(),
    widthCm: value("fabricWidth"),
    defaultPicks: value("fabricPicks"),
    warpEnds: value("fabricWarpEnds"),
    upperEnds: optionalNonNegativeInteger(upperEndsRaw),
    upperMultiplier: optionalPositiveNumber(upperMultiplierRaw)
  };
  const error = firstError([
    item.name ? "" : "名称を入力してください",
    validatePositive("巾", item.widthCm),
    validateInteger("打込み", item.defaultPicks, 1),
    validateInteger("経糸本数", item.warpEnds, 1),
    validateOptionalNonNegativeInteger("上立本数", upperEndsRaw),
    validateOptionalPositive("上立倍率", upperMultiplierRaw)
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

function saveYarnType() {
  const item = {
    id: $("#yarnTypeId").value || makeId("yarn-type"),
    name: $("#yarnTypeName").value.trim(),
    length: value("yarnTypeLength"),
    unit: $("#yarnTypeUnit").value
  };
  const error = firstError([
    item.name ? "" : "名称を入力してください",
    validateInteger("長さ", item.length, 1),
    item.unit ? "" : "表示単位を選択してください"
  ]);
  if (error) {
    alert(error);
    return;
  }
  const index = appData.yarnTypes.findIndex((yarnType) => yarnType.id === item.id);
  if (index >= 0) appData.yarnTypes[index] = item;
  else appData.yarnTypes.push(item);
  clearYarnTypeForm();
  renderSelects();
  renderMasters();
  calculateWeftNeed(false);
  calculateWeftReverse();
  saveState("マスター保存");
}

function saveCustomer() {
  const markValue2Raw = $("#customerMarkValue2").value;
  const item = {
    id: $("#customerId").value || makeId("customer"),
    name: $("#customerName").value.trim(),
    markType: "remainingM",
    markValue: value("customerMarkValue"),
    markValue2: optionalPositiveNumber(markValue2Raw),
    warpJointLoss: value("customerWarpJointLoss"),
    weavingShrinkage: value("customerWeavingShrinkage"),
    note: $("#customerNote").value.trim()
  };
  const error = firstError([
    item.name ? "" : "納品先名を入力してください",
    validateOptionalNonNegative("経継ロス", $("#customerWarpJointLoss").value),
    validateOptionalNonNegative("織縮率", $("#customerWeavingShrinkage").value),
    validatePositive("印位置1", item.markValue),
    validateOptionalPositive("印位置2", markValue2Raw)
  ]);
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
  calculateWarpNeed(false);
  calculateWarpReverse(false);
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
  const rows = [["kind", "id", "name", "widthCm", "defaultPicks", "warpEnds", "upperEnds", "upperMultiplier", "yarnLength", "yarnUnit", "markType", "markValue", "markValue2", "warpJointLoss", "weavingShrinkage", "note", "timestamp", "type", "summary", "payloadJson"]];
  appData.fabrics.forEach((fabric) => rows.push(["fabric", fabric.id, fabric.name, fabric.widthCm, fabric.defaultPicks, fabric.warpEnds, fabric.upperEnds, fabric.upperMultiplier, "", "", "", "", "", "", "", "", "", "", "", ""]));
  appData.yarnTypes.forEach((yarnType) => rows.push(["yarnType", yarnType.id, yarnType.name, "", "", "", "", "", yarnType.length, yarnType.unit, "", "", "", "", "", "", "", "", "", ""]));
  appData.customers.forEach((customer) => rows.push(["customer", customer.id, customer.name, "", "", "", "", "", "", "", customer.markType, customer.markValue, customer.markValue2, customer.warpJointLoss, customer.weavingShrinkage, customer.note, "", "", "", ""]));
  appData.history.forEach((history) => rows.push(["history", history.id, "", "", "", "", "", "", "", "", "", "", "", "", "", "", history.timestamp, history.type, history.summary || "", JSON.stringify(history)]));
  rows.push(["settings", "settings", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", JSON.stringify(appData.settings)]);
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
  const next = { ...clone(appData), fabrics: [], yarnTypes: [], customers: [], history: [] };
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
      next.customers.push({
        id: row[index.id] || makeId("customer"),
        name: row[index.name],
        markType: "remainingM",
        markValue: Number(row[index.markValue]),
        markValue2: row[index.markValue2],
        warpJointLoss: row[index.warpJointLoss],
        weavingShrinkage: row[index.weavingShrinkage],
        note: row[index.note] || ""
      });
    }
    if (kind === "yarnType") {
      next.yarnTypes.push({
        id: row[index.id] || makeId("yarn-type"),
        name: row[index.name],
        length: Number(row[index.yarnLength]),
        unit: row[index.yarnUnit] || "本"
      });
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
      setValue("fabricUpperEnds", fabric.upperEnds == null ? "" : fabric.upperEnds);
      setValue("fabricUpperMultiplier", fabric.upperMultiplier == null ? "" : fabric.upperMultiplier);
    }

    const editYarnType = event.target.closest("[data-edit-yarn-type]");
    if (editYarnType) {
      const yarnType = getYarnType(editYarnType.dataset.editYarnType);
      setValue("yarnTypeId", yarnType.id);
      setValue("yarnTypeName", yarnType.name);
      setValue("yarnTypeLength", yarnType.length);
      setValue("yarnTypeUnit", yarnType.unit);
    }

    const editCustomer = event.target.closest("[data-edit-customer]");
    if (editCustomer) {
      const customer = getCustomer(editCustomer.dataset.editCustomer);
      setValue("customerId", customer.id);
      setValue("customerName", customer.name);
      setValue("customerWarpJointLoss", customer.warpJointLoss ?? "");
      setValue("customerWeavingShrinkage", customer.weavingShrinkage ?? "");
      setValue("customerMarkValue", customer.markValue);
      setValue("customerMarkValue2", customer.markValue2 ?? "");
      setValue("customerNote", customer.note);
    }

    const deleteFabric = event.target.closest("[data-delete-fabric]");
    if (deleteFabric) deleteById("fabrics", deleteFabric.dataset.deleteFabric, "織物マスター");

    const deleteYarnType = event.target.closest("[data-delete-yarn-type]");
    if (deleteYarnType) deleteById("yarnTypes", deleteYarnType.dataset.deleteYarnType, "糸種類マスター");

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
      if (select.id === "warpDoubleFabric") syncWarpDoubleUpperLength();
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
    form.addEventListener("input", (event) => {
      if (id === "warpDoubleForm" && event.target.id === "warpDoubleLength") syncWarpDoubleUpperLength();
      if (id === "warpDoubleForm" && event.target.id === "warpDoubleUpperLength") event.target.dataset.manual = "true";
      handler();
      captureInputs();
      saveState("入力保存");
    });
    form.addEventListener("change", (event) => {
      if (id === "warpDoubleForm" && event.target.id === "warpDoubleLength") syncWarpDoubleUpperLength();
      if (id === "warpDoubleForm" && event.target.id === "warpDoubleUpperLength") event.target.dataset.manual = "true";
      handler();
      captureInputs();
      saveState("入力保存");
    });
  });

  $("#warpLength").addEventListener("blur", () => calculateWarpNeed(false, true));
  $("#warpDoubleLength").addEventListener("blur", () => {
    syncWarpDoubleUpperLength();
    calculateWarpDouble(false, true);
    captureInputs();
    saveState("入力保存");
  });
  $("#warpDoubleUpperLength").addEventListener("blur", () => calculateWarpDouble(false, true));

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
    if ($("#warpDoubleUpperLength")?.dataset.manual !== "true") syncWarpDoubleUpperLength();
    captureInputs();
    calculateWarpDouble(true, true);
    saveState("入力保存");
  });

  $("#fabricForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveFabric();
  });
  $("#yarnTypeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveYarnType();
  });
  $("#customerForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveCustomer();
  });
  $("#fabricClear").addEventListener("click", clearFabricForm);
  $("#yarnTypeClear").addEventListener("click", clearYarnTypeForm);
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
