const DB_NAME = "orimono-tool-db";
const LEGACY_DB_NAMES = ["orimono-tool-v12-db"];
const APP_VERSION = "v33";
const DB_VERSION = 1;
const STORE = "kv";
const STATE_KEY = "state";
const HISTORY_LIMIT = 1000;
const YARN_USAGE = { WARP: "warp", WEFT: "weft" };
const KUJIRA_METER = 0.3788;
const KANE_PER_KUJIRA = 1.25;
const KANE_METER = KUJIRA_METER / KANE_PER_KUJIRA;

const defaults = {
  settings: {
    weftLoss: 11,
    warpLoss: 1,
    drumLength: 7,
    maxWarpLength: 455
  },
  fabrics: [
    { id: "fabric-standard", name: "AB機", widthCm: 38, defaultPicks: 72, warpEnds: 2680, upperEnds: 0, upperMultiplier: 1 },
    { id: "fabric-wide", name: "広巾一釜(小池）", widthCm: 70, defaultPicks: 72, warpEnds: 3900, upperEnds: 0, upperMultiplier: 1 },
    { id: "fabric-1782334593831-2622be8f9a7898", name: "3丁紗", widthCm: 45, defaultPicks: 38, warpEnds: 3200, upperEnds: 0, upperMultiplier: 1.4 },
    { id: "fabric-1782334862903-711f7d69e81ee8", name: "練薄600一釜（野崎、可児）", widthCm: 45, defaultPicks: 38, warpEnds: 1888, upperEnds: 0, upperMultiplier: 1 },
    { id: "fabric-1782342350855-c2eedf52554e38", name: "精好", widthCm: 45, defaultPicks: 55, warpEnds: 2420, upperEnds: 0, upperMultiplier: 1 },
    { id: "fabric-1782458478764-53014983212a", name: "紋紗600一釜（野崎）", widthCm: 45, defaultPicks: 38, warpEnds: 1920, upperEnds: null, upperMultiplier: null },
    { id: "fabric-1782458520940-b81ece5bd927a8", name: "紋紗600二釜（野崎）", widthCm: 45, defaultPicks: 38, warpEnds: 2210, upperEnds: null, upperMultiplier: null },
    { id: "fabric-1782458724675-b62d865d6077d8", name: "練薄400一釜（長島）", widthCm: 45, defaultPicks: 38, warpEnds: 1858, upperEnds: null, upperMultiplier: null },
    { id: "fabric-1782458829076-80622b049ae3a", name: "紋紗400二釜（長島）", widthCm: 45, defaultPicks: 38, warpEnds: 2222, upperEnds: null, upperMultiplier: null },
    { id: "fabric-1782458878836-d16717f3ab27b8", name: "ABレピア", widthCm: 90, defaultPicks: 72, warpEnds: 5360, upperEnds: null, upperMultiplier: null }
  ],
  yarnTypes: [
    { id: "4000", name: "4000回", length: 5080, unit: "綛", usage: "warp" },
    { id: "8000", name: "8000回", length: 10160, unit: "綛", usage: "warp" },
    { id: "yarn-skein", name: "綛", length: 5080, unit: "綛", usage: "weft" },
    { id: "yarn-gold", name: "金糸", length: 10000, unit: "本", usage: "weft" },
    { id: "yarn-polyester-150d-w", name: "150dテトロンW", length: 59000, unit: "本", usage: "weft" },
    { id: "yarn-type-1782458994173-ba2f6ff3af5b38", name: "50/2テトロン1kg", length: 77440, unit: "本", usage: "weft" }
  ],
  customers: [
    { id: "customer-default", name: "森口", markType: "remainingM", markValue: 7, markValue2: 21, warpJointLoss: 4, weavingShrinkage: 8, note: "Sアゼ　胴割" },
    { id: "customer-1782334646006-534081c124768", name: "長島", markType: "remainingM", markValue: 7, markValue2: 21, warpJointLoss: 4, weavingShrinkage: 8, note: "Wアゼ　胴割" },
    { id: "customer-1782334695526-d3c4d9e9bb9f7", name: "野崎", markType: "remainingM", markValue: 7, markValue2: 21, warpJointLoss: 4, weavingShrinkage: 8, note: "Wアゼ　胴割" },
    { id: "customer-1782334817950-1028685fc6664", name: "可児", markType: "remainingM", markValue: 7, markValue2: 21, warpJointLoss: 4, weavingShrinkage: 8, note: "Wアゼ 別耳10本×2" },
    { id: "customer-1782334962424-b7817b316c4b28", name: "小池", markType: "remainingM", markValue: 21, markValue2: null, warpJointLoss: 4, weavingShrinkage: 8, note: "Wアゼ" }
  ],
  history: [],
  lastInputs: {
    weftNeed: { fabricId: "fabric-standard", yarnTypeId: "yarn-skein", length: 10, unit: "kujira", rolls: 1, picks: 86, ply: 1, loss: 11 },
    weftReverse: { quantity: 1, yarnTypeId: "yarn-skein", fabricId: "fabric-standard", picks: 86, ply: 1, loss: 11 },
    warpNeed: { fabricId: "fabric-standard", customerId: "customer-default", skeinTypeId: "4000", length: 84, rollLength: "", rollUnit: "meter", ends: 2680, stand: "1", loss: 1 },
    warpReverse: { skeins: 20, skeinTypeId: "4000", fabricId: "fabric-standard", customerId: "customer-default", rollLength: "", rollUnit: "meter", ends: 2680, stand: "1", loss: 1 },
    warpDouble: { fabricId: "fabric-standard", skeinTypeId: "4000", length: 84, upperLength: 119, rollLength: "", rollUnit: "meter", loss: 1 }
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

function openDatabaseByName(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
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

function openDatabase() {
  return openDatabaseByName(DB_NAME);
}

function idbGetFrom(database, key) {
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE, "readonly").objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
}

function idbGet(key) {
  return idbGetFrom(db, key);
}

function idbSet(key, value) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put({ key, value });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function existingDatabaseNames() {
  if (!indexedDB.databases) return null;
  try {
    const databases = await indexedDB.databases();
    return databases.map((database) => database.name).filter(Boolean);
  } catch {
    return null;
  }
}

async function readLegacyState() {
  const existingNames = await existingDatabaseNames();
  const candidates = LEGACY_DB_NAMES.filter((name) => name !== DB_NAME && (!existingNames || existingNames.includes(name)));
  for (const name of candidates) {
    let legacyDb;
    try {
      legacyDb = await openDatabaseByName(name);
      const state = await idbGetFrom(legacyDb, STATE_KEY);
      if (state != null) return state;
    } catch {
      // Ignore unreadable old databases and continue with the current store.
    } finally {
      if (legacyDb) legacyDb.close();
    }
  }
  return null;
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
      unit: normalizeYarnUnit(item.unit || item.unitLabel || defaults.yarnTypes[index]?.unit || "本"),
      usage: normalizeYarnUsage(item.usage ?? item.yarnUsage, guessYarnUsage(item))
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

  delete state.settings.skeinLength;
  state.yarnTypes = ensureRequiredYarnTypes(state.yarnTypes);
  state.settings.drumLength = positive(state.settings.drumLength, defaults.settings.drumLength);
  state.settings.maxWarpLength = positive(state.settings.maxWarpLength, defaults.settings.maxWarpLength);
  if (source.lastInputs?.weftReverse?.quantity == null && source.lastInputs?.weftReverse?.skeins != null) {
    state.lastInputs.weftReverse.quantity = source.lastInputs.weftReverse.skeins;
  }
  if (source.lastInputs?.weftReverse?.quantity == null && source.lastInputs?.weftReverse?.yarn) {
    state.lastInputs.weftReverse.quantity = Math.max(1, Math.ceil(Number(source.lastInputs.weftReverse.yarn) / firstYarnTypeByUsage(state.yarnTypes, YARN_USAGE.WEFT).length));
  }
  if (source.lastInputs?.warpReverse?.skeins == null && source.lastInputs?.warpReverse?.yarn) {
    state.lastInputs.warpReverse.skeins = Math.max(1, Math.ceil(Number(source.lastInputs.warpReverse.yarn) / firstYarnTypeByUsage(state.yarnTypes, YARN_USAGE.WARP).length));
  }
  if (source.lastInputs?.sample?.customerId && source.lastInputs?.warpNeed?.customerId == null) {
    state.lastInputs.warpNeed.customerId = source.lastInputs.sample.customerId;
  }
  if (source.lastInputs?.sample?.customerId && source.lastInputs?.warpReverse?.customerId == null) {
    state.lastInputs.warpReverse.customerId = source.lastInputs.sample.customerId;
  }
  state.lastInputs.weftNeed.fabricId = keepId(state.fabrics, state.lastInputs.weftNeed.fabricId);
  state.lastInputs.weftNeed.yarnTypeId = keepYarnTypeByUsage(state.yarnTypes, state.lastInputs.weftNeed.yarnTypeId, YARN_USAGE.WEFT);
  state.lastInputs.weftNeed.rolls = positive(state.lastInputs.weftNeed.rolls, defaults.lastInputs.weftNeed.rolls);
  state.lastInputs.weftReverse.fabricId = keepId(state.fabrics, state.lastInputs.weftReverse.fabricId);
  state.lastInputs.weftReverse.yarnTypeId = keepYarnTypeByUsage(state.yarnTypes, state.lastInputs.weftReverse.yarnTypeId, YARN_USAGE.WEFT);
  state.lastInputs.warpNeed.fabricId = keepId(state.fabrics, state.lastInputs.warpNeed.fabricId);
  state.lastInputs.warpReverse.fabricId = keepId(state.fabrics, state.lastInputs.warpReverse.fabricId);
  state.lastInputs.warpDouble.fabricId = keepId(state.fabrics, state.lastInputs.warpDouble.fabricId);
  state.lastInputs.warpNeed.customerId = keepId(state.customers, state.lastInputs.warpNeed.customerId);
  state.lastInputs.warpReverse.customerId = keepId(state.customers, state.lastInputs.warpReverse.customerId);
  state.lastInputs.warpNeed.skeinTypeId = keepYarnTypeByUsage(state.yarnTypes, state.lastInputs.warpNeed.skeinTypeId ?? state.lastInputs.warpNeed.skeinType, YARN_USAGE.WARP);
  state.lastInputs.warpReverse.skeinTypeId = keepYarnTypeByUsage(state.yarnTypes, state.lastInputs.warpReverse.skeinTypeId ?? state.lastInputs.warpReverse.skeinType, YARN_USAGE.WARP);
  state.lastInputs.warpDouble.skeinTypeId = keepYarnTypeByUsage(state.yarnTypes, state.lastInputs.warpDouble.skeinTypeId ?? state.lastInputs.warpDouble.skeinType, YARN_USAGE.WARP);
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

function normalizeYarnUsage(value, fallback = YARN_USAGE.WEFT) {
  const usage = String(value || "").trim();
  if (usage === YARN_USAGE.WARP || usage === "経糸") return YARN_USAGE.WARP;
  if (usage === YARN_USAGE.WEFT || usage === "緯糸") return YARN_USAGE.WEFT;
  return fallback;
}

function guessYarnUsage(item) {
  const id = String(item?.id || "");
  const name = String(item?.name || "");
  return id === "4000" || id === "8000" || name === "4000回" || name === "8000回" ? YARN_USAGE.WARP : YARN_USAGE.WEFT;
}

function yarnUsageLabel(usage) {
  return usage === YARN_USAGE.WARP ? "経糸" : "緯糸";
}

function normalizeYarnUnit(unit) {
  return String(unit || "本").trim() === "巻" ? "個" : String(unit || "本").trim();
}

function quantityLabel(unit, prefix = "") {
  const base = unit ? `${unit}数` : "数量";
  return `${prefix}${base}`;
}

function yarnCount(value, unit, digits = 0) {
  return `${fmtLoose(value, digits)}${unit || ""}`;
}

function firstYarnTypeByUsage(collection, usage) {
  return collection.find((item) => item.usage === usage) || collection[0] || defaults.yarnTypes[0];
}

function keepYarnTypeByUsage(collection, id, usage) {
  const stringId = String(id || "");
  return collection.some((item) => item.id === stringId && item.usage === usage) ? stringId : firstYarnTypeByUsage(collection, usage)?.id;
}

function ensureRequiredYarnTypes(yarnTypes) {
  const next = [...yarnTypes];
  const hasWarp = next.some((item) => item.usage === YARN_USAGE.WARP);
  const hasWeft = next.some((item) => item.usage === YARN_USAGE.WEFT);
  const fallbackWarp = hasWarp ? [] : defaults.yarnTypes.filter((item) => item.usage === YARN_USAGE.WARP);
  const fallbackWeft = hasWeft ? [] : defaults.yarnTypes.filter((item) => item.usage === YARN_USAGE.WEFT);
  return [
    ...fallbackWarp.map((item) => ({ ...item })),
    ...next,
    ...fallbackWeft.map((item) => ({ ...item }))
  ];
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

function optionalValue(id) {
  const raw = $(`#${id}`)?.value;
  return hasInput(raw) ? toNumber(raw) : "";
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

function getYarnType(id, usage = null) {
  const pool = usage ? appData.yarnTypes.filter((item) => item.usage === usage) : appData.yarnTypes;
  return pool.find((item) => item.id === id) || pool[0] || appData.yarnTypes[0];
}

function getWarpSkeinType(id) {
  return getYarnType(String(id), YARN_USAGE.WARP);
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
    const usage = select.dataset.yarnUsage || YARN_USAGE.WEFT;
    const choices = appData.yarnTypes.filter((yarnType) => yarnType.usage === usage);
    select.innerHTML = choices
      .map((yarnType) => `<option value="${escapeHtml(yarnType.id)}">${escapeHtml(yarnType.name)} / ${fmtYarn(yarnType.length)}m</option>`)
      .join("");
    select.value = choices.some((yarnType) => yarnType.id === current) ? current : choices[0]?.id;
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
    warpRollLength: last.warpNeed.rollLength,
    warpRollUnit: last.warpNeed.rollUnit,
    warpEnds: last.warpNeed.ends,
    warpStand: last.warpNeed.stand,
    warpLoss: last.warpNeed.loss,
    warpCustomer: last.warpNeed.customerId,
    warpReverseSkeins: last.warpReverse.skeins,
    warpReverseSkeinType: last.warpReverse.skeinTypeId,
    warpReverseRollLength: last.warpReverse.rollLength,
    warpReverseRollUnit: last.warpReverse.rollUnit,
    warpReverseFabric: last.warpReverse.fabricId,
    warpReverseEnds: last.warpReverse.ends,
    warpReverseStand: last.warpReverse.stand,
    warpReverseLoss: last.warpReverse.loss,
    warpReverseCustomer: last.warpReverse.customerId,
    warpDoubleFabric: last.warpDouble.fabricId,
    warpDoubleLength: last.warpDouble.length,
    warpDoubleUpperLength: defaultDoubleUpperLength,
    warpDoubleRollLength: last.warpDouble.rollLength,
    warpDoubleRollUnit: last.warpDouble.rollUnit,
    warpDoubleSkeinType: last.warpDouble.skeinTypeId,
    warpDoubleLoss: last.warpDouble.loss,
    settingWeftLoss: appData.settings.weftLoss,
    settingWarpLoss: appData.settings.warpLoss,
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
    rollLength: optionalValue("warpRollLength"),
    rollUnit: $("#warpRollUnit").value,
    ends: value("warpEnds"),
    stand: $("#warpStand").value,
    loss: value("warpLoss")
  };
  appData.lastInputs.warpReverse = {
    skeins: value("warpReverseSkeins"),
    skeinTypeId: $("#warpReverseSkeinType").value,
    fabricId: $("#warpReverseFabric").value,
    customerId: $("#warpReverseCustomer").value,
    rollLength: optionalValue("warpReverseRollLength"),
    rollUnit: $("#warpReverseRollUnit").value,
    ends: value("warpReverseEnds"),
    stand: $("#warpReverseStand").value,
    loss: value("warpReverseLoss")
  };
  appData.lastInputs.warpDouble = {
    fabricId: $("#warpDoubleFabric").value,
    length: value("warpDoubleLength"),
    upperLength: value("warpDoubleUpperLength"),
    rollLength: optionalValue("warpDoubleRollLength"),
    rollUnit: $("#warpDoubleRollUnit").value,
    skeinTypeId: $("#warpDoubleSkeinType").value,
    loss: value("warpDoubleLoss")
  };
}

function toKane(length, unit) {
  if (unit === "kujira") return length * KANE_PER_KUJIRA;
  if (unit === "meter") return length / KANE_METER;
  return length;
}

function fromKane(kane) {
  return { kujira: kane / KANE_PER_KUJIRA, kane, meter: kane * KANE_METER };
}

function calculateWeftNeed(saveHistory = false) {
  const fabric = getFabric($("#weftFabric").value);
  const yarnType = getYarnType($("#weftYarnType").value, YARN_USAGE.WEFT);
  const length = value("weftLength");
  const unit = $("#weftUnit").value;
  const rolls = value("weftRolls");
  const picks = value("weftPicks");
  const ply = value("weftPly");
  const loss = value("weftLoss");
  const error = firstError([
    validatePositive("長さ", length),
    validatePositive("反数", rolls),
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
      summary: `${fabric.name} / ${yarnType.name} / ${fmtLoose(length)}${unitLabel(unit)} × ${fmtLoose(rolls)}反 / ${quantity}${yarnType.unit}`,
      data: { fabricName: fabric.name, yarnTypeName: yarnType.name, yarnTypeLength: yarnType.length, yarnTypeUnit: yarnType.unit, length, unit, rolls, totalLength, picks, ply, quantity, realQuantity, skeins: quantity }
    });
  }
  return { theoretical, withLoss, rawTotal, quantity, remainder };
}

function calculateWeftReverse() {
  const fabric = getFabric($("#weftReverseFabric").value);
  const yarnType = getYarnType($("#weftReverseYarnType").value, YARN_USAGE.WEFT);
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

function warpRollUnitLabel(unit) {
  if (unit === "kujira") return "鯨";
  if (unit === "kane") return "曲";
  return "m";
}

function metersToWarpRollUnit(meters, unit) {
  if (unit === "meter") return meters;
  if (unit === "kujira") return meters / KUJIRA_METER;
  return meters / KANE_METER;
}

function actualWeavingRows(lengthMeters, rollLength, rollUnit, label = "実織長") {
  const unit = rollUnit || "meter";
  const unitLabelText = warpRollUnitLabel(unit);
  const convertedLength = metersToWarpRollUnit(lengthMeters, unit);
  const rows = [[`${label}（${unitLabelText}）`, `${fmtLength(convertedLength)}${unitLabelText}`]];
  if (Number(rollLength) > 0) {
    rows.push(["織れる反数", `${fmtLoose(convertedLength / Number(rollLength), 2)}反`]);
  }
  return rows;
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
  const rollLength = value("warpRollLength");
  const rollUnit = $("#warpRollUnit").value;
  const ends = value("warpEnds");
  const stand = Number($("#warpStand").value);
  const loss = value("warpLoss");
  const error = firstError([
    validatePositive("整経長", length),
    validateInteger("経糸本数", ends, 1)
  ]);

  if (error) {
    $("#warpNeedResult").innerHTML = errorHtml(error);
    return null;
  }

  const needed = length * ends * stand * factor(loss);
  const realSkeins = needed / skeinType.length;
  const skeins = Math.ceil(realSkeins);
  const unit = skeinType.unit || "綛";
  const rounds = length / appData.settings.drumLength;
  const actualWeavingLength = getActualWeavingLength(length, customer);
  const mark = getMarkInfo(length, customer);
  const warnings = [
    correction,
    length > appData.settings.maxWarpLength ? "最大整経長を超えています" : ""
  ].filter(Boolean);
  $("#warpNeedResult").innerHTML = resultBox(`${skeins}${unit}`, quantityLabel(unit, "必要"), [
    [quantityLabel(unit, "実必要"), yarnCount(realSkeins, unit, 2)],
    ["実織長", `${fmtLength(actualWeavingLength)}m`],
    ...actualWeavingRows(actualWeavingLength, rollLength, rollUnit),
    ["織物種類", fabric?.name || "-"],
    ["糸種類", `${skeinType.name}（${fmtYarn(skeinType.length)}m）`],
    ["整経長", `${fmtLength(length)}m`],
    ["経糸本数", `${fmtLoose(ends, 0)}本`],
    ["立て方", standLabel(stand)],
    ["周数", `${fmtLength(rounds)}周`],
    ["経継ロス", `${fmtLength(Number(customer?.warpJointLoss || 0))}m`],
    ["織縮率", `${fmtLoose(Number(customer?.weavingShrinkage || 0))}%`],
    ...mark.rows
  ], warnings.length ? warningHtml(warnings.join("<br>")) : "");

  if (saveHistory) {
    addHistory({
      type: "warp",
      title: "整経計算",
      summary: `${fabric?.name || "-"} / ${skeinType.name} / ${fmtLoose(length)}m / 実織長 ${fmtLength(actualWeavingLength)}m / ${skeins}${unit}`,
      data: { fabricName: fabric?.name || "-", customerName: customer?.name || "-", markSummary: mark.summary, skeinTypeName: skeinType.name, skeinLength: skeinType.length, skeinUnit: unit, length, rollLength, rollUnit, ends, standLabel: standLabel(stand), loss, needed, realSkeins, skeins, rounds, actualWeavingLength }
    });
  }
  return { needed, realSkeins, skeins, rounds, actualWeavingLength };
}

function calculateWarpReverse(saveHistory = false) {
  const skeins = value("warpReverseSkeins");
  const skeinType = getWarpSkeinType($("#warpReverseSkeinType").value);
  const unit = skeinType.unit || "綛";
  const fabric = getFabric($("#warpReverseFabric").value);
  const customer = getCustomer($("#warpReverseCustomer").value);
  const rollLength = value("warpReverseRollLength");
  const rollUnit = $("#warpReverseRollUnit").value;
  const ends = value("warpReverseEnds");
  const stand = Number($("#warpReverseStand").value);
  const loss = value("warpReverseLoss");
  const error = firstError([
    validateInteger(quantityLabel(unit), skeins, 1),
    validateInteger("経糸本数", ends, 1)
  ]);

  if (error) {
    $("#warpReverseResult").innerHTML = errorHtml(error);
    return null;
  }

  const yarn = skeins * skeinType.length;
  const theoretical = yarn / (ends * stand * factor(loss));
  const drum = appData.settings.drumLength;
  const actual = Math.floor(theoretical / drum) * drum;
  const maxWarning = actual > appData.settings.maxWarpLength ? "最大整経長を超えています" : "";
  const rounds = actual / drum;
  const actualWeavingLength = getActualWeavingLength(actual, customer);
  const mark = getMarkInfo(actual, customer);
  $("#warpReverseResult").innerHTML = resultBox(`${fmtLength(actual)}m`, "実整経長", [
    ["織物種類", fabric?.name || "-"],
    ["糸種類", `${skeinType.name}（${fmtYarn(skeinType.length)}m）`],
    [quantityLabel(unit), yarnCount(skeins, unit, 0)],
    ["実織長", `${fmtLength(actualWeavingLength)}m`],
    ...actualWeavingRows(actualWeavingLength, rollLength, rollUnit),
    ["周数", `${fmtLoose(rounds)}周`],
    ["立て方", standLabel(stand)],
    ["経継ロス", `${fmtLength(Number(customer?.warpJointLoss || 0))}m`],
    ["織縮率", `${fmtLoose(Number(customer?.weavingShrinkage || 0))}%`],
    ...mark.rows
  ], maxWarning ? warningHtml(maxWarning) : "");

  if (saveHistory) {
    addHistory({
      type: "warpReverse",
      title: "整経逆算",
      summary: `${fabric?.name || "-"} / ${skeinType.name} / ${fmtLoose(skeins, 0)}${unit} / 実織長 ${fmtLength(actualWeavingLength)}m / ${fmtLoose(rounds)}周`,
      data: { fabricName: fabric?.name || "-", customerName: customer?.name || "-", markSummary: mark.summary, skeinTypeName: skeinType.name, skeinLength: skeinType.length, skeinUnit: unit, skeins, yarn, rollLength, rollUnit, ends, standLabel: standLabel(stand), theoretical, actual, rounds, actualWeavingLength }
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
  const unit = skeinType.unit || "綛";
  const length = value("warpDoubleLength");
  const upperLength = value("warpDoubleUpperLength");
  const rollLength = value("warpDoubleRollLength");
  const rollUnit = $("#warpDoubleRollUnit").value;
  const loss = value("warpDoubleLoss");
  const groundEnds = Number(fabric?.warpEnds || 0);
  const upperEnds = effectiveUpperEnds(fabric);
  const upperMultiplier = effectiveUpperMultiplier(fabric);
  const error = firstError([
    validatePositive("地立整経長", length),
    validatePositive("上立整経長", upperLength),
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
  const doubleCustomer = getCustomer($("#warpCustomer")?.value || appData.lastInputs.warpNeed.customerId);
  const groundActualWeavingLength = getActualWeavingLength(length, doubleCustomer);
  const warnings = [
    ...corrections,
    length > appData.settings.maxWarpLength ? "地立整経長が最大整経長を超えています" : "",
    upperLength > appData.settings.maxWarpLength ? "上立整経長が最大整経長を超えています" : ""
  ].filter(Boolean);

  $("#warpDoubleResult").innerHTML = resultBox(`${actualSkeins}${unit}`, quantityLabel(unit, "実使用"), [
    ["地立実織長", `${fmtLength(groundActualWeavingLength)}m`],
    ...actualWeavingRows(groundActualWeavingLength, rollLength, rollUnit, "地立実織長"),
    ["織物種類", fabric?.name || "-"],
    ["地立整経長", `${fmtLength(length)}m`],
    ["上立整経長", `${fmtLength(upperLength)}m`],
    ["糸種類", `${skeinType.name}（${fmtYarn(skeinType.length)}m）`],
    ["地立本数", `${fmtLoose(groundEnds, 0)}本`],
    ["上立本数", `${fmtLoose(upperEnds, 0)}本`],
    ["上立倍率", `${fmtLoose(upperMultiplier)}`],
    [quantityLabel(unit, "実必要"), yarnCount(totalSkeins, unit, 2)],
    [quantityLabel(unit, "実使用"), yarnCount(actualSkeins, unit, 0)],
    ["余り糸量", `${fmtYarn(leftover)}m`]
  ], warnings.length ? warningHtml(warnings.join("<br>")) : "");

  if (saveHistory) {
    addHistory({
      type: "warpDouble",
      title: "2立整経",
      summary: `${fabric?.name || "-"} / ${skeinType.name} / ${fmtLoose(length)}m / ${actualSkeins}${unit}`,
      data: {
        fabricName: fabric?.name || "-",
        skeinTypeName: skeinType.name,
        skeinLength: skeinType.length,
        skeinUnit: unit,
        length,
        upperLength,
        rollLength,
        rollUnit,
        loss,
        groundEnds,
        upperEnds,
        upperMultiplier,
        groundYarn,
        upperYarn,
        totalYarn,
        totalSkeins,
        actualSkeins,
        groundActualWeavingLength,
        leftover
      }
    });
  }

  return { groundYarn, upperYarn, totalYarn, totalSkeins, actualSkeins, groundActualWeavingLength, leftover };
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
    return `織物名 ${data.fabricName || "-"} / 糸種類 ${data.yarnTypeName || "綛"} / 長さ ${fmtLoose(data.length)}${unitLabel(data.unit)} × ${fmtLoose(rolls)}反 / 総長さ ${fmtLoose(totalLength)}${unitLabel(data.unit)} / 打込み ${fmtLoose(data.picks, 0)} / 合わせ ${fmtLoose(data.ply, 0)}本 / 必要数量 ${fmtLoose(quantity, 0)}${data.yarnTypeUnit || "綛"} / 実必要数量 ${fmtLoose(data.realQuantity || quantity, 2)}${data.yarnTypeUnit || "綛"}`;
  }
  if (item.type === "warp") {
    const data = item.data || {};
    const unit = data.skeinUnit || "綛";
    return `織物名 ${data.fabricName || "-"} / 糸種類 ${data.skeinTypeName || "4000回"} / 整経長 ${fmtLoose(data.length)}m / 実織長 ${fmtLength(data.actualWeavingLength ?? data.length ?? 0)}m / 経糸本数 ${fmtLoose(data.ends, 0)}本 / ${data.standLabel || "-"} / ロス率 ${fmtLoose(data.loss)}% / 必要糸量 ${fmtYarn(data.needed || 0)}m / ${quantityLabel(unit, "必要")} ${yarnCount(data.skeins || 0, unit, 0)} / ${quantityLabel(unit, "実必要")} ${yarnCount(data.realSkeins || data.skeins || 0, unit, 2)} / 周数 ${fmtLength(data.rounds || 0)} / 納品先 ${data.customerName || "-"} / ${data.markSummary || "印なし"}`;
  }
  if (item.type === "warpReverse") {
    const data = item.data || {};
    const unit = data.skeinUnit || "綛";
    return `織物名 ${data.fabricName || "-"} / 糸種類 ${data.skeinTypeName || "4000回"} / ${quantityLabel(unit)} ${yarnCount(data.skeins || 0, unit, 0)} / 糸量 ${fmtYarn(data.yarn || 0)}m / 経糸本数 ${fmtLoose(data.ends, 0)}本 / ${data.standLabel || "-"} / 整経可能長 ${fmtLength(data.theoretical || 0)}m / 実整経長 ${fmtLength(data.actual || 0)}m / 実織長 ${fmtLength(data.actualWeavingLength ?? data.actual ?? 0)}m / 周数 ${fmtLoose(data.rounds || 0)}周 / 納品先 ${data.customerName || "-"} / ${data.markSummary || "印なし"}`;
  }
  if (item.type === "warpDouble") {
    const data = item.data || {};
    const unit = data.skeinUnit || "綛";
    return `織物名 ${data.fabricName || "-"} / 糸種類 ${data.skeinTypeName || "4000回"} / 地立整経長 ${fmtLoose(data.length)}m / 地立実織長 ${fmtLength(data.groundActualWeavingLength ?? data.length ?? 0)}m / 上立整経長 ${fmtLoose(data.upperLength || 0)}m / 地立 ${fmtLoose(data.groundEnds, 0)}本 / 上立 ${fmtLoose(data.upperEnds, 0)}本 / 総必要糸量 ${fmtYarn(data.totalYarn || 0)}m / ${quantityLabel(unit, "実必要")} ${yarnCount(data.totalSkeins || 0, unit, 2)} / ${quantityLabel(unit, "実使用")} ${yarnCount(data.actualSkeins || 0, unit, 0)}`;
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
      <div class="rowMeta">用途 ${yarnUsageLabel(yarnType.usage)} / 表示単位 ${escapeHtml(yarnType.unit)}</div>
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
  setValue("yarnTypeUsage", YARN_USAGE.WEFT);
  setValue("yarnTypeUnit", "本");
}

async function saveFabric() {
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
  await saveState("マスター保存");
}

async function saveYarnType() {
  const item = {
    id: $("#yarnTypeId").value || makeId("yarn-type"),
    name: $("#yarnTypeName").value.trim(),
    length: value("yarnTypeLength"),
    unit: normalizeYarnUnit($("#yarnTypeUnit").value),
    usage: normalizeYarnUsage($("#yarnTypeUsage").value)
  };
  const error = firstError([
    item.name ? "" : "名称を入力してください",
    validateInteger("長さ", item.length, 1),
    item.usage ? "" : "用途を選択してください",
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
  calculateWarpNeed(false);
  calculateWarpReverse(false);
  calculateWarpDouble(false);
  await saveState("マスター保存");
}

async function saveCustomer() {
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
  await saveState("マスター保存");
}

async function deleteById(collection, id, label) {
  if (appData[collection].length <= 1) {
    alert(`${label}は最低1件必要です`);
    return;
  }
  if (!confirm(`${label}を削除しますか？`)) return;
  appData[collection] = appData[collection].filter((item) => item.id !== id);
  renderSelects();
  renderMasters();
  await saveState("削除済み");
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
  const rows = [["kind", "id", "name", "widthCm", "defaultPicks", "warpEnds", "upperEnds", "upperMultiplier", "yarnLength", "yarnUnit", "yarnUsage", "markType", "markValue", "markValue2", "warpJointLoss", "weavingShrinkage", "note", "timestamp", "type", "summary", "payloadJson"]];
  appData.fabrics.forEach((fabric) => rows.push(["fabric", fabric.id, fabric.name, fabric.widthCm, fabric.defaultPicks, fabric.warpEnds, fabric.upperEnds, fabric.upperMultiplier, "", "", "", "", "", "", "", "", "", "", "", "", ""]));
  appData.yarnTypes.forEach((yarnType) => rows.push(["yarnType", yarnType.id, yarnType.name, "", "", "", "", "", yarnType.length, yarnType.unit, yarnUsageLabel(yarnType.usage), "", "", "", "", "", "", "", "", "", ""]));
  appData.customers.forEach((customer) => rows.push(["customer", customer.id, customer.name, "", "", "", "", "", "", "", "", customer.markType, customer.markValue, customer.markValue2, customer.warpJointLoss, customer.weavingShrinkage, customer.note, "", "", "", ""]));
  appData.history.forEach((history) => rows.push(["history", history.id, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", history.timestamp, history.type, history.summary || "", JSON.stringify(history)]));
  rows.push(["settings", "settings", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", JSON.stringify(appData.settings)]);
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
  if (header?.[0]) header[0] = header[0].replace(/^\uFEFF/, "");
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
        upperEnds: row[index.upperEnds],
        upperMultiplier: row[index.upperMultiplier]
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
        unit: row[index.yarnUnit] || "本",
        usage: normalizeYarnUsage(row[index.yarnUsage], guessYarnUsage({ id: row[index.id], name: row[index.name] }))
      });
    }
    if (kind === "history" && row[index.payloadJson]) next.history.push(JSON.parse(row[index.payloadJson]));
    if (kind === "settings" && row[index.payloadJson]) next.settings = { ...next.settings, ...JSON.parse(row[index.payloadJson]) };
  });
  appData = normalizeState(next);
  await saveState("CSV取込", false);
  renderAll();
}

function download(text, filename, type, withBom = false) {
  const blob = new Blob([withBom ? `\uFEFF${text}` : text], { type });
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

function scrollToForm(id) {
  const form = $(`#${id}`);
  if (!form) return;
  requestAnimationFrame(() => {
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function bindEvents() {
  document.addEventListener("click", async (event) => {
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
      scrollToForm("fabricForm");
    }

    const editYarnType = event.target.closest("[data-edit-yarn-type]");
    if (editYarnType) {
      const yarnType = getYarnType(editYarnType.dataset.editYarnType);
      setValue("yarnTypeId", yarnType.id);
      setValue("yarnTypeName", yarnType.name);
      setValue("yarnTypeLength", yarnType.length);
      setValue("yarnTypeUsage", yarnType.usage || YARN_USAGE.WEFT);
      setValue("yarnTypeUnit", yarnType.unit);
      scrollToForm("yarnTypeForm");
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
      scrollToForm("customerForm");
    }

    const deleteFabric = event.target.closest("[data-delete-fabric]");
    if (deleteFabric) await deleteById("fabrics", deleteFabric.dataset.deleteFabric, "織物マスター");

    const deleteYarnType = event.target.closest("[data-delete-yarn-type]");
    if (deleteYarnType) await deleteById("yarnTypes", deleteYarnType.dataset.deleteYarnType, "糸種類マスター");

    const deleteCustomer = event.target.closest("[data-delete-customer]");
    if (deleteCustomer) await deleteById("customers", deleteCustomer.dataset.deleteCustomer, "納品先マスター");

    const deleteHistory = event.target.closest("[data-delete-history]");
    if (deleteHistory) {
      appData.history = appData.history.filter((item) => item.id !== deleteHistory.dataset.deleteHistory);
      renderHistory();
      await saveState("履歴削除");
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

  $$("[data-customer-select]").forEach((select) => {
    select.addEventListener("change", () => {
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

  $("#fabricForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveFabric();
  });
  $("#yarnTypeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveYarnType();
  });
  $("#customerForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveCustomer();
  });
  $("#fabricClear").addEventListener("click", clearFabricForm);
  $("#yarnTypeClear").addEventListener("click", clearYarnTypeForm);
  $("#customerClear").addEventListener("click", clearCustomerForm);

  $("#settingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    appData.settings = {
      weftLoss: value("settingWeftLoss"),
      warpLoss: value("settingWarpLoss"),
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

  $("#csvExport").addEventListener("click", () => download(toCsv(), "orimono-tool-backup.csv", "text/csv;charset=utf-8", true));
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
    document.documentElement.dataset.appVersion = APP_VERSION;
    window.__orimonoToolVersion = APP_VERSION;
    db = await openDatabase();
    let storedState = await idbGet(STATE_KEY);
    let migratedLegacyState = false;
    if (storedState == null) {
      const legacyState = await readLegacyState();
      if (legacyState != null) {
        storedState = legacyState;
        migratedLegacyState = true;
      }
    }
    appData = normalizeState(storedState);
    bindEvents();
    renderAll();
    if (storedState == null || migratedLegacyState) {
      await saveState("保存済み", false);
    } else {
      $("#saveState").textContent = "保存済み";
    }
    registerServiceWorker();
    window.__orimonoToolReady = true;
  } catch (error) {
    $("#saveState").textContent = "保存不可";
    console.error(error);
  }
}

init();
