"use strict";

const STORAGE_KEY = "straw-bale-recorder-v1";
const CROPS = ["Wheat", "Barley", "Spring Barley", "Oats"];
const DEFAULT_MAP_CENTER = [52.569259, 1.406654];
const DEFAULT_MAP_RADIUS_METRES = 16093;

const state = { fields: [], stocktakes: [], loads: [] };
let serverStorageAvailable = false;
let map = null;
let markerLayer = null;
let fieldMarkers = new Map();
let pendingMarker = null;
let pendingPin = null;
let activePhoto = "";
let mapOpened = false;
let dropPinMode = false;

const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  collectElements();
  els.seasonYear.textContent = new Date().getFullYear();
  bindEvents();
  lockPageZoomOutsideMap();
  await hydrateState();
  render();
  initMap();
});

window.StrawApp = {
  editField(id) {
    const field = state.fields.find((item) => item.id === id);
    if (field) openFieldDialog(field);
  },
  addAt(lat, lng) {
    openFieldDialog(null, { lat, lng });
  },
  directionsTo(id) {
    openDirectionsToField(id);
  },
  markCarted(id) {
    markFieldCarted(id, true);
  },
  unmarkCarted(id) {
    markFieldCarted(id, false);
  },
  focusField(id) {
    focusFieldOnMap(id);
  }
};

function collectElements() {
  [
    "seasonYear",
    "seasonTotal",
    "hectaresDone",
    "currentField",
    "cropTotals",
    "recentFields",
    "fieldList",
    "estimatedStock",
    "latestStocktakeTotal",
    "removedSinceStocktake",
    "pendingLoads",
    "completedLoads",
    "stocktakeHistory",
    "cartingPendingCount",
    "cartingDoneCount",
    "cartingPendingBales",
    "cartingPendingFields",
    "cartingDoneFields",
    "sheetRows",
    "sheetCustomerFilter",
    "sheetFarmFilter",
    "fieldSearch",
    "mapFallback",
    "mapPrompt",
    "fieldDialog",
    "fieldForm",
    "fieldDialogTitle",
    "closeFieldDialogButton",
    "fieldId",
    "customerSuggestions",
    "farmSuggestions",
    "fieldCustomer",
    "customerDropdownButton",
    "fieldFarm",
    "farmDropdownButton",
    "fieldName",
    "fieldHectares",
    "fieldBales",
    "fieldMoisture",
    "fieldCrop",
    "fieldLat",
    "fieldLng",
    "fieldPhoto",
    "fieldStatus",
    "fieldStartedAt",
    "fieldFinishedAt",
    "photoPreview",
    "deleteFieldButton",
    "partCompleteButton",
    "completeFieldButton",
    "startFieldDialog",
    "startFieldSearch",
    "startFieldList",
    "stocktakeDialog",
    "stocktakeForm",
    "closeStocktakeButton",
    "stocktakeDate",
    "stocktakeBales",
    "stocktakeNotes",
    "loadDialog",
    "loadForm",
    "loadDialogTitle",
    "closeLoadButton",
    "loadId",
    "loadUse",
    "loadDate",
    "loadBales",
    "soldLoadFields",
    "vehicleRegSuggestions",
    "driverSuggestions",
    "loadVehicleReg",
    "vehicleRegDropdownButton",
    "loadDriver",
    "driverDropdownButton",
    "loadWeight",
    "loadNotes",
    "deleteLoadButton",
    "savePendingLoadButton",
    "completeLoadButton",
    "toast"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.nav));
  });

  document.getElementById("addFieldButton").addEventListener("click", startDropPinMode);
  document.getElementById("startFieldButton").addEventListener("click", openStartFieldDialog);
  document.getElementById("addFieldButtonFields").addEventListener("click", startDropPinMode);
  document.getElementById("pinCurrentButton").addEventListener("click", centreMapOnCurrentLocation);
  document.getElementById("clearPendingPinButton").addEventListener("click", clearPendingPin);
  document.getElementById("setLocationButton").addEventListener("click", fillCurrentLocation);
  document.getElementById("exportTopButton").addEventListener("click", exportXlsx);
  document.getElementById("exportSheetButton").addEventListener("click", exportXlsx);
  document.getElementById("exportCsvButton").addEventListener("click", exportCsv);
  document.getElementById("addStocktakeButton").addEventListener("click", openStocktakeDialog);
  document.getElementById("addLoadButton").addEventListener("click", () => openLoadDialog());

  els.fieldSearch.addEventListener("input", renderFieldList);
  els.fieldCustomer.addEventListener("input", renderCustomerSuggestions);
  els.fieldCustomer.addEventListener("focus", renderCustomerSuggestions);
  els.fieldCustomer.addEventListener("blur", () => hideSuggestionsAfterBlur(els.customerSuggestions));
  els.customerDropdownButton.addEventListener("click", () => showAllSuggestions(els.customerSuggestions, els.fieldCustomer, getCustomerNames()));
  els.fieldFarm.addEventListener("input", renderFarmSuggestions);
  els.fieldFarm.addEventListener("focus", renderFarmSuggestions);
  els.fieldFarm.addEventListener("blur", () => hideSuggestionsAfterBlur(els.farmSuggestions));
  els.farmDropdownButton.addEventListener("click", () => showAllSuggestions(els.farmSuggestions, els.fieldFarm, getFarmNames()));
  els.sheetCustomerFilter.addEventListener("change", render);
  els.sheetFarmFilter.addEventListener("change", renderSheet);
  els.fieldForm.addEventListener("submit", saveFieldFromForm);
  els.closeFieldDialogButton.addEventListener("click", closeFieldDialog);
  els.deleteFieldButton.addEventListener("click", deleteCurrentField);
  els.partCompleteButton.addEventListener("click", () => saveFieldWithStatus("part-complete"));
  els.completeFieldButton.addEventListener("click", () => saveFieldWithStatus("complete"));
  els.fieldPhoto.addEventListener("change", handlePhotoSelection);
  els.startFieldSearch.addEventListener("input", renderStartFieldList);
  els.stocktakeForm.addEventListener("submit", saveStocktake);
  els.closeStocktakeButton.addEventListener("click", () => els.stocktakeDialog.close());
  els.loadForm.addEventListener("submit", (event) => event.preventDefault());
  els.closeLoadButton.addEventListener("click", closeLoadDialog);
  els.loadDialog.addEventListener("close", releaseLoadDialogViewport);
  els.loadDialog.addEventListener("cancel", releaseLoadDialogViewport);
  els.loadUse.addEventListener("change", updateLoadFields);
  els.loadVehicleReg.addEventListener("input", renderVehicleRegSuggestions);
  els.loadVehicleReg.addEventListener("focus", renderVehicleRegSuggestions);
  els.loadVehicleReg.addEventListener("blur", () => hideSuggestionsAfterBlur(els.vehicleRegSuggestions));
  els.vehicleRegDropdownButton.addEventListener("click", () => showAllSuggestions(els.vehicleRegSuggestions, els.loadVehicleReg, getVehicleRegistrations()));
  els.loadDriver.addEventListener("input", renderDriverSuggestions);
  els.loadDriver.addEventListener("focus", renderDriverSuggestions);
  els.loadDriver.addEventListener("blur", () => hideSuggestionsAfterBlur(els.driverSuggestions));
  els.driverDropdownButton.addEventListener("click", () => showAllSuggestions(els.driverSuggestions, els.loadDriver, getDriverNames()));
  els.deleteLoadButton.addEventListener("click", deleteCurrentLoad);
  els.savePendingLoadButton.addEventListener("click", () => saveLoadRecord(false));
  els.completeLoadButton.addEventListener("click", () => saveLoadRecord(true));
  document.addEventListener("click", hideNameSuggestions);
}

