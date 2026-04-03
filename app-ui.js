function selectBuilding(name, moveMap = false) {
  selectedBuildingName = name;
  ensureCorrectionState();
  mapState.correctionPending = false;
  mapState.selectedParkingId = "";
  const building = selectedBuilding();
  renderDetails();
  renderList();
  syncMapState();
  syncParkingSelection();
  updateNavigationUI();
  updateCorrectionUI();

  if (mapState.currentLocation && building) {
    clearRouteDetails();
    drawNavigationGuide({ fitBounds: false });
  }

  if (moveMap) {
    if (building) {
      focusBuildingOnMap(building);
    }
  }
}

function setFilter(filter) {
  activeFilter = filter;
  legendButtons.forEach((button) => {
    if (filter === "all") {
      button.classList.add("is-active");
      return;
    }
    button.classList.toggle("is-active", button.dataset.filter === "all" || button.dataset.filter === filter);
  });

  renderList();
  syncMapState();
}

function setBasemap(style) {
  if (!mapState.map || !mapState.baseLayers[style]) {
    return;
  }

  Object.entries(mapState.baseLayers).forEach(([name, layer]) => {
    if (name === style) {
      layer.addTo(mapState.map);
    } else if (mapState.map.hasLayer(layer)) {
      mapState.map.removeLayer(layer);
    }
  });

  mapState.activeBase = style;
  styleButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.style === style);
  });
}

function fitView(mode) {
  if (!mapState.map) {
    return;
  }

  mapState.currentView = mode;
  if (!selectionAllowedInCurrentView()) {
    selectedBuildingName = "";
  }
  mapButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === mode);
  });

  renderDetails();
  renderList();
  syncMapState();
  updateNavigationUI();

  if (mode === "campus") {
    mapState.map.fitBounds(campusBounds, { padding: [18, 18] });
    return;
  }

  if (mode === "hospital") {
    mapState.map.fitBounds(healthBounds(), { padding: [18, 18] });
    return;
  }

  if (mode === "dining") {
    const diningPoints = boundsForCategories(["restaurant", "brunch", "winery"]);
    if (diningPoints) {
      mapState.map.fitBounds(diningPoints, { padding: [18, 18] });
    }
    return;
  }

  if (mode === "events") {
    const eventPoints = boundsForCategories(["event-venue"]);
    if (eventPoints) {
      mapState.map.fitBounds(eventPoints, { padding: [18, 18] });
    }
    return;
  }

  if (mode === "regional") {
    const regionalPoints = boundsForCategories(["restaurant", "brunch", "winery", "event-venue"]);
    if (regionalPoints) {
      mapState.map.fitBounds(regionalPoints, { padding: [18, 18] });
    }
    return;
  }

  const allPoints = buildings
    .map((building) => buildingPoint(building))
    .filter(Boolean)
    .map((point) => [point.lat, point.lng]);

  if (allPoints.length) {
    mapState.map.fitBounds(allPoints, { padding: [28, 28] });
  }
}

function ensureCorrectionState() {
  if (!(mapState.correctionOverlays instanceof Map)) {
    mapState.correctionOverlays = new Map();
  }

  if (typeof mapState.correctionPending !== "boolean") {
    mapState.correctionPending = false;
  }
}

function correctionControls() {
  return {
    markButton: document.getElementById("markCorrectionButton"),
    clearButton: document.getElementById("clearCorrectionButton"),
    status: document.getElementById("correctionStatus"),
    list: document.getElementById("correctionList"),
    copyButton: document.getElementById("copyCorrectionDataButton"),
    exportBox: document.getElementById("correctionExportBox")
  };
}

function readCorrectionFlags() {
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }

  try {
    return JSON.parse(window.localStorage.getItem(correctionFlagsKey) || "{}");
  } catch {
    return {};
  }
}

function writeCorrectionFlags(flags) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(correctionFlagsKey, JSON.stringify(flags));
  } catch {
    // Ignore storage failures.
  }
}

function buildingSourcePoint(building) {
  return normalizePoint(
    building?.sourceLat ?? building?.baseLat,
    building?.sourceLng ?? building?.baseLng
  );
}

