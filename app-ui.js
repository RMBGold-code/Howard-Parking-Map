function selectBuilding(name, moveMap = false) {
  selectedBuildingName = name;
  mapState.selectedParkingId = "";
  const building = selectedBuilding();
  renderDetails();
  renderList();
  syncMapState();
  syncParkingSelection();
  updateNavigationUI();

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

function deviceProfile() {
  const ua = navigator.userAgent || "";
  const touchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const isiPhone = /iPhone/i.test(ua);
  const isiPad = /iPad/i.test(ua) || touchMac;
  const isIOS = isiPhone || isiPad;
  const isFirefox = /Firefox/i.test(ua) && !/Seamonkey/i.test(ua);
  const isMac = /Macintosh|Mac OS X/i.test(ua) && !isIOS;
  const isWindows = /Windows/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|Edg|OPR|Firefox/i.test(ua);
  const isChromium = /Chrome|CriOS|Edg/i.test(ua);

  return {
    isiPhone,
    isiPad,
    isIOS,
    isFirefox,
    isMac,
    isWindows,
    isAndroid,
    isSafari,
    isChromium
  };
}

function installShortcutHelpText() {
  const profile = deviceProfile();

  if (profile.isiPhone || profile.isiPad) {
    return "On iPhone or iPad in Safari, tap Share, then Add to Home Screen.";
  }

  if (profile.isFirefox && profile.isAndroid) {
    return "In Firefox on Android, open the browser menu, then tap Install or Add to Home Screen.";
  }

  if (profile.isFirefox && profile.isWindows) {
    return "In Firefox on Windows 143 or later, click the web app button in the address bar to install this site as a web app. This is not available in the Microsoft Store build of Firefox.";
  }

  if (profile.isMac && profile.isSafari) {
    return "On Safari for Mac, open File, then choose Add to Dock.";
  }

  if (profile.isChromium) {
    return "If the browser does not prompt automatically, open the browser menu and choose Install app or Create shortcut.";
  }

  if (profile.isAndroid) {
    return "On Android, open the browser menu and choose Install app or Add to Home screen.";
  }

  return "Open this page in Safari, Chrome, or Edge and use Add to Home Screen, Add to Dock, or your browser's install shortcut option.";
}

function updateInstallButtonVisibility() {
  installAppButton.hidden = isInstalledApp() || !hostedAppUrl();
}

function updateAppUpdateUI() {
  appUpdatePanel.hidden = !appUpdateReady;
}

function updateQrPanel() {
  const url = installAppUrl();
  appQrPanel.hidden = false;
  appQrLink.href = url;
  setAppActionStatus("Scan the QR code to open the app on your phone.");
}

function markAppUpdateReady(registration = serviceWorkerRegistration) {
  if (!registration?.waiting) {
    return;
  }

  serviceWorkerRegistration = registration;
  appUpdateReady = true;
  updateAppUpdateUI();
  setAppActionStatus("A newer version is ready. Select Update app to refresh.");
}

function watchServiceWorkerInstallation(worker, registration) {
  if (!worker) {
    return;
  }

  worker.addEventListener("statechange", () => {
    if (worker.state === "installed" && navigator.serviceWorker.controller) {
      markAppUpdateReady(registration);
    }
  });
}

function refreshAppToLatest() {
  if (!serviceWorkerRegistration?.waiting) {
    setAppActionStatus("No update is ready yet.");
    return;
  }

  appUpdateRefreshPending = true;
  setAppActionStatus("Updating app...");
  serviceWorkerRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
}

async function installApp() {
  if (isInstalledApp()) {
    setAppActionStatus("You already have installed the app.");
    return;
  }

  if (!hostedAppUrl()) {
    setAppActionStatus("Install shortcuts work from the hosted app link, not from a local file.");
    return;
  }

  if (!deferredInstallPrompt) {
    setAppActionStatus(installShortcutHelpText());
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
    navigator.serviceWorker.register("./sw.js")
      .then((registration) => {
        serviceWorkerRegistration = registration;

        if (registration.waiting) {
          markAppUpdateReady(registration);
        }

        if (registration.installing) {
          watchServiceWorkerInstallation(registration.installing, registration);
        }

        registration.addEventListener("updatefound", () => {
          watchServiceWorkerInstallation(registration.installing, registration);
        });

        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (!appUpdateRefreshPending) {
            return;
          }

          appUpdateRefreshPending = false;
          window.location.reload();
        });

        const checkForAppUpdate = () => {
          registration.update().catch(() => {
            // Ignore update polling failures in offline or unsupported contexts.
          });
        };

        window.addEventListener("focus", checkForAppUpdate);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            checkForAppUpdate();
          }
        });
      })
      .catch(() => {
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
refreshAppButton.addEventListener("click", refreshAppToLatest);
useLocationButton.addEventListener("click", requestCurrentLocation);
navigateButton.addEventListener("click", fetchTurnByTurnRoute);

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
setRouteMode("walking");
updateNavigationUI();
updateInstallButtonVisibility();
updateAppUpdateUI();
updateQrPanel();
registerServiceWorker();

try {
  createMap();
  setBasemap("street");
  fitView("campus");
  syncMapState();
} catch (error) {
  console.error("Failed to initialize the live map.", error);
  buildingSearchStatus.textContent = "The live map hit a saved-data problem while loading. Refresh to retry; the directory is still available.";
}