function lockPageZoomOutsideMap() {
  document.addEventListener("gesturestart", (event) => {
    if (!event.target.closest("#map")) event.preventDefault();
  }, { passive: false });

  document.addEventListener("touchmove", (event) => {
    if (event.touches.length > 1 && !event.target.closest("#map")) {
      event.preventDefault();
    }
  }, { passive: false });
}

function loadLocalState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.fields)) return normaliseClientState(saved);
  } catch (error) {
    console.warn("Unable to load saved straw records", error);
  }
  return normaliseClientState({});
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (serverStorageAvailable) {
    saveServerState();
  }
}

async function hydrateState() {
  const localState = loadLocalState();
  Object.assign(state, localState);

  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) return;

    const serverState = await response.json();
    if (serverState && Array.isArray(serverState.fields)) {
      serverStorageAvailable = true;
      if (!serverState.fields.length && localState.fields.length) {
        await saveServerState();
        return;
      }
      Object.assign(state, normaliseClientState(serverState));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch (error) {
    serverStorageAvailable = false;
  }
}

function normaliseClientState(value) {
  const saved = value && typeof value === "object" ? value : {};
  return {
    fields: Array.isArray(saved.fields) ? saved.fields : [],
    stocktakes: Array.isArray(saved.stocktakes) ? saved.stocktakes : [],
    loads: Array.isArray(saved.loads) ? saved.loads : []
  };
}

async function saveServerState() {
  try {
    const response = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state)
    });
    serverStorageAvailable = response.ok;
  } catch (error) {
    serverStorageAvailable = false;
    showToast("Saved on this phone. Pi sync is offline.");
  }
}

function showView(name) {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.getElementById(`${name}View`).classList.add("active");

  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.nav === name);
  });

  if (name === "map" && map) {
    setTimeout(() => {
      map.invalidateSize();
      if (!mapOpened && !pendingPin) {
        fitDefaultMapArea();
      }
      mapOpened = true;
    }, 80);
  }
}

function startDropPinMode() {
  dropPinMode = true;
  showView("map");
  updateMapPrompt();
  showToast("Tap the field location");
}

function updateMapPrompt() {
  els.mapPrompt.classList.toggle("active", dropPinMode);
}

function render() {
  renderTotals();
  renderSheetFilters();
  renderCurrentField();
  renderRecentFields();
  renderFieldList();
  renderStartFieldList();
  renderStock();
  renderCarting();
  renderSheet();
  renderMapMarkers();
}

function renderSheetFilters() {
  const customerValue = els.sheetCustomerFilter.value;
  const farmValue = els.sheetFarmFilter.value;
  const workedFields = state.fields.filter(isFieldWorked);
  const customers = uniqueValues(workedFields.map((field) => field.customer));
  const farms = uniqueValues(workedFields
    .filter((field) => !customerValue || field.customer === customerValue)
    .map((field) => field.farm));

  els.sheetCustomerFilter.innerHTML = renderSelectOptions(customers, "All customers");
  els.sheetCustomerFilter.value = customers.includes(customerValue) ? customerValue : "";

  els.sheetFarmFilter.innerHTML = renderSelectOptions(farms, "All farms");
  els.sheetFarmFilter.value = farms.includes(farmValue) ? farmValue : "";
}

function renderNameOptions() {
  renderCustomerSuggestions();
  renderFarmSuggestions();
}

function renderCustomerSuggestions() {
  renderSuggestions(els.customerSuggestions, els.fieldCustomer, getCustomerNames());
}

function renderFarmSuggestions() {
  renderSuggestions(els.farmSuggestions, els.fieldFarm, getFarmNames());
}

function renderVehicleRegSuggestions() {
  renderSuggestions(els.vehicleRegSuggestions, els.loadVehicleReg, getVehicleRegistrations());
}

function renderDriverSuggestions() {
  renderSuggestions(els.driverSuggestions, els.loadDriver, getDriverNames());
}

function getCustomerNames() {
  return uniqueValues(state.fields.map((field) => field.customer));
}

function getVehicleRegistrations() {
  return uniqueValues(state.loads.map((load) => String(load.vehicleReg || "").toUpperCase()));
}

function getDriverNames() {
  return uniqueValues(state.loads.map((load) => load.driver));
}

function getFarmNames() {
  const customer = els.fieldCustomer.value.trim();
  return uniqueValues(state.fields
    .filter((field) => !customer || field.customer === customer)
    .map((field) => field.farm));
}

function showAllSuggestions(container, input, values) {
  input.focus();
  renderSuggestions(container, input, values, true);
}

function renderSuggestions(container, input, values, showAll = false) {
  const query = input.value.trim().toLowerCase();
  const matches = values
    .filter((value) => showAll || !query || value.toLowerCase().includes(query))
    .sort((a, b) => {
      const aStarts = a.toLowerCase().startsWith(query) ? 0 : 1;
      const bStarts = b.toLowerCase().startsWith(query) ? 0 : 1;
      return aStarts - bStarts || a.localeCompare(b);
    })
    .slice(0, 8);

  if (!matches.length) {
    container.classList.remove("active");
    container.innerHTML = "";
    return;
  }

  container.innerHTML = matches
    .map((value) => `<button type="button" data-suggestion="${escapeAttr(value)}">${escapeHtml(value)}</button>`)
    .join("");
  container.classList.add("active");
}

function hideNameSuggestions(event) {
  const suggestionButton = event.target.closest("[data-suggestion]");
  if (suggestionButton) {
    const container = suggestionButton.closest(".suggestion-list");
    const input = suggestionInputFor(container);
    if (!input) return;
    input.value = suggestionButton.dataset.suggestion;
    container.classList.remove("active");
    container.innerHTML = "";
    if (input === els.fieldCustomer) renderFarmSuggestions();
    return;
  }

  if (!event.target.closest(".suggestion-list") && !event.target.closest(".autocomplete-control")) {
    hideAllNameSuggestions();
  }
}