function hasSavedCorrection(building) {
  const flags = readCorrectionFlags();
  return Boolean(normalizeStoredPoint(flags?.[building?.name]?.lat, flags?.[building?.name]?.lng));
}

function updateCorrectionOverlay(building) {
  ensureCorrectionState();
  if (!mapState.map) {
    return;
  }

  const corrected = hasSavedCorrection(building);
  const point = buildingPoint(building);
  const existing = mapState.correctionOverlays.get(building.name);

  if (!corrected || !point) {
    if (existing) {
      mapState.map.removeLayer(existing);
      mapState.correctionOverlays.delete(building.name);
    }
    return;
  }

  if (existing) {
    existing.setLatLng([point.lat, point.lng]);
    return;
  }

  const overlay = L.circleMarker([point.lat, point.lng], {
    radius: 14,
    color: "#c08a10",
    weight: 2,
    fillOpacity: 0,
    dashArray: "4 4",
    interactive: false
  }).addTo(mapState.map);

  mapState.correctionOverlays.set(building.name, overlay);
}

function syncCorrectionOverlays() {
  ensureCorrectionState();
  buildings.forEach((building) => updateCorrectionOverlay(building));
}

function setBuildingCoordinates(building, point) {
  if (!building || !point) {
    return;
  }

  building.lat = point.lat;
  building.lng = point.lng;

  const layer = mapState.layers.get(building.name);
  if (layer) {
    layer.setLatLng([point.lat, point.lng]);
    layer.setPopupContent(popupMarkup(building));
  }

  updateCorrectionOverlay(building);
}

function renderCorrectionList() {
  const { list, exportBox } = correctionControls();
  if (!list) {
    return;
  }

  const flags = readCorrectionFlags();
  const correctedBuildings = buildings.filter((building) =>
    Boolean(normalizeStoredPoint(flags?.[building.name]?.lat, flags?.[building.name]?.lng))
  );

  if (!correctedBuildings.length) {
    list.innerHTML = "";
    list.classList.add("is-hidden");
    exportBox?.classList.add("is-hidden");
    return;
  }

  list.innerHTML = correctedBuildings
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((building) => {
      const point = normalizeStoredPoint(flags?.[building.name]?.lat, flags?.[building.name]?.lng);
      return `
        <button class="correction-item" type="button" data-correction-name="${escapeHtml(building.name)}">
          <p class="correction-item-title">${escapeHtml(building.name)}</p>
          <div class="correction-item-meta">${escapeHtml(building.address)}</div>
          <div class="correction-item-meta">Corrected to ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}</div>
        </button>
      `;
    }).join("");

  list.classList.remove("is-hidden");
  list.querySelectorAll("[data-correction-name]").forEach((button) => {
    button.addEventListener("click", () => selectBuilding(button.dataset.correctionName, true));
  });
}

function updateCorrectionUI() {
  ensureCorrectionState();
  const { markButton, clearButton, copyButton, status } = correctionControls();
  if (!markButton || !clearButton || !copyButton || !status) {
    return;
  }

  const building = selectedBuilding();
  const hasSelection = Boolean(building);
  const corrected = hasSelection && hasSavedCorrection(building);
  const hasAnyCorrections = Object.keys(readCorrectionFlags()).length > 0;

  markButton.disabled = !hasSelection;
  clearButton.disabled = !corrected;
  copyButton.disabled = !hasAnyCorrections;

  if (mapState.correctionPending && building) {
    status.textContent = `Click the map to place the corrected marker for ${building.name}.`;
    return;
  }

  if (!building) {
    status.textContent = "Select a landmark, then click Mark selected on map and click the correct spot on the map.";
    return;
  }

  if (corrected) {
    status.textContent = `${building.name} has a saved local correction.`;
    return;
  }

  status.textContent = `Selected: ${building.name}. Click Mark selected on map to place a corrected marker.`;
}

