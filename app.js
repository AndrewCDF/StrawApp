"use strict";

const STORAGE_KEY = "straw-bale-recorder-v1";
const CROPS = ["Wheat", "Barley", "Spring Barley", "Oats", "Hay"];
const DEFAULT_MAP_CENTER = [52.569259, 1.406654];
const DEFAULT_MAP_RADIUS_METRES = 16093;

const state = { fields: [], stocktakes: [], loads: [], stockMovements: [] };
let serverStorageAvailable = false;
let map = null;
let markerLayer = null;
let fieldMarkers = new Map();
let pendingMarker = null;
let pendingPin = null;
let activePhoto = "";
let activeFieldLat = null;
let activeFieldLng = null;
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
    openPinChoiceDialog(lat, lng);
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
    "customerTotals",
    "cropTotals",
    "recentFields",
    "fieldList",
    "estimatedStock",
    "latestStocktakeTotal",
    "removedSinceStocktake",
    "boughtInSinceStocktake",
    "pendingLoads",
    "completedLoads",
    "stocktakeHistory",
    "stockMovementsList",
    "fieldSearch",
    "updateAppButton",
    "mapFallback",
    "mapPrompt",
    "pinChoiceDialog",
    "closePinChoiceButton",
    "combinedFieldButton",
    "baledFieldButton",
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
    "fieldPhoto",
    "fieldStatus",
    "fieldFinishedAt",
    "photoPreview",
    "deleteFieldButton",
    "partCompleteButton",
    "completeFieldButton",
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
    "stockMovementDialog",
    "stockMovementForm",
    "stockMovementDialogTitle",
    "closeStockMovementButton",
    "stockMovementId",
    "stockMovementType",
    "stockMovementDate",
    "stockMovementCustomer",
    "stockMovementCustomerDropdownButton",
    "stockMovementCustomerSuggestions",
    "stockMovementBales",
    "stockMovementNotes",
    "deleteStockMovementButton",
    "saveStockMovementButton",
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
  document.getElementById("addFieldButtonFields").addEventListener("click", startDropPinMode);
  els.closePinChoiceButton.addEventListener("click", closePinChoiceDialog);
  els.pinChoiceDialog.addEventListener("cancel", () => clearPendingPin(false));
  els.combinedFieldButton.addEventListener("click", () => choosePinnedFieldStage("combined"));
  els.baledFieldButton.addEventListener("click", () => choosePinnedFieldStage("complete"));
  els.updateAppButton.addEventListener("click", updateAppFromGithub);
  document.getElementById("exportTopButton").addEventListener("click", exportXlsx);
  document.getElementById("addStocktakeButton").addEventListener("click", openStocktakeDialog);
  document.getElementById("addLoadButton").addEventListener("click", () => openLoadDialog());
  document.getElementById("addStockMovementButton").addEventListener("click", () => openStockMovementDialog());

  els.fieldSearch.addEventListener("input", renderFieldList);
  els.fieldCustomer.addEventListener("input", renderCustomerSuggestions);
  els.fieldCustomer.addEventListener("focus", renderCustomerSuggestions);
  els.fieldCustomer.addEventListener("blur", () => hideSuggestionsAfterBlur(els.customerSuggestions));
  els.customerDropdownButton.addEventListener("click", () => showAllSuggestions(els.customerSuggestions, els.fieldCustomer, getCustomerNames()));
  els.fieldFarm.addEventListener("input", renderFarmSuggestions);
  els.fieldFarm.addEventListener("focus", renderFarmSuggestions);
  els.fieldFarm.addEventListener("blur", () => hideSuggestionsAfterBlur(els.farmSuggestions));
  els.farmDropdownButton.addEventListener("click", () => showAllSuggestions(els.farmSuggestions, els.fieldFarm, getFarmNames()));
  els.fieldForm.addEventListener("submit", saveFieldFromForm);
  els.closeFieldDialogButton.addEventListener("click", closeFieldDialog);
  els.deleteFieldButton.addEventListener("click", deleteCurrentField);
  els.partCompleteButton.addEventListener("click", () => saveFieldWithStatus("part-complete"));
  els.completeFieldButton.addEventListener("click", () => saveFieldWithStatus("complete"));
  els.fieldPhoto.addEventListener("change", handlePhotoSelection);
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
  els.stockMovementForm.addEventListener("submit", saveStockMovement);
  els.closeStockMovementButton.addEventListener("click", closeStockMovementDialog);
  els.stockMovementDialog.addEventListener("close", releaseLoadDialogViewport);
  els.stockMovementDialog.addEventListener("cancel", releaseLoadDialogViewport);
  els.stockMovementType.addEventListener("change", updateStockMovementDefaults);
  els.stockMovementCustomer.addEventListener("input", renderStockMovementCustomerSuggestions);
  els.stockMovementCustomer.addEventListener("focus", renderStockMovementCustomerSuggestions);
  els.stockMovementCustomer.addEventListener("blur", () => hideSuggestionsAfterBlur(els.stockMovementCustomerSuggestions));
  els.stockMovementCustomerDropdownButton.addEventListener("click", () => showAllSuggestions(els.stockMovementCustomerSuggestions, els.stockMovementCustomer, getStockMovementCustomers()));
  els.deleteStockMovementButton.addEventListener("click", deleteCurrentStockMovement);
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
    loads: Array.isArray(saved.loads) ? saved.loads : [],
    stockMovements: Array.isArray(saved.stockMovements) ? saved.stockMovements : []
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