function suggestionInputFor(container) {
  if (container === els.customerSuggestions) return els.fieldCustomer;
  if (container === els.farmSuggestions) return els.fieldFarm;
  if (container === els.vehicleRegSuggestions) return els.loadVehicleReg;
  if (container === els.driverSuggestions) return els.loadDriver;
  return null;
}

function hideAllNameSuggestions() {
  els.customerSuggestions.classList.remove("active");
  els.farmSuggestions.classList.remove("active");
  els.vehicleRegSuggestions.classList.remove("active");
  els.driverSuggestions.classList.remove("active");
}

function hideSuggestionsAfterBlur(container) {
  setTimeout(() => {
    container.classList.remove("active");
  }, 160);
}

function renderTotals() {
  const total = state.fields.reduce((sum, field) => sum + numberValue(field.bales), 0);
  const completedHectares = state.fields
    .filter(isFieldCompleted)
    .reduce((sum, field) => sum + numberValue(field.hectares), 0);
  els.seasonTotal.textContent = formatNumber(total);
  els.hectaresDone.textContent = formatNumber(completedHectares);

  els.cropTotals.innerHTML = CROPS.map((crop) => {
    const cropTotal = state.fields
      .filter((field) => normalizeCrop(field.crop) === crop)
      .reduce((sum, field) => sum + numberValue(field.bales), 0);
    return `
      <article class="crop-total" data-crop="${escapeAttr(crop)}">
        <span>${escapeHtml(crop)}</span>
        <strong>${formatNumber(cropTotal)}</strong>
      </article>
    `;
  }).join("");
}

function renderCurrentField() {
  const current = [...state.fields]
    .filter(isFieldInProgress)
    .sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0))[0];

  if (!current) {
    els.currentField.innerHTML = `<div class="empty-state">No field in progress</div>`;
    return;
  }

  els.currentField.innerHTML = renderFieldCards([current], true);
}

function renderRecentFields() {
  const recent = [...state.fields]
    .filter(isFieldCompleted)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .slice(0, 4);
  els.recentFields.innerHTML = renderFieldCards(recent, true);
}

function renderFieldList() {
  const query = els.fieldSearch.value.trim().toLowerCase();
  const fields = [...state.fields]
    .filter((field) => {
      const haystack = `${field.customer || ""} ${field.farm || ""} ${field.name} ${field.crop}`.toLowerCase();
      return !query || haystack.includes(query);
    })
    .sort(compareFields);
  els.fieldList.innerHTML = renderFieldCards(fields, false);
}

function renderFieldCards(fields, compact) {
  if (!fields.length) {
    return `<div class="empty-state">${compact ? "No fields yet" : "No matching fields"}</div>`;
  }

  return fields.map((field) => {
    const hectares = numberValue(field.hectares);
    const location = hasLocation(field) ? "Pinned" : "No pin";
    const status = fieldStatusLabel(field);
    const photo = field.photo ? "Photo" : "No photo";
    return `
      <button class="field-card" type="button" data-edit="${escapeAttr(field.id)}">
        <span>
          <span class="field-title">
            <strong>${escapeHtml(field.name)}</strong>
            <span class="pill">${escapeHtml(normalizeCrop(field.crop))}</span>
          </span>
          <span class="field-meta">${escapeHtml(recordOwner(field))} · ${formatNumber(hectares)} ha · ${location} · ${status} · ${photo}</span>
        </span>
        <span class="bale-count">${formatNumber(numberValue(field.bales))}</span>
      </button>
    `;
  }).join("");
}

document.addEventListener("click", (event) => {
  const directionsButton = event.target.closest("[data-field-directions]");
  if (directionsButton) {
    openDirectionsToField(directionsButton.dataset.fieldDirections);
    return;
  }

  const mapButton = event.target.closest("[data-field-map]");
  if (mapButton) {
    focusFieldOnMap(mapButton.dataset.fieldMap);
    return;
  }

  const cartedButton = event.target.closest("[data-field-carted]");
  if (cartedButton) {
    markFieldCarted(cartedButton.dataset.fieldCarted, true);
    return;
  }

  const uncartedButton = event.target.closest("[data-field-uncarted]");
  if (uncartedButton) {
    markFieldCarted(uncartedButton.dataset.fieldUncarted, false);
    return;
  }

  const card = event.target.closest("[data-edit]");
  if (!card) return;
  const field = state.fields.find((item) => item.id === card.dataset.edit);
  if (field) {
    const isStartingField = els.startFieldDialog?.open;
    const shouldPromptPhoto = isStartingField && !field.photo;
    if (els.startFieldDialog?.open) els.startFieldDialog.close();
    if (isStartingField) startField(field);
    openFieldDialog(field);
    if (shouldPromptPhoto) promptForFieldPhoto();
  }
});

document.addEventListener("click", (event) => {
  const loadCard = event.target.closest("[data-load-edit]");
  if (loadCard) {
    const load = state.loads.find((item) => item.id === loadCard.dataset.loadEdit);
    if (load) openLoadDialog(load);
    return;
  }

  const deleteButton = event.target.closest("[data-stocktake-delete]");
  if (!deleteButton || !confirm("Delete this stocktake?")) return;
  const index = state.stocktakes.findIndex((item) => item.id === deleteButton.dataset.stocktakeDelete);
  if (index >= 0) state.stocktakes.splice(index, 1);
  saveState();
  renderStock();
  showToast("Stocktake deleted");
});

function renderStock() {
  const latest = getLatestStocktake();
  const removed = latest ? getCompletedLoads()
    .filter((load) => new Date(load.date) >= new Date(latest.date))
    .reduce((sum, load) => sum + numberValue(load.bales), 0) : 0;
  const estimate = latest ? numberValue(latest.bales) - removed : 0;

  els.latestStocktakeTotal.textContent = latest ? formatNumber(latest.bales) : "No count";
  els.removedSinceStocktake.textContent = formatNumber(removed);
  els.estimatedStock.textContent = latest ? formatNumber(estimate) : "No count";

  const pending = state.loads
    .filter((load) => !load.completed)
    .sort(compareLoadsNewestFirst);
  const completed = getCompletedLoads().sort(compareLoadsNewestFirst);
  const stocktakes = [...state.stocktakes].sort((a, b) => new Date(b.date) - new Date(a.date));

  els.pendingLoads.innerHTML = pending.length
    ? pending.map(renderLoadCard).join("")
    : `<div class="empty-state">No pending loads</div>`;
  els.completedLoads.innerHTML = completed.length
    ? completed.map(renderLoadCard).join("")
    : `<div class="empty-state">No completed loads</div>`;
  els.stocktakeHistory.innerHTML = stocktakes.length
    ? stocktakes.map(renderStocktakeCard).join("")
    : `<div class="empty-state">No stocktakes yet</div>`;
}

function getLatestStocktake() {
  return [...state.stocktakes].sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;
}