function applyCorrectionForSelected(point) {
  const building = selectedBuilding();
  if (!building || !point) {
    return;
  }

  const flags = readCorrectionFlags();
  flags[building.name] = {
    lat: point.lat,
    lng: point.lng
  };
  writeCorrectionFlags(flags);
  setBuildingCoordinates(building, point);

  mapState.correctionPending = false;
  renderDetails();
  renderList();
  syncMapState();
  renderCorrectionList();
  updateCorrectionUI();

  if (mapState.currentLocation && selectedNavigationTarget()) {
    clearRouteDetails();
    drawNavigationGuide({ fitBounds: false });
  }
}

function clearSelectedCorrection() {
  const building = selectedBuilding();
  if (!building) {
    return;
  }

  const flags = readCorrectionFlags();
  delete flags[building.name];
  writeCorrectionFlags(flags);

  const sourcePoint = buildingSourcePoint(building);
  if (sourcePoint) {
    setBuildingCoordinates(building, sourcePoint);
  }

  mapState.correctionPending = false;
  renderDetails();
  renderList();
  syncMapState();
  renderCorrectionList();
  updateCorrectionUI();

  if (mapState.currentLocation && selectedNavigationTarget()) {
    clearRouteDetails();
    drawNavigationGuide({ fitBounds: false });
  }
}

function startCorrectionPlacement() {
  ensureCorrectionState();
  if (!selectedBuilding()) {
    updateCorrectionUI();
    return;
  }

  mapState.correctionPending = true;
  updateCorrectionUI();
}

async function copyCorrectionData() {
  const { status, exportBox } = correctionControls();
  const flags = readCorrectionFlags();
  const hasAnyCorrections = Object.keys(flags).length > 0;

  if (!status || !exportBox) {
    return;
  }

  if (!hasAnyCorrections) {
    exportBox.value = "";
    exportBox.classList.add("is-hidden");
    status.textContent = "There are no saved correction markers to copy yet.";
    return;
  }

  const payload = JSON.stringify(flags, null, 2);

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload);
      exportBox.value = "";
      exportBox.classList.add("is-hidden");
      status.textContent = "Correction data copied. Paste it into Codex and I can bake these locations into the shared app.";
      return;
    }
  } catch {
    // Fall back to showing the data in a copyable box below.
  }

  exportBox.value = payload;
  exportBox.classList.remove("is-hidden");
  exportBox.focus();
  exportBox.select();
  status.textContent = "Clipboard access was blocked. Copy the correction data shown below and paste it into Codex.";
}

function attachCorrectionMapBehavior() {
  ensureCorrectionState();
  if (!mapState.map || mapState.correctionHandlerBound) {
    return;
  }

  mapState.map.on("click", (event) => {
    if (!mapState.correctionPending) {
      return;
    }

    const point = normalizePoint(event.latlng?.lat, event.latlng?.lng);
    if (!point) {
      return;
    }

    applyCorrectionForSelected(point);
  });

  mapState.correctionHandlerBound = true;
  syncCorrectionOverlays();
}