async function updateAppFromGithub() {
  if (!serverStorageAvailable) {
    showToast("Pi server is offline");
    return;
  }

  els.updateAppButton.disabled = true;
  showToast("Updating app...");

  try {
    const response = await fetch("/api/update", {
      method: "POST",
      cache: "no-store"
    });
    const result = await response.json();

    if (!result.ok) {
      showToast(result.message || "Update failed");
      els.updateAppButton.disabled = false;
      return;
    }

    showToast("Restarting app...");
    reloadWhenServerReturns();
  } catch (error) {
    showToast("Update failed");
    els.updateAppButton.disabled = false;
  }
}

function reloadWhenServerReturns(attempt = 0) {
  const delay = attempt < 3 ? 1600 : 2500;
  setTimeout(async () => {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      if (response.ok) {
        window.location.reload();
        return;
      }
    } catch (error) {
      // The service is expected to disappear briefly while systemd restarts it.
    }

    if (attempt < 24) {
      reloadWhenServerReturns(attempt + 1);
    } else {
      els.updateAppButton.disabled = false;
      showToast("Refresh the app in a moment");
    }
  }, delay);
}

function showView(name) {
  document.body.classList.toggle("map-mode", name === "map");
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
  renderRecentFields();
  renderFieldList();
  renderStock();
  renderMapMarkers();
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

function renderStockMovementCustomerSuggestions() {
  renderSuggestions(els.stockMovementCustomerSuggestions, els.stockMovementCustomer, getStockMovementCustomers());
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

function getStockMovementCustomers() {
  return uniqueValues([
    ...state.stockMovements.map((movement) => movement.customer),
    ...state.loads.map((load) => load.driver),
    "Ducks at home"
  ]);
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
  if (container === els.stockMovementCustomerSuggestions) return els.stockMovementCustomer;
  return null;
}

function hideAllNameSuggestions() {
  els.customerSuggestions.classList.remove("active");
  els.farmSuggestions.classList.remove("active");
  els.vehicleRegSuggestions.classList.remove("active");
  els.driverSuggestions.classList.remove("active");
  els.stockMovementCustomerSuggestions.classList.remove("active");
}

function hideSuggestionsAfterBlur(container) {
  setTimeout(() => {
    container.classList.remove("active");
  }, 160);
}

function renderTotals() {
  const total = state.fields.reduce((sum, field) => sum + numberValue(field.bales), 0);
  els.seasonTotal.textContent = formatNumber(total);

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

  renderCustomerTotals();
}

function renderCustomerTotals() {
  const totals = new Map();
  state.fields.forEach((field) => {
    const customer = field.customer?.trim() || "No customer";
    totals.set(customer, (totals.get(customer) || 0) + numberValue(field.bales));
  });

  const rows = [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([customer, bales]) => `
      <div class="customer-total-row">
        <span>${escapeHtml(customer)}</span>
        <strong>${formatNumber(bales)}</strong>
      </div>
    `);

  els.customerTotals.innerHTML = rows.length
    ? rows.join("")
    : `<div class="empty-state compact-empty">No customer totals yet</div>`;
}

function renderRecentFields() {
  const recent = [...state.fields]
    .filter(isFieldCompleted)
    .sort(compareCompletedNewestFirst)
    .slice(0, 4);
  els.recentFields.innerHTML = renderFieldCards(recent, true);
}

function compareCompletedNewestFirst(a, b) {
  return fieldCompletedTime(b) - fieldCompletedTime(a);
}

function fieldCompletedTime(field) {
  return new Date(field.finishedAt || field.createdAt || field.updatedAt || 0).getTime();
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
    const crop = normalizeCrop(field.crop);
    return `
      <button class="field-card" type="button" data-edit="${escapeAttr(field.id)}" data-crop="${escapeAttr(crop)}">
        <span>
          <span class="field-title">
            <strong>${escapeHtml(field.name)}</strong>
            <span class="pill">${escapeHtml(crop)}</span>
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

  const card = event.target.closest("[data-edit]");
  if (!card) return;
  const field = state.fields.find((item) => item.id === card.dataset.edit);
  if (field) {
    openFieldDialog(field);
  }
});

document.addEventListener("click", (event) => {
  const loadCard = event.target.closest("[data-load-edit]");
  if (loadCard) {
    const load = state.loads.find((item) => item.id === loadCard.dataset.loadEdit);
    if (load) openLoadDialog(load);
    return;
  }

  const stockMovementCard = event.target.closest("[data-stock-movement-edit]");
  if (stockMovementCard) {
    const movement = state.stockMovements.find((item) => item.id === stockMovementCard.dataset.stockMovementEdit);
    if (movement) openStockMovementDialog(movement);
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
  const completedLoadsAfterCount = latest ? getCompletedLoads()
    .filter((load) => new Date(load.date) >= new Date(latest.date)) : [];
  const movementsAfterCount = latest ? state.stockMovements
    .filter((movement) => new Date(movement.date) >= new Date(latest.date)) : [];
  const removedLoads = completedLoadsAfterCount.reduce((sum, load) => sum + numberValue(load.bales), 0);
  const ducksAllocated = movementsAfterCount
    .filter((movement) => movement.type === "ducks")
    .reduce((sum, movement) => sum + numberValue(movement.bales), 0);
  const boughtIn = movementsAfterCount
    .filter((movement) => movement.type === "bought-in")
    .reduce((sum, movement) => sum + numberValue(movement.bales), 0);
  const removed = removedLoads + ducksAllocated;
  const estimate = latest ? numberValue(latest.bales) + boughtIn - removed : 0;

  els.latestStocktakeTotal.textContent = latest ? formatNumber(latest.bales) : "No count";
  els.removedSinceStocktake.textContent = formatNumber(removed);
  els.boughtInSinceStocktake.textContent = formatNumber(boughtIn);
  els.estimatedStock.textContent = latest ? formatNumber(estimate) : "No count";

  const pending = state.loads
    .filter((load) => !load.completed)
    .sort(compareLoadsNewestFirst);
  const completed = getCompletedLoads().sort(compareLoadsNewestFirst);
  const stocktakes = [...state.stocktakes].sort((a, b) => new Date(b.date) - new Date(a.date));
  const movements = [...state.stockMovements].sort(compareLoadsNewestFirst);

  els.pendingLoads.innerHTML = pending.length
    ? pending.map(renderLoadCard).join("")
    : `<div class="empty-state">No pending loads</div>`;
  els.completedLoads.innerHTML = completed.length
    ? completed.map(renderLoadCard).join("")
    : `<div class="empty-state">No completed loads</div>`;
  els.stocktakeHistory.innerHTML = stocktakes.length
    ? stocktakes.map(renderStocktakeCard).join("")
    : `<div class="empty-state">No stocktakes yet</div>`;
  els.stockMovementsList.innerHTML = movements.length
    ? movements.map(renderStockMovementCard).join("")
    : `<div class="empty-state">No bought in or ducks records</div>`;
}

function getLatestStocktake() {
  return [...state.stocktakes].sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;
}

function getCompletedLoads() {
  return state.loads.filter((load) => load.completed);
}

function stockMovementTypeLabel(type) {
  return type === "bought-in" ? "Bought in" : "Ducks at home";
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

function renderStockMovementCard(movement) {
  const type = stockMovementTypeLabel(movement.type);
  const direction = movement.type === "bought-in" ? "+" : "-";
  const details = [movement.customer, movement.notes || ""].filter(Boolean).join(" · ");
  return `
    <button class="stock-card" type="button" data-stock-movement-edit="${escapeAttr(movement.id)}">
      <span>
        <strong>${escapeHtml(type)} · ${escapeHtml(formatDate(movement.date))}</strong>
        <span class="field-meta">${escapeHtml(details || "Stock movement")}</span>
      </span>
      <span class="bale-count">${direction}${formatNumber(movement.bales)}</span>
    </button>
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

function openStockMovementDialog(movement = null) {
  els.stockMovementDialogTitle.textContent = movement ? "Edit stock movement" : "Stock movement";
  els.stockMovementId.value = movement?.id || "";
  els.stockMovementType.value = movement?.type || "ducks";
  els.stockMovementDate.value = dateTimeInputValue(movement?.date || new Date());
  els.stockMovementCustomer.value = movement?.customer || (movement?.type === "ducks" ? "Ducks at home" : "");
  els.stockMovementBales.value = movement?.bales ?? "";
  els.stockMovementNotes.value = movement?.notes || "";
  els.deleteStockMovementButton.style.display = movement ? "inline-flex" : "none";
  updateStockMovementDefaults();
  hideAllNameSuggestions();
  document.body.classList.add("load-dialog-open");
  els.stockMovementDialog.showModal();
  setTimeout(() => els.stockMovementBales.focus(), 80);
}

function updateStockMovementDefaults() {
  if (els.stockMovementType.value === "ducks" && !els.stockMovementCustomer.value.trim()) {
    els.stockMovementCustomer.value = "Ducks at home";
  }
  if (els.stockMovementType.value === "bought-in" && els.stockMovementCustomer.value.trim() === "Ducks at home") {
    els.stockMovementCustomer.value = "";
  }
}

function closeStockMovementDialog() {
  hideAllNameSuggestions();
  releaseLoadDialogViewport();
  els.stockMovementDialog.close();
}

function saveStockMovement(event) {
  event.preventDefault();
  if (!els.stockMovementForm.reportValidity()) return;
  const existingId = els.stockMovementId.value;
  const existing = state.stockMovements.find((movement) => movement.id === existingId);
  const type = els.stockMovementType.value;
  const now = new Date().toISOString();
  const record = {
    id: existingId || makeId(),
    type,
    date: new Date(els.stockMovementDate.value).toISOString(),
    customer: els.stockMovementCustomer.value.trim() || (type === "ducks" ? "Ducks at home" : ""),
    bales: Math.round(numberValue(els.stockMovementBales.value)),
    notes: els.stockMovementNotes.value.trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existing) {
    Object.assign(existing, record);
  } else {
    state.stockMovements.push(record);
  }

  saveState();
  closeStockMovementDialog();
  renderStock();
  showToast("Stock movement saved");
}

function deleteCurrentStockMovement() {
  const id = els.stockMovementId.value;
  if (!id || !confirm("Delete this stock movement?")) return;
  const index = state.stockMovements.findIndex((movement) => movement.id === id);
  if (index >= 0) state.stockMovements.splice(index, 1);
  saveState();
  closeStockMovementDialog();
  renderStock();
  showToast("Stock movement deleted");
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
  return state.fields
    .filter(isFieldWorked);
}

function initMap() {
  if (!window.L) {
    els.mapFallback.classList.add("active");
    return;
  }

  map = L.map("map", { zoomControl: false }).setView(DEFAULT_MAP_CENTER, 11);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri"
  }).addTo(map);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Labels &copy; Esri"
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);

  map.on("click", (event) => {
    const lat = roundCoordinate(event.latlng.lat);
    const lng = roundCoordinate(event.latlng.lng);
    setPendingPin(lat, lng);
    dropPinMode = false;
    updateMapPrompt();
    openPinChoiceDialog(lat, lng);
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
  const baleText = normaliseStatus(field) === "combined" ? "Ready to bale" : `${formatNumber(numberValue(field.bales))} bales`;
  return `
    <strong>${escapeHtml(field.name)}</strong><br>
    ${escapeHtml(recordOwner(field))}<br>
    ${escapeHtml(normalizeCrop(field.crop))} · ${escapeHtml(baleText)} · ${fieldStatusLabel(field)}<br>
    ${isFieldCarted(field) ? `Carted ${escapeHtml(formatDate(field.cartedAt))}<br>` : ""}
    <span class="popup-actions">
      <button type="button" onclick="window.StrawApp.directionsTo('${escapeAttr(field.id)}')">Directions</button>
      ${isFieldWorked(field) ? cartedAction : ""}
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
  const baleLabel = makePinBaleLabel(field);
  const outlineColor = isFieldCarted(field) ? "#fff" : "#c64232";
  return L.divIcon({
    className: "crop-marker",
    html: `<span style="background:${fieldStatusColor(field)};border-color:${outlineColor}"><b>${escapeHtml(baleLabel)}</b></span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 44],
    popupAnchor: [0, -42]
  });
}