function getCompletedLoads() {
  return state.loads.filter((load) => load.completed);
}

function compareLoadsNewestFirst(a, b) {
  return new Date(b.date || 0) - new Date(a.date || 0);
}

function renderLoadCard(load) {
  const use = load.use === "own-use" ? "Own use" : "Sold";
  const details = load.use === "sold"
    ? [load.vehicleReg, load.driver, load.weight !== "" && load.weight !== null && load.weight !== undefined ? `${formatNumber(load.weight)} weight` : "Weight pending"]
    : ["Own use"];
  return `
    <button class="stock-card" type="button" data-load-edit="${escapeAttr(load.id)}">
      <span>
        <strong>${escapeHtml(use)} · ${escapeHtml(formatDate(load.date))}</strong>
        <span class="field-meta">${escapeHtml(details.filter(Boolean).join(" · "))}</span>
      </span>
      <span class="bale-count">${formatNumber(load.bales)}</span>
    </button>
  `;
}

function renderStocktakeCard(stocktake) {
  return `
    <div class="stock-card">
      <span>
        <strong>${escapeHtml(formatDate(stocktake.date))}</strong>
        <span class="field-meta">${escapeHtml(stocktake.notes || "Stocktake")}</span>
      </span>
      <span>
        <span class="bale-count">${formatNumber(stocktake.bales)}</span>
        <button class="text-button" type="button" data-stocktake-delete="${escapeAttr(stocktake.id)}">Delete</button>
      </span>
    </div>
  `;
}

function renderCarting() {
  const fields = getCartingFields();
  const pending = fields.filter((field) => !isFieldCarted(field));
  const carted = fields.filter(isFieldCarted);

  els.cartingPendingCount.textContent = formatNumber(pending.length);
  els.cartingDoneCount.textContent = formatNumber(carted.length);
  els.cartingPendingBales.textContent = formatNumber(pending.reduce((sum, field) => sum + numberValue(field.bales), 0));
  els.cartingPendingFields.innerHTML = pending.length
    ? pending.map((field) => renderCartingCard(field, false)).join("")
    : `<div class="empty-state">No fields waiting to cart</div>`;
  els.cartingDoneFields.innerHTML = carted.length
    ? carted.map((field) => renderCartingCard(field, true)).join("")
    : `<div class="empty-state">No fields ticked off yet</div>`;
}

function getCartingFields() {
  return state.fields
    .filter(isFieldWorked)
    .sort(compareFields);
}

function renderCartingCard(field, carted) {
  const location = hasLocation(field) ? "Pinned" : "No pin";
  const details = [
    recordOwner(field),
    normalizeCrop(field.crop),
    `${formatNumber(numberValue(field.bales))} bales`,
    location,
    carted ? `Carted ${formatDate(field.cartedAt)}` : fieldStatusLabel(field)
  ];
  return `
    <article class="stock-card carting-card">
      <span>
        <strong>${escapeHtml(field.name)}</strong>
        <span class="field-meta">${escapeHtml(details.filter(Boolean).join(" · "))}</span>
      </span>
      <span class="carting-actions">
        <button class="secondary-action small" type="button" data-field-map="${escapeAttr(field.id)}" ${hasLocation(field) ? "" : "disabled"}>Map</button>
        <button class="secondary-action small" type="button" data-field-directions="${escapeAttr(field.id)}" ${hasLocation(field) ? "" : "disabled"}>Directions</button>
        ${carted
          ? `<button class="amber-action small" type="button" data-field-uncarted="${escapeAttr(field.id)}">Undo</button>`
          : `<button class="complete-action small" type="button" data-field-carted="${escapeAttr(field.id)}">Carted</button>`}
      </span>
    </article>
  `;
}

function openDirectionsToField(id) {
  const field = state.fields.find((item) => item.id === id);
  if (!field || !hasLocation(field)) {
    showToast("No pin for this field");
    return;
  }
  const destination = `${field.lat},${field.lng}`;
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
  window.open(url, "_blank", "noopener");
}

function markFieldCarted(id, carted) {
  const field = state.fields.find((item) => item.id === id);
  if (!field) return;
  field.carted = carted;
  field.cartedAt = carted ? new Date().toISOString() : "";
  field.updatedAt = new Date().toISOString();
  saveState();
  render();
  showToast(carted ? "Field marked carted" : "Carted mark removed");
}

function focusFieldOnMap(id) {
  const field = state.fields.find((item) => item.id === id);
  if (!field || !hasLocation(field)) {
    showToast("No pin for this field");
    return;
  }
  showView("map");
  setTimeout(() => {
    if (!map) return;
    map.setView([field.lat, field.lng], 16);
    fieldMarkers.get(field.id)?.openPopup();
  }, 120);
}

function openStocktakeDialog() {
  els.stocktakeDate.value = dateTimeInputValue(new Date());
  els.stocktakeBales.value = "";
  els.stocktakeNotes.value = "";
  els.stocktakeDialog.showModal();
  setTimeout(() => els.stocktakeBales.focus(), 80);
}

function saveStocktake(event) {
  event.preventDefault();
  if (!els.stocktakeForm.reportValidity()) return;
  const now = new Date().toISOString();
  state.stocktakes.push({
    id: makeId(),
    date: new Date(els.stocktakeDate.value).toISOString(),
    bales: Math.round(numberValue(els.stocktakeBales.value)),
    notes: els.stocktakeNotes.value.trim(),
    createdAt: now,
    updatedAt: now
  });
  saveState();
  els.stocktakeDialog.close();
  renderStock();
  showToast("Stocktake saved");
}

function openLoadDialog(load = null) {
  els.loadDialogTitle.textContent = load ? "Edit load removed" : "Add load removed";
  els.loadId.value = load?.id || "";
  els.loadUse.value = load?.use || "sold";
  els.loadDate.value = dateTimeInputValue(load?.date || new Date());
  els.loadBales.value = load?.bales ?? "";
  els.loadVehicleReg.value = load?.vehicleReg || "";
  els.loadDriver.value = load?.driver || "";
  els.loadWeight.value = load?.weight ?? "";
  els.loadNotes.value = load?.notes || "";
  els.deleteLoadButton.style.display = load ? "inline-flex" : "none";
  els.savePendingLoadButton.style.display = load?.completed ? "none" : "inline-flex";
  els.completeLoadButton.textContent = load?.completed ? "Save changes" : "Complete load";
  updateLoadFields();
  hideAllNameSuggestions();
  document.body.classList.add("load-dialog-open");
  els.loadDialog.showModal();
}

function updateLoadFields() {
  const isSold = els.loadUse.value === "sold";
  els.soldLoadFields.style.display = isSold ? "grid" : "none";
  els.loadVehicleReg.required = isSold;
  els.loadDriver.required = isSold;
}