function localBuildingMatches(queryText, limit = 6, pool = buildings) {
  const normalized = normalizeText(queryText);
  if (!normalized) {
    return [];
  }

  const scored = pool
    .map((building) => {
      const name = normalizeText(building.name);
      const aliases = (building.aliases || []).map(normalizeText);
      const shortLabel = normalizeText(building.shortLabel || "");
      const address = normalizeText(building.address);
      let score = 0;

      if (name === normalized) score += 140;
      if (aliases.some((alias) => alias === normalized)) score += 120;
      if (shortLabel === normalized) score += 105;
      if (name.startsWith(normalized)) score += 90;
      if (aliases.some((alias) => alias.startsWith(normalized))) score += 72;
      if (shortLabel.startsWith(normalized)) score += 68;
      if (name.includes(normalized)) score += 48;
      if (aliases.some((alias) => alias.includes(normalized))) score += 40;
      if (shortLabel.includes(normalized)) score += 36;
      if (address.startsWith(normalized)) score += 26;
      if (address.includes(normalized)) score += 16;

      return { building, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.building.name.localeCompare(b.building.name))
    .slice(0, limit);

  return scored.map((item) => item.building);
}

function findLocalBuilding(queryText) {
  return localBuildingMatches(queryText, 1)[0] || null;
}

function matchesDirectoryScope(building) {
  const matchesFilter = activeFilter === "all" || building.category === activeFilter;
  return matchesViewMode(building) && matchesFilter;
}

function hideBuildingSuggestions() {
  destinationSuggestions = [];
  activeDestinationSuggestionIndex = -1;
  buildingSuggestions.innerHTML = "";
  buildingSuggestions.classList.add("is-hidden");
  buildingSearchBox.setAttribute("aria-expanded", "false");
  buildingSearchBox.removeAttribute("aria-activedescendant");
}

function renderBuildingSuggestions() {
  if (!destinationSuggestions.length) {
    hideBuildingSuggestions();
    return;
  }

  buildingSuggestions.innerHTML = destinationSuggestions.map((building, index) => {
    const style = categoryStyles[building.category];
    const activeClass = index === activeDestinationSuggestionIndex ? "is-active" : "";
    return `
      <button
        id="${destinationSuggestionId(index)}"
        class="search-suggestion ${activeClass}"
        type="button"
        role="option"
        aria-selected="${index === activeDestinationSuggestionIndex ? "true" : "false"}"
        data-suggestion-index="${index}"
      >
        <p class="search-suggestion-title">${escapeHtml(building.name)}</p>
        <div class="search-suggestion-meta">${escapeHtml(style.label)} | ${escapeHtml(building.address)}</div>
      </button>
    `;
  }).join("");

  buildingSuggestions.classList.remove("is-hidden");
  buildingSearchBox.setAttribute("aria-expanded", "true");

  if (activeDestinationSuggestionIndex >= 0) {
    buildingSearchBox.setAttribute("aria-activedescendant", destinationSuggestionId(activeDestinationSuggestionIndex));
  } else {
    buildingSearchBox.removeAttribute("aria-activedescendant");
  }

  buildingSuggestions.querySelectorAll("[data-suggestion-index]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => commitBuildingSuggestion(Number(button.dataset.suggestionIndex)));
  });
}

function refreshBuildingSuggestions() {
  const rawQuery = buildingSearchBox.value.trim();
  destinationSuggestions = localBuildingMatches(rawQuery, 6);
  activeDestinationSuggestionIndex = -1;
  renderBuildingSuggestions();
}

function moveBuildingSuggestionFocus(direction) {
  if (!destinationSuggestions.length) {
    refreshBuildingSuggestions();
  }

  if (!destinationSuggestions.length) {
    return;
  }

  if (activeDestinationSuggestionIndex < 0) {
    activeDestinationSuggestionIndex = direction > 0 ? 0 : destinationSuggestions.length - 1;
  } else {
    activeDestinationSuggestionIndex =
      (activeDestinationSuggestionIndex + direction + destinationSuggestions.length) % destinationSuggestions.length;
  }

  renderBuildingSuggestions();
}

function commitBuildingSuggestion(index) {
  const building = destinationSuggestions[index];
  if (!building) {
    return;
  }

  buildingSearchBox.value = building.name;
  hideBuildingSuggestions();
  buildingFinder.requestSubmit();
}

function hideListSuggestions() {
  directorySuggestions = [];
  activeDirectorySuggestionIndex = -1;
  listSuggestions.innerHTML = "";
  listSuggestions.classList.add("is-hidden");
  listSearchBox.setAttribute("aria-expanded", "false");
  listSearchBox.removeAttribute("aria-activedescendant");
}

function renderListSuggestions() {
  if (!directorySuggestions.length) {
    hideListSuggestions();
    return;
  }

  listSuggestions.innerHTML = directorySuggestions.map((building, index) => {
    const style = categoryStyles[building.category];
    const activeClass = index === activeDirectorySuggestionIndex ? "is-active" : "";
    return `
      <button
        id="${directorySuggestionId(index)}"
        class="search-suggestion ${activeClass}"
        type="button"
        role="option"
        aria-selected="${index === activeDirectorySuggestionIndex ? "true" : "false"}"
        data-directory-index="${index}"
      >
        <p class="search-suggestion-title">${escapeHtml(building.name)}</p>
        <div class="search-suggestion-meta">${escapeHtml(style.label)} | ${escapeHtml(building.address)}</div>
      </button>
    `;
  }).join("");

  listSuggestions.classList.remove("is-hidden");
  listSearchBox.setAttribute("aria-expanded", "true");

  if (activeDirectorySuggestionIndex >= 0) {
    listSearchBox.setAttribute("aria-activedescendant", directorySuggestionId(activeDirectorySuggestionIndex));
  } else {
    listSearchBox.removeAttribute("aria-activedescendant");
  }

  listSuggestions.querySelectorAll("[data-directory-index]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => commitListSuggestion(Number(button.dataset.directoryIndex)));
  });
}