function makePendingIcon() {
  return L.divIcon({
    className: "crop-marker pending",
    html: "<span><b>+</b></span>",
    iconSize: [44, 44],
    iconAnchor: [22, 44],
    popupAnchor: [0, -42]
  });
}

function makePinBaleLabel(field) {
  if (normaliseStatus(field) === "combined") return `C-${cropPinCode(field?.crop)}`;
  const bales = Math.round(numberValue(field?.bales));
  const baleLabel = bales >= 10000 ? `${Math.round(bales / 1000)}k` : String(bales);
  return `${baleLabel}-${cropPinCode(field?.crop)}`;
}

function cropPinCode(value) {
  switch (normalizeCrop(value)) {
    case "Wheat":
      return "W";
    case "Barley":
      return "B";
    case "Spring Barley":
      return "SB";
    case "Oats":
      return "O";
    case "Hay":
      return "H";
    default:
      return "Oth";
  }
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

function openPinChoiceDialog(lat, lng) {
  pendingPin = { lat, lng };
  els.pinChoiceDialog.showModal();
}

function closePinChoiceDialog() {
  els.pinChoiceDialog.close();
  clearPendingPin(false);
}

function choosePinnedFieldStage(status) {
  const seed = {
    lat: pendingPin?.lat,
    lng: pendingPin?.lng,
    status
  };
  els.pinChoiceDialog.close();
  openFieldDialog(null, seed);
}

function openFieldDialog(field = null, seed = {}) {
  const isEditing = Boolean(field);
  activePhoto = field?.photo || "";
  const status = normaliseStatus(field || seed || {});

  els.fieldDialogTitle.textContent = isEditing ? "Edit field" : status === "combined" ? "Combined field" : "Baled field";
  els.fieldId.value = field?.id || "";
  els.fieldCustomer.value = field?.customer || seed.customer || "";
  els.fieldFarm.value = field?.farm || seed.farm || "";
  els.fieldName.value = field?.name || "";
  els.fieldHectares.value = field?.hectares ?? "";
  els.fieldBales.value = field?.bales ?? "";
  els.fieldMoisture.value = field?.moisture ?? "";
  els.fieldCrop.value = normalizeCrop(field?.crop || seed.crop || "Wheat");
  activeFieldLat = field?.lat ?? seed.lat ?? pendingPin?.lat ?? null;
  activeFieldLng = field?.lng ?? seed.lng ?? pendingPin?.lng ?? null;
  els.fieldStatus.value = status === "combined" || status === "part-complete" ? status : "complete";
  els.fieldFinishedAt.value = formatDate(field?.finishedAt || (status === "complete" ? new Date() : ""));
  els.fieldPhoto.value = "";
  els.deleteFieldButton.style.display = isEditing ? "inline-flex" : "none";
  updatePhotoPreview();
  updateWorkflowButtons(isEditing);
  hideAllNameSuggestions();

  els.fieldDialog.showModal();
  setTimeout(() => els.fieldCustomer.focus(), 80);
}

function updateWorkflowButtons(isEditing) {
  const status = els.fieldStatus.value;
  els.partCompleteButton.style.display = "inline-flex";
  els.completeFieldButton.style.display = isEditing || status !== "complete" ? "inline-flex" : "none";
  document.getElementById("saveFieldButton").textContent = status === "combined" ? "Save combined" : "Save completed";
}

function closeFieldDialog() {
  els.fieldDialog.close();
  if (!els.fieldId.value) {
    clearPendingPin(false);
  }
}

function saveFieldFromForm(event) {
  event.preventDefault();
  saveFieldRecord(els.fieldStatus.value || "complete");
}

function saveFieldWithStatus(status) {
  els.fieldStatus.value = status;
  saveFieldRecord(status);
}

function saveFieldRecord(forcedStatus = "") {
  const existingId = els.fieldId.value;
  const existing = state.fields.find((field) => field.id === existingId);
  const now = new Date().toISOString();
  const wasCompleted = isFieldCompleted(existing || {});
  const nextStatus = forcedStatus || els.fieldStatus.value || "complete";
  const willBeCompleted = nextStatus === "complete";
  const record = {
    id: existingId || makeId(),
    customer: els.fieldCustomer.value.trim(),
    farm: els.fieldFarm.value.trim(),
    name: els.fieldName.value.trim() || "Unnamed field",
    hectares: numberValue(els.fieldHectares.value),
    crop: normalizeCrop(els.fieldCrop.value),
    bales: Math.round(numberValue(els.fieldBales.value)),
    moisture: nullableNumber(els.fieldMoisture.value),
    lat: coordinateValue(activeFieldLat),
    lng: coordinateValue(activeFieldLng),
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
  if (willBeCompleted && !wasCompleted) {
    record.finishedAt = now;
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
  showToast(nextStatus === "combined" ? "Field marked combined" : willBeCompleted ? "Field completed" : "Field part completed");
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
    makeStocktakeSpreadsheetRows(state.stocktakes),
    makeStockMovementSpreadsheetRows(state.stockMovements)
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
  return ["Customer", "Farm", "Field Name", "Crop", "Total Bales", "Hectares", "Moisture %", "Photo Added", "Completed"];
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

function makeStockMovementSpreadsheetRows(movements) {
  const headers = ["Type", "Date and Time", "Customer / Source", "Number of Bales", "Stock Effect", "Notes"];
  const rows = movements
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((movement) => [
      stockMovementTypeLabel(movement.type),
      formatDate(movement.date),
      movement.customer || "",
      numberValue(movement.bales),
      movement.type === "bought-in" ? numberValue(movement.bales) : -numberValue(movement.bales),
      movement.notes || ""
    ]);
  if (rows.length) {
    rows.push(["", "", "Net effect", "", rows.reduce((sum, row) => sum + numberValue(row[4]), 0), ""]);
  }
  return [headers, ...rows];
}

function makeXlsxFiles(fieldRows, loadRows, stocktakeRows, stockMovementRows) {
  return {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
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
    <sheet name="Stock Movements" sheetId="4" r:id="rId4"/>
  </sheets>
</workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="7">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF4F8F46"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDFBD56"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD78632"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF4D8F9E"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF8FA84F"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left/><right/><top/><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="9">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="0" xfId="0" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="6" borderId="0" xfId="0" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
  </cellXfs>
</styleSheet>`,
    "xl/worksheets/sheet1.xml": makeSheetXml(fieldRows),
    "xl/worksheets/sheet2.xml": makeBasicSheetXml(loadRows, [15, 20, 16, 20, 16, 16, 30]),
    "xl/worksheets/sheet3.xml": makeBasicSheetXml(stocktakeRows, [20, 16, 40]),
    "xl/worksheets/sheet4.xml": makeBasicSheetXml(stockMovementRows, [18, 20, 22, 16, 14, 36])
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
    <col min="9" max="9" width="18.5" customWidth="1"/>
  </cols>
  <sheetData>${sheetData}</sheetData>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

function rowMatches(row, expected) {
  return row.length === expected.length && row.every((value, index) => value === expected[index]);
}

function headerStyleId(columnIndex) {
  return columnIndex === 6 ? 8 : 7;
}

function makeBasicSheetXml(rows, widths) {
  const sheetData = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row.map((value, columnIndex) => {
      const cellRef = `${columnName(columnIndex + 1)}${rowNumber}`;
      const style = rowIndex === 0 ? ` s="7"` : "";
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
    case "Hay":
      return 5;
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
  if (crop.includes("hay")) return "Hay";
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

function normaliseStatus(field) {
  if (!field) return "not-started";
  if (field.status === "in-progress") return "part-complete";
  if (["not-started", "combined", "part-complete", "complete"].includes(field.status)) return field.status;
  if (field.completed === true) return "complete";
  if (field.completed === false && field.startedAt) return "part-complete";
  if (numberValue(field.bales) > 0) return "complete";
  return "not-started";
}

function fieldStatusLabel(field) {
  switch (normaliseStatus(field)) {
    case "combined":
      return "Combined";
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
    case "combined":
      return "#c64232";
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