function closeLoadDialog() {
  hideAllNameSuggestions();
  releaseLoadDialogViewport();
  els.loadDialog.close();
}

function releaseLoadDialogViewport() {
  document.body.classList.remove("load-dialog-open");
}

function saveLoadRecord(complete) {
  if (!els.loadForm.reportValidity()) return;
  const isSold = els.loadUse.value === "sold";
  const weight = nullableNumber(els.loadWeight.value);
  if (complete && isSold && weight === "") {
    showToast("Enter the load weight to complete it");
    els.loadWeight.focus();
    return;
  }

  const existingId = els.loadId.value;
  const existing = state.loads.find((load) => load.id === existingId);
  const now = new Date().toISOString();
  const record = {
    id: existingId || makeId(),
    use: els.loadUse.value,
    date: new Date(els.loadDate.value).toISOString(),
    bales: Math.round(numberValue(els.loadBales.value)),
    vehicleReg: isSold ? els.loadVehicleReg.value.trim().toUpperCase() : "",
    driver: isSold ? els.loadDriver.value.trim() : "",
    weight: isSold ? weight : "",
    notes: els.loadNotes.value.trim(),
    completed: complete || Boolean(existing?.completed),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existing) {
    Object.assign(existing, record);
  } else {
    state.loads.push(record);
  }
  saveState();
  closeLoadDialog();
  renderStock();
  showToast(record.completed ? "Load completed" : "Load saved pending");
}

function deleteCurrentLoad() {
  const id = els.loadId.value;
  if (!id || !confirm("Delete this load record?")) return;
  const index = state.loads.findIndex((load) => load.id === id);
  if (index >= 0) state.loads.splice(index, 1);
  saveState();
  closeLoadDialog();
  renderStock();
  showToast("Load deleted");
}

function startField(field) {
  if (!field.startedAt) {
    field.startedAt = new Date().toISOString();
    field.status = "in-progress";
    field.completed = false;
    field.finishedAt = "";
    field.updatedAt = field.startedAt;
    saveState();
    render();
  } else if (normaliseStatus(field) !== "in-progress") {
    field.status = "in-progress";
    field.completed = false;
    field.finishedAt = "";
    field.updatedAt = new Date().toISOString();
    saveState();
    render();
  }
}

function renderStartFieldList() {
  if (!els.startFieldList) return;
  const query = els.startFieldSearch.value.trim().toLowerCase();
  const fields = state.fields
    .filter((field) => !isFieldCompleted(field))
    .filter((field) => {
      const haystack = `${field.customer || ""} ${field.farm || ""} ${field.name || ""} ${field.crop || ""}`.toLowerCase();
      return !query || haystack.includes(query);
    })
    .sort(compareFields);
  if (!fields.length) {
    els.startFieldList.innerHTML = `<div class="empty-state">No unfinished fields</div>`;
    return;
  }
  els.startFieldList.innerHTML = renderGroupedFieldCards(fields);
}

function openStartFieldDialog() {
  els.startFieldSearch.value = "";
  renderStartFieldList();
  els.startFieldDialog.showModal();
  setTimeout(() => els.startFieldSearch.focus(), 80);
}

function renderGroupedFieldCards(fields) {
  const groups = new Map();
  fields.forEach((field) => {
    const key = `${field.customer || "No customer"}|||${field.farm || "No farm"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(field);
  });

  return [...groups.entries()].map(([key, groupFields]) => {
    const [customer, farm] = key.split("|||");
    return `
      <section class="field-group">
        <h3>${escapeHtml(customer)} <span>${escapeHtml(farm)}</span></h3>
        ${renderFieldCards(groupFields, false)}
      </section>
    `;
  }).join("");
}

function getFilteredWorkedFields() {
  const customer = els.sheetCustomerFilter.value;
  const farm = els.sheetFarmFilter.value;
  return state.fields
    .filter(isFieldWorked)
    .filter((field) => !customer || field.customer === customer)
    .filter((field) => !farm || field.farm === farm);
}

function renderSheet() {
  const fields = getFilteredWorkedFields();
  if (!fields.length) {
    els.sheetRows.innerHTML = `<tr><td colspan="10">No worked fields match this filter</td></tr>`;
    return;
  }
  els.sheetRows.innerHTML = fields
    .sort(compareFields)
    .map((field) => `
      <tr>
        <td>${escapeHtml(field.customer || "")}</td>
        <td>${escapeHtml(field.farm || "")}</td>
        <td>${escapeHtml(field.name)}</td>
        <td>${escapeHtml(normalizeCrop(field.crop))}</td>
        <td>${formatNumber(numberValue(field.bales))}</td>
        <td>${formatNumber(numberValue(field.hectares))}</td>
        <td>${formatMoisture(field.moisture)}</td>
        <td>${field.photo ? "Yes" : "No"}</td>
        <td>${escapeHtml(formatDate(field.startedAt))}</td>
        <td>${escapeHtml(formatDate(field.finishedAt))}</td>
      </tr>
    `).join("");
}

function initMap() {
  if (!window.L) {
    els.mapFallback.classList.add("active");
    return;
  }

  map = L.map("map", { zoomControl: false }).setView(DEFAULT_MAP_CENTER, 11);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);

  map.on("click", (event) => {
    const lat = roundCoordinate(event.latlng.lat);
    const lng = roundCoordinate(event.latlng.lng);
    setPendingPin(lat, lng);
    dropPinMode = false;
    updateMapPrompt();
    openFieldDialog(null, { lat, lng });
  });

  renderMapMarkers();
  fitDefaultMapArea();
}

function renderMapMarkers() {
  if (!markerLayer) return;
  markerLayer.clearLayers();
  fieldMarkers = new Map();

  state.fields.filter(hasLocation).forEach((field) => {
    const marker = L.marker([field.lat, field.lng], { icon: makeFieldIcon(field) }).addTo(markerLayer);
    marker.bindPopup(makeFieldPopup(field));
    fieldMarkers.set(field.id, marker);
  });
}

function makeFieldPopup(field) {
  const cartedAction = isFieldCarted(field)
    ? `<button type="button" onclick="window.StrawApp.unmarkCarted('${escapeAttr(field.id)}')">Undo carted</button>`
    : `<button type="button" onclick="window.StrawApp.markCarted('${escapeAttr(field.id)}')">Carted</button>`;
  return `
    <strong>${escapeHtml(field.name)}</strong><br>
    ${escapeHtml(recordOwner(field))}<br>
    ${escapeHtml(normalizeCrop(field.crop))} · ${formatNumber(numberValue(field.bales))} bales · ${fieldStatusLabel(field)}<br>
    ${isFieldCarted(field) ? `Carted ${escapeHtml(formatDate(field.cartedAt))}<br>` : ""}
    <span class="popup-actions">
      <button type="button" onclick="window.StrawApp.directionsTo('${escapeAttr(field.id)}')">Directions</button>
      ${cartedAction}
      <button type="button" onclick="window.StrawApp.editField('${escapeAttr(field.id)}')">Edit</button>
    </span>
  `;
}

function fitDefaultMapArea() {
  if (!map) return;
  const bounds = L.circle(DEFAULT_MAP_CENTER, { radius: DEFAULT_MAP_RADIUS_METRES }).getBounds();
  map.fitBounds(bounds, { padding: [18, 18] });
}

function makeFieldIcon(field) {
  return L.divIcon({
    className: "crop-marker",
    html: `<span style="background:${fieldStatusColor(field)}"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -22]
  });
}