function refreshListSuggestions() {
  const rawQuery = listSearchBox.value.trim();
  directorySuggestions = localBuildingMatches(rawQuery, 6, buildings.filter(matchesDirectoryScope));
  activeDirectorySuggestionIndex = -1;
  renderListSuggestions();
}

function moveListSuggestionFocus(direction) {
  if (!directorySuggestions.length) {
    refreshListSuggestions();
  }

  if (!directorySuggestions.length) {
    return;
  }

  if (activeDirectorySuggestionIndex < 0) {
    activeDirectorySuggestionIndex = direction > 0 ? 0 : directorySuggestions.length - 1;
  } else {
    activeDirectorySuggestionIndex =
      (activeDirectorySuggestionIndex + direction + directorySuggestions.length) % directorySuggestions.length;
  }

  renderListSuggestions();
}

function commitListSuggestion(index) {
  const building = directorySuggestions[index];
  if (!building) {
    return;
  }

  listSearchBox.value = building.name;
  listQuery = building.name.trim().toLowerCase();
  hideListSuggestions();
  selectBuilding(building.name, true);
}

function showSearchMarker(result) {
  if (!mapState.map) {
    return;
  }

  const point = normalizePoint(result?.lat, result?.lng);
  if (!point) {
    return;
  }

  if (!mapState.searchMarker) {
    mapState.searchMarker = L.circleMarker([point.lat, point.lng], {
      radius: 12,
      color: "#10231e",
      weight: 3,
      fillColor: "#f7f2df",
      fillOpacity: 0.98
    }).addTo(mapState.map);
  } else {
    mapState.searchMarker.setLatLng([point.lat, point.lng]);
  }

  mapState.searchMarker.bindPopup(popupMarkup({
    name: result.name,
    typeLabel: "Search result",
    address: result.address
  }));
  mapState.searchMarker.openPopup();
}