function makePendingIcon() {
  return L.divIcon({
    className: "crop-marker pending",
    html: "<span></span>",
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -22]
  });
}

function setPendingPin(lat, lng) {
  pendingPin = { lat, lng };
  if (!map) return;
  if (pendingMarker) pendingMarker.remove();
  pendingMarker = L.marker([lat, lng], { icon: makePendingIcon() }).addTo(map);
  pendingMarker.bindPopup("New field pin").openPopup();
}

function clearPendingPin(showMessage = true) {
  pendingPin = null;
  dropPinMode = false;
  updateMapPrompt();
  if (pendingMarker) {
    pendingMarker.remove();
    pendingMarker = null;
  }
  if (showMessage) showToast("Cleared");
}

function openFieldDialog(field = null, seed = {}) {
  const isEditing = Boolean(field);
  activePhoto = field?.photo || "";

  els.fieldDialogTitle.textContent = isEditing ? "Edit field" : "Add field";
  els.fieldId.value = field?.id || "";
  els.fieldCustomer.value = field?.customer || seed.customer || "";
  els.fieldFarm.value = field?.farm || seed.farm || "";
  els.fieldName.value = field?.name || "";
  els.fieldHectares.value = field?.hectares ?? "";
  els.fieldBales.value = field?.bales ?? "";
  els.fieldMoisture.value = field?.moisture ?? "";
  els.fieldCrop.value = normalizeCrop(field?.crop || seed.crop || "Wheat");
  els.fieldLat.value = field?.lat ?? seed.lat ?? pendingPin?.lat ?? "";
  els.fieldLng.value = field?.lng ?? seed.lng ?? pendingPin?.lng ?? "";
  els.fieldStatus.value = normaliseStatus(field || {});
  els.fieldStartedAt.value = formatDate(field?.startedAt);
  els.fieldFinishedAt.value = formatDate(field?.finishedAt);
  els.fieldPhoto.value = "";
  els.deleteFieldButton.style.display = isEditing ? "inline-flex" : "none";
  updatePhotoPreview();
  updateWorkflowButtons(isEditing);
  hideAllNameSuggestions();

  els.fieldDialog.showModal();
  setTimeout(() => els.fieldCustomer.focus(), 80);
}

function updateWorkflowButtons(isEditing) {
  const showWorkflow = isEditing || Boolean(els.fieldId.value);
  els.partCompleteButton.style.display = showWorkflow ? "inline-flex" : "none";
  els.completeFieldButton.style.display = showWorkflow ? "inline-flex" : "none";
}

function promptForFieldPhoto() {
  setTimeout(() => {
    showToast("Take a field photo");
    els.fieldPhoto.click();
  }, 250);
}

function closeFieldDialog() {
  els.fieldDialog.close();
  if (!els.fieldId.value) {
    clearPendingPin(false);
  }
}

function saveFieldFromForm(event) {
  event.preventDefault();
  saveFieldRecord();
}

function saveFieldWithStatus(status) {
  els.fieldStatus.value = status;
  saveFieldRecord();
}

function saveFieldRecord() {

  const existingId = els.fieldId.value;
  const existing = state.fields.find((field) => field.id === existingId);
  const now = new Date().toISOString();
  const wasCompleted = isFieldCompleted(existing || {});
  const nextStatus = els.fieldStatus.value;
  const willBeCompleted = nextStatus === "complete";
  const isActiveStatus = nextStatus === "in-progress" || nextStatus === "part-complete" || nextStatus === "complete";
  const record = {
    id: existingId || makeId(),
    customer: els.fieldCustomer.value.trim(),
    farm: els.fieldFarm.value.trim(),
    name: els.fieldName.value.trim() || "Unnamed field",
    hectares: numberValue(els.fieldHectares.value),
    crop: normalizeCrop(els.fieldCrop.value),
    bales: Math.round(numberValue(els.fieldBales.value)),
    moisture: nullableNumber(els.fieldMoisture.value),
    lat: coordinateValue(els.fieldLat.value),
    lng: coordinateValue(els.fieldLng.value),
    status: nextStatus,
    completed: willBeCompleted,
    startedAt: existing?.startedAt || "",
    finishedAt: existing?.finishedAt || "",
    carted: Boolean(existing?.carted),
    cartedAt: existing?.cartedAt || "",
    photo: activePhoto,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  if (isActiveStatus) {
    record.startedAt = record.startedAt || now;
  }
  if (willBeCompleted && !wasCompleted) {
    record.finishedAt = now;
    record.startedAt = record.startedAt || now;
  }
  if (!willBeCompleted) {
    record.finishedAt = "";
  }

  if (existing) {
    Object.assign(existing, record);
  } else {
    state.fields.push(record);
  }

  if (pendingPin && record.lat === pendingPin.lat && record.lng === pendingPin.lng) {
    pendingPin = null;
    if (pendingMarker) {
      pendingMarker.remove();
      pendingMarker = null;
    }
  }

  saveState();
  els.fieldDialog.close();
  render();
  showToast("Field saved");
}

function deleteCurrentField() {
  const id = els.fieldId.value;
  if (!id || !confirm("Delete this field record?")) return;
  const index = state.fields.findIndex((field) => field.id === id);
  if (index >= 0) state.fields.splice(index, 1);
  saveState();
  els.fieldDialog.close();
  render();
  showToast("Field deleted");
}

function addFieldFromLocation(fallbackToBlank = false) {
  getCurrentLocation()
    .then(({ lat, lng }) => {
      setPendingPin(lat, lng);
      if (map) {
        map.setView([lat, lng], 16);
        showView("map");
      }
      openFieldDialog(null, { lat, lng });
    })
    .catch((error) => {
      showToast(`${error.message}. Tap the map to drop a pin.`);
      if (fallbackToBlank) openFieldDialog();
    });
}

function centreMapOnCurrentLocation() {
  getCurrentLocation()
    .then(({ lat, lng }) => {
      if (map) {
        map.setView([lat, lng], 16);
        showToast("Map centred");
      }
    })
    .catch((error) => showToast(error.message));
}

function fillCurrentLocation() {
  getCurrentLocation()
    .then(({ lat, lng }) => {
      els.fieldLat.value = lat;
      els.fieldLng.value = lng;
      setPendingPin(lat, lng);
      showToast("Location added");
    })
    .catch((error) => showToast(error.message));
}

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not available"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        lat: roundCoordinate(position.coords.latitude),
        lng: roundCoordinate(position.coords.longitude)
      }),
      () => reject(new Error("Location permission needed")),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 }
    );
  });
}

function handlePhotoSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  compressImage(file)
    .then((dataUrl) => {
      activePhoto = dataUrl;
      updatePhotoPreview();
      showToast("Photo added");
    })
    .catch(() => showToast("Photo could not be added"));
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const maxSide = 1400;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.round(image.width * scale);
        const height = Math.round(image.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function updatePhotoPreview() {
  if (!activePhoto) {
    els.photoPreview.classList.remove("active");
    els.photoPreview.removeAttribute("src");
    return;
  }
  els.photoPreview.src = activePhoto;
  els.photoPreview.classList.add("active");
}

function exportCsv() {
  const rows = makeSpreadsheetRows(getFilteredWorkedFields());
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), makeFileName("csv"));
}

function exportXlsx() {
  const files = makeXlsxFiles(
    makeSpreadsheetRows(getFilteredWorkedFields()),
    makeLoadSpreadsheetRows(getCompletedLoads()),
    makeStocktakeSpreadsheetRows(state.stocktakes)
  );
  const blob = makeZip(files);
  downloadBlob(blob, makeFileName("xlsx"));
}

function makeSpreadsheetRows(fields) {
  const headers = exportHeaders();
  const sortedFields = fields.slice().sort(compareFields);
  const rows = [];
  const groups = new Map();

  sortedFields.forEach((field) => {
    const customer = field.customer || "No customer";
    if (!groups.has(customer)) groups.set(customer, []);
    groups.get(customer).push(field);
  });

  [...groups.values()].forEach((customerFields, index) => {
    if (index > 0) rows.push(blankSpreadsheetRow(headers.length));
    rows.push(headers);
    customerFields.forEach((field) => rows.push(fieldSpreadsheetRow(field)));
  });

  if (!rows.length) rows.push(headers);
  return [...rows, ...makeBottomTotalRows(sortedFields, headers.length)];
}

function makeBottomTotalRows(fields, width) {
  if (!fields.length) return [];

  const rows = [
    blankSpreadsheetRow(width),
    blankSpreadsheetRow(width),
    totalSpreadsheetRow("Grand Total", fields, width),
    blankSpreadsheetRow(width),
    blankSpreadsheetRow(width),
    customerTotalHeaderRow(width)
  ];

  uniqueValues(fields.map((field) => field.customer || "No customer")).forEach((customer) => {
    const customerFields = fields.filter((field) => (field.customer || "No customer") === customer);
    rows.push(totalSpreadsheetRow(customer, customerFields, width));
  });

  return rows;
}

function exportHeaders() {
  return ["Customer", "Farm", "Field Name", "Crop", "Total Bales", "Hectares", "Moisture %", "Photo Added", "Started", "Finished"];
}

function fieldSpreadsheetRow(field) {
  return [
    field.customer || "",
    field.farm || "",
    field.name,
    normalizeCrop(field.crop),
    numberValue(field.bales),
    numberValue(field.hectares),
    nullableNumber(field.moisture),
    field.photo ? "Yes" : "No",
    formatDate(field.startedAt),
    formatDate(field.finishedAt)
  ];
}

function blankSpreadsheetRow(width) {
  return Array(width).fill("");
}

function customerTotalHeaderRow(width) {
  const row = blankSpreadsheetRow(width);
  row[0] = "Customer";
  row[4] = "Total Bales";
  row[5] = "Total Bales";
  row[6] = "Hectares";
  row[7] = "Avg Moisture %";
  return row;
}

function totalSpreadsheetRow(label, fields, width) {
  const row = blankSpreadsheetRow(width);
  row[0] = label;
  row[4] = fields.reduce((sum, field) => sum + numberValue(field.bales), 0);
  row[5] = row[4];
  row[6] = roundNumber(fields.reduce((sum, field) => sum + numberValue(field.hectares), 0), 2);
  row[7] = averageMoisture(fields);
  return row;
}

function averageMoisture(fields) {
  const values = fields
    .map((field) => nullableNumber(field.moisture))
    .filter((value) => value !== "");
  if (!values.length) return "";
  return roundNumber(values.reduce((sum, value) => sum + Number(value), 0) / values.length, 1);
}

function makeLoadSpreadsheetRows(loads) {
  const headers = ["Use", "Date and Time", "Vehicle Reg", "Driver Name", "Number of Bales", "Load Weight", "Notes"];
  const rows = loads
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((load) => [
      load.use === "own-use" ? "Own use" : "Sold",
      formatDate(load.date),
      load.vehicleReg || "",
      load.driver || "",
      numberValue(load.bales),
      nullableNumber(load.weight),
      load.notes || ""
    ]);
  if (rows.length) {
    rows.push(["", "", "", "Total", rows.reduce((sum, row) => sum + numberValue(row[4]), 0), "", ""]);
  }
  return [headers, ...rows];
}

function makeStocktakeSpreadsheetRows(stocktakes) {
  const headers = ["Date and Time", "Bales in Stock", "Notes"];
  return [
    headers,
    ...stocktakes
      .slice()
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((stocktake) => [
        formatDate(stocktake.date),
        numberValue(stocktake.bales),
        stocktake.notes || ""
      ])
  ];
}