async function fetchNearbyParking(destination) {
  const query = `
    [out:json][timeout:20];
    (
      node["amenity"="parking"](around:700,${destination.lat},${destination.lng});
      way["amenity"="parking"](around:700,${destination.lat},${destination.lng});
      relation["amenity"="parking"](around:700,${destination.lat},${destination.lng});
    );
    out center tags 20;
  `;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
      Accept: "application/json"
    },
    body: query
  });

  if (!response.ok) {
    throw new Error(`Parking search failed with status ${response.status}`);
  }

  const payload = await response.json();
  return (payload.elements || [])
    .map((element, index) => {
      const lat = element.lat ?? element.center?.lat;
      const lng = element.lon ?? element.center?.lon;
      if (typeof lat !== "number" || typeof lng !== "number") {
        return null;
      }

      const tags = element.tags || {};
      return {
        id: `parking-${index + 1}`,
        name: tags.name || `Parking option ${index + 1}`,
        address: [
          tags["addr:housenumber"],
          tags["addr:street"],
          tags["addr:city"]
        ].filter(Boolean).join(" ") || "Address not listed",
        typeLabel: formatParkingType(tags),
        lat,
        lng,
        distanceMeters: distanceMiles(destination, { lat, lng }) * 1609.344
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 8);
}

function fitDestinationAndParking(destination, parkingSpots) {
  if (!mapState.map) {
    return;
  }

  const destinationPoint = normalizePoint(destination?.lat, destination?.lng);
  if (!destinationPoint) {
    return;
  }

  const points = [
    [destinationPoint.lat, destinationPoint.lng],
    ...parkingSpots
      .map((spot) => normalizePoint(spot?.lat, spot?.lng))
      .filter(Boolean)
      .map((point) => [point.lat, point.lng])
  ];

  if (points.length === 1) {
    mapState.map.flyTo(points[0], Math.max(mapState.map.getZoom(), 17), {
      duration: 0.7
    });
    return;
  }

  mapState.map.fitBounds(points, { padding: [26, 26] });
}

async function searchExternalBuilding(queryText) {
  const params = new URLSearchParams({
    q: queryText,
    format: "jsonv2",
    limit: "1",
    bounded: "1",
    viewbox: "-77.265,39.045,-76.905,38.765"
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Search failed with status ${response.status}`);
  }

  const results = await response.json();
  if (!results.length) {
    return null;
  }

  const top = results[0];
  return {
    name: top.display_name.split(",")[0],
    address: top.display_name,
    lat: Number(top.lat),
    lng: Number(top.lon)
  };
}

async function handleBuildingSearch(event) {
  event.preventDefault();
  const rawQuery = buildingSearchBox.value.trim();
  if (!rawQuery) {
    hideBuildingSuggestions();
    buildingSearchStatus.textContent = "Enter where you want to go, and the map will look for nearby parking.";
    return;
  }

  hideBuildingSuggestions();
  clearParkingResults();

  const localMatch = findLocalBuilding(rawQuery);
  const destination = localMatch
    ? destinationFromLocalMatch(localMatch)
    : await searchExternalBuilding(rawQuery).catch(() => null);

  if (!destination) {
    buildingSearchStatus.textContent = `No destination match found for "${rawQuery}".`;
    return;
  }

  if (localMatch) {
    selectBuilding(localMatch.name, true);
  } else {
    selectedBuildingName = "";
    renderDetails();
    renderList();
    syncMapState();
    updateNavigationUI();
    showSearchMarker(destination);
  }

  buildingSearchStatus.textContent = `Looking for parking near ${destination.name}...`;

  try {
    const parkingSpots = await fetchNearbyParking(destination);
    showSearchMarker(destination);
    showParkingMarkers(destination, parkingSpots);
    fitDestinationAndParking(destination, parkingSpots);

    if (!parkingSpots.length) {
      buildingSearchStatus.textContent = `I found ${destination.name}, but no nearby parking entries were returned.`;
      return;
    }

    const closest = parkingSpots[0];
    buildingSearchStatus.textContent = `Found ${parkingSpots.length} parking options near ${destination.name}. Closest: ${closest.name}, about ${formatDistanceMiles(closest.distanceMeters)} away.`;
  } catch {
    showSearchMarker(destination);
    fitDestinationAndParking(destination, []);
    buildingSearchStatus.textContent = `I found ${destination.name}, but nearby parking search is unavailable right now.`;
  }
}

function isInstalledApp() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true
    || document.referrer.startsWith("android-app://");
}

function updateInstallButtonVisibility() {
  installAppButton.hidden = !isInstalledApp();
}

function updateQrPanel() {
  const url = installAppUrl();
  appQrPanel.hidden = false;
  appQrLink.href = url;
  setAppActionStatus("Scan the QR code to open the app on your phone.");
}

async function installApp() {
  if (isInstalledApp()) {
    setAppActionStatus("You already have installed the app.");
    return;
  }

  if (!deferredInstallPrompt) {
    setAppActionStatus("Use Share app or the QR code to open the hosted app.");
    return;
  }

  deferredInstallPrompt.prompt();
  const outcome = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  updateInstallButtonVisibility();

  if (outcome.outcome === "accepted") {
    setAppActionStatus("Install prompt opened. Finish the install from your browser dialog.");
  } else {
    setAppActionStatus("Install was dismissed. You can try again later from the same button.");
  }
}

async function shareApp() {
  const url = hostedAppUrl();
  if (!url) {
    setAppActionStatus("Share will work once this app is hosted online. Right now it is still running from a local file.");
    return;
  }

  const shareData = {
    title: "Howard+DC landmarks",
    text: "Explore Howard University landmarks, nearby dining, event venues, and parking in one interactive app.",
    url
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      setAppActionStatus("Share dialog opened.");
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      setAppActionStatus("App link copied to your clipboard.");
      return;
    }
  } catch {
    setAppActionStatus("Share was canceled. You can try again anytime.");
    return;
  }

  setAppActionStatus(`Share this link: ${url}`);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Ignore registration failures in unsupported/local contexts.
    });
  });
}

legendButtons.forEach((button) => {
  button.addEventListener("click", () => setFilter(button.dataset.filter));
});

mapButtons.forEach((button) => {
  button.addEventListener("click", () => fitView(button.dataset.view));
});

styleButtons.forEach((button) => {
  button.addEventListener("click", () => setBasemap(button.dataset.style));
});

routeModeButtons.forEach((button) => {
  button.addEventListener("click", () => setRouteMode(button.dataset.routeMode));
});

listSearchBox.addEventListener("input", (event) => {
  listQuery = event.target.value.trim().toLowerCase();
  renderList();
  syncMapState();
  refreshListSuggestions();
});
listSearchBox.addEventListener("focus", () => {
  if (listSearchBox.value.trim()) {
    refreshListSuggestions();
  }
});
listSearchBox.addEventListener("blur", () => {
  window.setTimeout(hideListSuggestions, 120);
});
listSearchBox.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveListSuggestionFocus(1);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveListSuggestionFocus(-1);
    return;
  }

  if (event.key === "Escape") {
    hideListSuggestions();
    return;
  }

  if (event.key === "Enter" && activeDirectorySuggestionIndex >= 0 && directorySuggestions.length) {
    event.preventDefault();
    commitListSuggestion(activeDirectorySuggestionIndex);
  }
});

buildingSearchBox.addEventListener("input", refreshBuildingSuggestions);
buildingSearchBox.addEventListener("focus", () => {
  if (buildingSearchBox.value.trim()) {
    refreshBuildingSuggestions();
  }
});
buildingSearchBox.addEventListener("blur", () => {
  window.setTimeout(hideBuildingSuggestions, 120);
});
buildingSearchBox.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveBuildingSuggestionFocus(1);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveBuildingSuggestionFocus(-1);
    return;
  }

  if (event.key === "Escape") {
    hideBuildingSuggestions();
    return;
  }

  if (event.key === "Enter" && activeDestinationSuggestionIndex >= 0 && destinationSuggestions.length) {
    event.preventDefault();
    commitBuildingSuggestion(activeDestinationSuggestionIndex);
  }
});

buildingFinder.addEventListener("submit", handleBuildingSearch);
installAppButton.addEventListener("click", installApp);
shareAppButton.addEventListener("click", shareApp);
useLocationButton.addEventListener("click", requestCurrentLocation);
navigateButton.addEventListener("click", fetchTurnByTurnRoute);
document.getElementById("markCorrectionButton")?.addEventListener("click", startCorrectionPlacement);
document.getElementById("clearCorrectionButton")?.addEventListener("click", clearSelectedCorrection);
document.getElementById("copyCorrectionDataButton")?.addEventListener("click", () => {
  copyCorrectionData();
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallButtonVisibility();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  updateInstallButtonVisibility();
  setAppActionStatus("Howard+DC landmarks was installed.");
});

renderDetails();
renderList();
renderCorrectionList();
setRouteMode("walking");
updateNavigationUI();
updateCorrectionUI();
updateInstallButtonVisibility();
updateQrPanel();
registerServiceWorker();

try {
  createMap();
  attachCorrectionMapBehavior();
  setBasemap("street");
  fitView("campus");
  syncMapState();
} catch (error) {
  console.error("Failed to initialize the live map.", error);
  buildingSearchStatus.textContent = "The live map hit a saved-data problem while loading. Refresh to retry; the directory is still available.";
}