function makeXlsxFiles(fieldRows, loadRows, stocktakeRows) {
  return {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Straw Bales" sheetId="1" r:id="rId1"/>
    <sheet name="Loads Removed" sheetId="2" r:id="rId2"/>
    <sheet name="Stocktakes" sheetId="3" r:id="rId3"/>
  </sheets>
</workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF4F8F46"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDFBD56"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD78632"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF4D8F9E"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left/><right/><top/><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="0" xfId="0" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
  </cellXfs>
</styleSheet>`,
    "xl/worksheets/sheet1.xml": makeSheetXml(fieldRows),
    "xl/worksheets/sheet2.xml": makeBasicSheetXml(loadRows, [15, 20, 16, 20, 16, 16, 30]),
    "xl/worksheets/sheet3.xml": makeBasicSheetXml(stocktakeRows, [20, 16, 40])
  };
}

function makeSheetXml(rows) {
  const headers = exportHeaders();
  const cropColumn = headers.findIndex((value) => value === "Crop") + 1;
  const sheetData = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const isHeaderRow = rowMatches(row, headers);
    const cells = row.map((value, columnIndex) => {
      const cellRef = `${columnName(columnIndex + 1)}${rowNumber}`;
      const styleId = isHeaderRow ? headerStyleId(columnIndex) : columnIndex + 1 === cropColumn ? cropStyleId(value) : 0;
      const style = styleId ? ` s="${styleId}"` : "";
      if (typeof value === "number" && Number.isFinite(value)) {
        return `<c r="${cellRef}"${style}><v>${value}</v></c>`;
      }
      return `<c r="${cellRef}"${style} t="inlineStr"><is><t>${escapeXml(String(value ?? ""))}</t></is></c>`;
    }).join("");
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${columnName(rows[0].length)}${rows.length}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr baseColWidth="10" defaultColWidth="8.83203125" defaultRowHeight="15"/>
  <cols>
    <col min="1" max="1" width="15.5" customWidth="1"/>
    <col min="2" max="2" width="10.33203125" customWidth="1"/>
    <col min="3" max="3" width="11.6640625" customWidth="1"/>
    <col min="4" max="4" width="11" customWidth="1"/>
    <col min="5" max="6" width="9.1640625" customWidth="1"/>
    <col min="7" max="7" width="9.6640625" customWidth="1"/>
    <col min="8" max="8" width="12.6640625" customWidth="1"/>
    <col min="9" max="10" width="18.5" customWidth="1"/>
  </cols>
  <sheetData>${sheetData}</sheetData>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

function rowMatches(row, expected) {
  return row.length === expected.length && row.every((value, index) => value === expected[index]);
}

function headerStyleId(columnIndex) {
  return columnIndex === 6 ? 7 : 6;
}

function makeBasicSheetXml(rows, widths) {
  const sheetData = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row.map((value, columnIndex) => {
      const cellRef = `${columnName(columnIndex + 1)}${rowNumber}`;
      const style = rowIndex === 0 ? ` s="6"` : "";
      if (typeof value === "number" && Number.isFinite(value)) {
        return `<c r="${cellRef}"${style}><v>${value}</v></c>`;
      }
      return `<c r="${cellRef}"${style} t="inlineStr"><is><t>${escapeXml(String(value ?? ""))}</t></is></c>`;
    }).join("");
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join("");
  const columnXml = widths
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${columnName(rows[0].length)}${rows.length}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${columnXml}</cols>
  <sheetData>${sheetData}</sheetData>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

function cropStyleId(value) {
  switch (normalizeCrop(value)) {
    case "Wheat":
      return 1;
    case "Barley":
      return 2;
    case "Oats":
      return 3;
    case "Spring Barley":
      return 4;
    default:
      return 0;
  }
}

function makeZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  Object.entries(files).forEach(([name, content]) => {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const localHeader = concatBytes(
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime(new Date())),
      u16(dosDate(new Date())),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes
    );

    chunks.push(localHeader, data);
    central.push({
      nameBytes,
      crc,
      compressedSize: data.length,
      uncompressedSize: data.length,
      offset
    });
    offset += localHeader.length + data.length;
  });

  const centralOffset = offset;
  central.forEach((entry) => {
    const header = concatBytes(
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime(new Date())),
      u16(dosDate(new Date())),
      u32(entry.crc),
      u32(entry.compressedSize),
      u32(entry.uncompressedSize),
      u16(entry.nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(entry.offset),
      entry.nameBytes
    );
    chunks.push(header);
    offset += header.length;
  });

  const centralSize = offset - centralOffset;
  chunks.push(concatBytes(
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(central.length),
    u16(central.length),
    u32(centralSize),
    u32(centralOffset),
    u16(0)
  ));

  return new Blob(chunks, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function crc32(data) {
  let crc = -1;
  for (let index = 0; index < data.length; index += 1) {
    crc ^= data[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function concatBytes(...parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function u16(value) {
  const bytes = new Uint8Array(2);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, value, true);
  return bytes;
}

function u32(value) {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, value >>> 0, true);
  return bytes;
}

function dosTime(date) {
  return (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
}

function dosDate(date) {
  return ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
  showToast(`${filename} ready`);
}

function makeFileName(extension) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `straw-bales-${stamp}.${extension}`;
}

function columnName(index) {
  let name = "";
  while (index > 0) {
    const remainder = (index - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    index = Math.floor((index - 1) / 26);
  }
  return name;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB");
}

function dateTimeInputValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function recordOwner(field) {
  const parts = [field.customer, field.farm].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No customer/farm";
}

function compareFields(a, b) {
  return `${a.customer || ""} ${a.farm || ""} ${a.name || ""}`
    .localeCompare(`${b.customer || ""} ${b.farm || ""} ${b.name || ""}`);
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function renderSelectOptions(values, placeholder) {
  return [
    `<option value="">${escapeHtml(placeholder)}</option>`,
    ...values.map((value) => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`)
  ].join("");
}

function normalizeCrop(value) {
  const crop = String(value || "").trim().toLowerCase();
  if (crop.includes("spring") && crop.includes("barley")) return "Spring Barley";
  if (crop.includes("wheat")) return "Wheat";
  if (crop.includes("barley")) return "Barley";
  if (crop.includes("oat")) return "Oats";
  return "Other";
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function roundNumber(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor) / factor;
}

function nullableNumber(value) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
}

function formatMoisture(value) {
  if (value === "" || value === null || value === undefined) return "";
  return formatNumber(value);
}

function coordinateValue(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? roundCoordinate(number) : null;
}

function roundCoordinate(value) {
  return Math.round(Number(value) * 1000000) / 1000000;
}

function hasLocation(field) {
  return Number.isFinite(Number(field.lat)) && Number.isFinite(Number(field.lng));
}

function isFieldCompleted(field) {
  if (field?.status === "complete") return true;
  if (!field) return false;
  if (field.completed === true) return true;
  if (field.completed === false) return false;
  return numberValue(field.bales) > 0;
}

function isFieldWorked(field) {
  return ["part-complete", "complete"].includes(normaliseStatus(field));
}

function isFieldCarted(field) {
  return Boolean(field?.carted || field?.cartedAt);
}

function isFieldInProgress(field) {
  return Boolean(field?.startedAt) && normaliseStatus(field) === "in-progress";
}

function normaliseStatus(field) {
  if (!field) return "not-started";
  if (["not-started", "in-progress", "part-complete", "complete"].includes(field.status)) return field.status;
  if (field.completed === true) return "complete";
  if (field.completed === false && field.startedAt) return "in-progress";
  if (numberValue(field.bales) > 0) return "complete";
  return "not-started";
}

function fieldStatusLabel(field) {
  switch (normaliseStatus(field)) {
    case "in-progress":
      return "In progress";
    case "part-complete":
      return "Part complete";
    case "complete":
      return "Complete";
    default:
      return "Not started";
  }
}

function fieldStatusColor(field) {
  switch (normaliseStatus(field)) {
    case "in-progress":
      return "#4d8f9e";
    case "part-complete":
      return "#d99a2b";
    case "complete":
      return "#2f8f46";
    default:
      return "#c64232";
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(numberValue(value));
}

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function escapeXml(value) {
  return escapeHtml(value);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("active");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("active"), 2200);
}
