const buildingList = document.getElementById("lotList");
const buildingDetails = document.getElementById("lotDetails");
const listSearchBox = document.getElementById("searchBox");
const listSuggestions = document.getElementById("listSuggestions");
const buildingFinder = document.getElementById("buildingFinder");
const buildingSearchBox = document.getElementById("buildingSearchBox");
const buildingSuggestions = document.getElementById("buildingSuggestions");
const buildingSearchStatus = document.getElementById("buildingSearchStatus");
const parkingResults = document.getElementById("parkingResults");
const installAppButton = document.getElementById("installAppButton");
const shareAppButton = document.getElementById("shareAppButton");
const appActionStatus = document.getElementById("appActionStatus");
const useLocationButton = document.getElementById("useLocationButton");
const navigateButton = document.getElementById("navigateButton");
const navigationStatus = document.getElementById("navigationStatus");
const navigationLink = document.getElementById("navigationLink");
const routeSummary = document.getElementById("routeSummary");
const routeSteps = document.getElementById("routeSteps");
const routeModeButtons = [...document.querySelectorAll("[data-route-mode]")];
const legendButtons = [...document.querySelectorAll(".legend-chip")];
const mapButtons = [...document.querySelectorAll("[data-view]")];
const styleButtons = [...document.querySelectorAll(".map-style")];

const campusBounds = [
  [38.91705, -77.0221],
  [38.92695, -77.014]
];

const mapState = {
  map: null,
  layers: new Map(),
  baseLayers: {},
  activeBase: "street",
  searchMarker: null,
  parkingMarkers: [],
  parkingOptions: [],
  selectedParkingId: "",
  currentView: "campus",
  currentLocation: null,
  userLocationMarker: null,
  userAccuracyRing: null,
  navigationLine: null,
  routeMode: "walking",
  routeData: null
};

let activeFilter = "all";
let selectedBuildingName = "";
let listQuery = "";
let destinationSuggestions = [];
let activeDestinationSuggestionIndex = -1;
let directorySuggestions = [];
let activeDirectorySuggestionIndex = -1;
let deferredInstallPrompt = null;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function toDegrees(value) {
  return (value * 180) / Math.PI;
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const value = clean.length === 3
    ? clean.split("").map((char) => char + char).join("")
    : clean;

  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function distanceMiles(from, to) {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

function bearingDegrees(from, to) {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const dLng = toRadians(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function compassDirection(degrees) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return directions[Math.round(degrees / 45) % 8];
}

function healthBounds() {
  return [
    [38.9172, -77.0198],
    [38.9199, -77.014]
  ];
}

function boundsForCategories(categories) {
  const points = buildings
    .filter((building) => categories.includes(building.category))
    .map((building) => buildingPoint(building))
    .filter(Boolean)
    .map((point) => [point.lat, point.lng]);

  return points.length ? points : null;
}

function normalizeText(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function hostedAppUrl() {
  return window.location.protocol === "file:" ? "" : window.location.href;
}

function setAppActionStatus(message) {
  appActionStatus.textContent = message;
}

function destinationSuggestionId(index) {
  return `building-suggestion-${index}`;
}

function directorySuggestionId(index) {
  return `directory-suggestion-${index}`;
}

function routeProfile(mode) {
  return mode === "driving" ? "driving" : "foot";
}

function routeModeLabel(mode) {
  return mode === "driving" ? "Driving" : "Walking";
}

function directionsUrl(origin, destination) {
  const params = new URLSearchParams({
    api: "1",
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    travelmode: mapState.routeMode
  });

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function formatDistanceMiles(meters) {
  return `${(meters / 1609.344).toFixed(2)} mi`;
}

function formatParkingType(tags = {}) {
  if (tags.parking === "multi-storey") {
    return "Garage";
  }
  if (tags.parking === "underground") {
    return "Underground parking";
  }
  if (tags.parking === "surface") {
    return "Surface parking";
  }
  if (tags.parking === "street_side") {
    return "Street-side parking";
  }
  return "Parking";
}

function formatDuration(minutes) {
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remaining = Math.round(minutes % 60);
  return remaining ? `${hours} hr ${remaining} min` : `${hours} hr`;
}

function stepInstruction(step) {
  const maneuver = step.maneuver || {};
  const type = maneuver.type || "continue";
  const modifier = maneuver.modifier ? `${maneuver.modifier} ` : "";
  const road = step.name ? ` onto ${step.name}` : "";

  if (type === "depart") {
    return `Start out ${modifier.trim() || "forward"}${road}`.trim();
  }

  if (type === "arrive") {
    return "Arrive at your destination";
  }

  if (type === "roundabout") {
    const exit = maneuver.exit ? ` and take exit ${maneuver.exit}` : "";
    return `Enter the roundabout${exit}${road}`;
  }

  if (type === "merge") {
    return `Merge ${modifier}${road}`.trim();
  }

  if (type === "fork") {
    return `Keep ${modifier}${road}`.trim();
  }

  if (type === "end of road") {
    return `At the end of the road, turn ${modifier}${road}`.trim();
  }

  if (type === "new name") {
    return `Continue as ${step.name || "the road changes name"}`;
  }

  if (type === "continue") {
    return `Continue ${modifier}${road}`.trim();
  }

  if (type === "turn") {
    return `Turn ${modifier}${road}`.trim();
  }

  return `${type.charAt(0).toUpperCase()}${type.slice(1)} ${modifier}${road}`.trim();
}

function clearRouteDetails() {
  mapState.routeData = null;
  routeSummary.classList.add("is-hidden");
  routeSummary.textContent = "";
  routeSteps.classList.add("is-hidden");
  routeSteps.innerHTML = "";
}

function selectedParking() {
  return mapState.parkingOptions.find((spot) => spot.id === mapState.selectedParkingId) || null;
}

function selectedNavigationTarget() {
  return selectedParking() || selectedBuilding();
}

function normalizePoint(lat, lng) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);

  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    return null;
  }

  if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
    return null;
  }

  return {
    lat: parsedLat,
    lng: parsedLng
  };
}

function buildingPoint(building) {
  return normalizePoint(building?.lat, building?.lng);
}

function clearParkingResults() {
  parkingResults.classList.add("is-hidden");
  parkingResults.innerHTML = "";
  mapState.selectedParkingId = "";
  mapState.parkingOptions = [];

  if (!mapState.map || !mapState.parkingMarkers.length) {
    mapState.parkingMarkers = [];
    return;
  }

  mapState.parkingMarkers.forEach((marker) => {
    mapState.map.removeLayer(marker);
  });
  mapState.parkingMarkers = [];
}

function syncParkingSelection() {
  parkingResults.querySelectorAll("[data-parking-id]").forEach((card) => {
    card.classList.toggle("is-selected", card.dataset.parkingId === mapState.selectedParkingId);
  });

  mapState.parkingMarkers.forEach(({ id, marker }) => {
    const selected = id === mapState.selectedParkingId;
    marker.setStyle({
      radius: selected ? 10 : 8,
      color: selected ? "#10231e" : "#ffffff",
      weight: selected ? 3 : 2,
      fillColor: "#c08a10",
      fillOpacity: selected ? 1 : 0.95
    });
  });
}

function selectParkingSpot(id, moveMap = false) {
  mapState.selectedParkingId = id;
  clearRouteDetails();
  syncParkingSelection();
  updateNavigationUI();

  const spot = selectedParking();
  if (mapState.currentLocation && spot) {
    drawNavigationGuide({ fitBounds: false });
  }

  if (moveMap && spot && mapState.map) {
    mapState.map.flyTo([spot.lat, spot.lng], Math.max(mapState.map.getZoom(), 18), {
      duration: 0.7
    });
    const entry = mapState.parkingMarkers.find((markerEntry) => markerEntry.id === id);
    entry?.marker.openPopup();
  }
}

function renderParkingResults(destination, parkingSpots) {
  if (!parkingSpots.length) {
    parkingResults.classList.add("is-hidden");
    parkingResults.innerHTML = "";
    return;
  }

  const topSpots = parkingSpots.slice(0, 4);
  parkingResults.innerHTML = topSpots.map((spot) => `
    <button class="parking-card" type="button" data-parking-id="${escapeHtml(spot.id)}">
      <p class="parking-card-title">${escapeHtml(spot.name)}</p>
      <div class="parking-card-meta">${escapeHtml(spot.typeLabel)} • ${formatDistanceMiles(spot.distanceMeters)} from ${escapeHtml(destination.name)}</div>
      <div class="parking-card-meta">${escapeHtml(spot.address)}</div>
      <div class="parking-card-meta">Click to navigate to this parking option</div>
    </button>
  `).join("");
  parkingResults.classList.remove("is-hidden");

  parkingResults.querySelectorAll("[data-parking-id]").forEach((button) => {
    button.addEventListener("click", () => selectParkingSpot(button.dataset.parkingId, true));
  });

  syncParkingSelection();
}

function showParkingMarkers(destination, parkingSpots) {
  clearParkingResults();

  if (!mapState.map || !parkingSpots.length) {
    return;
  }

  mapState.parkingOptions = parkingSpots;
  mapState.parkingMarkers = parkingSpots.map((spot) => {
    const marker = L.circleMarker([spot.lat, spot.lng], {
      radius: 8,
      color: "#ffffff",
      weight: 2,
      fillColor: "#c08a10",
      fillOpacity: 0.95
    }).addTo(mapState.map);

    marker.bindPopup(`
      <div class="popup-shell" style="--category-color:#c08a10; --category-tint:rgba(192, 138, 16, 0.14)">
        <div class="popup-category">Parking</div>
        <p class="popup-title">${escapeHtml(spot.name)}</p>
        <p class="popup-meta">${escapeHtml(spot.typeLabel)}<br>${escapeHtml(spot.address)}<br>${formatDistanceMiles(spot.distanceMeters)} from ${escapeHtml(destination.name)}</p>
      </div>
    `);
    marker.on("click", () => selectParkingSpot(spot.id, false));

    return { id: spot.id, marker };
  });

  renderParkingResults(destination, parkingSpots);
  if (parkingSpots[0]) {
    selectParkingSpot(parkingSpots[0].id, false);
  }
}

function setRouteMode(mode) {
  mapState.routeMode = mode === "driving" ? "driving" : "walking";
  routeModeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.routeMode === mapState.routeMode);
  });

  clearRouteDetails();

  if (mapState.currentLocation && selectedNavigationTarget()) {
    drawNavigationGuide({ fitBounds: false });
  } else {
    updateNavigationUI();
  }
}

function clearNavigationGuide() {
  mapState.routeData = null;
  if (!mapState.map || !mapState.navigationLine) {
    clearRouteDetails();
    return;
  }

  mapState.map.removeLayer(mapState.navigationLine);
  mapState.navigationLine = null;
  clearRouteDetails();
}

function renderRouteDetails(route) {
  const durationMinutes = route.duration / 60;
  routeSummary.textContent = `${routeModeLabel(mapState.routeMode)} route: ${formatDistanceMiles(route.distance)} • about ${formatDuration(durationMinutes)}`;
  routeSummary.classList.remove("is-hidden");

  const steps = route.legs.flatMap((leg) => leg.steps || []).filter((step) => step.distance > 0 || (step.maneuver && step.maneuver.type === "arrive"));
  routeSteps.innerHTML = steps.map((step, index) => `
    <div class="route-step">
      <p class="route-step-title">${index + 1}. ${stepInstruction(step)}</p>
      <div class="route-step-meta">${formatDistanceMiles(step.distance)} • about ${formatDuration(step.duration / 60)}</div>
    </div>
  `).join("");
  routeSteps.classList.toggle("is-hidden", steps.length === 0);
}

function updateNavigationUI() {
  const destination = selectedNavigationTarget();
  const origin = mapState.currentLocation;
  const parkingSpot = selectedParking();

  navigateButton.textContent = parkingSpot ? "Navigate to selected parking" : "Navigate to selected";

  navigateButton.disabled = !(origin && destination);

  if (!(origin && destination)) {
    navigationLink.classList.add("is-hidden");
    navigationLink.removeAttribute("href");
  } else {
    navigationLink.href = directionsUrl(origin, destination);
    navigationLink.classList.remove("is-hidden");
  }

  if (!destination && !origin) {
    navigationStatus.textContent = "Select a landmark, then use your location to start navigation.";
    clearNavigationGuide();
    return;
  }

  if (!destination) {
    navigationStatus.textContent = "Your location is set. Pick a landmark to draw the route.";
    clearNavigationGuide();
    return;
  }

  if (!origin) {
    navigationStatus.textContent = `Selected: ${destination.name}. Use your location to navigate there.`;
    clearNavigationGuide();
    return;
  }

  if (mapState.routeData) {
    navigationStatus.textContent = `${routeModeLabel(mapState.routeMode)} directions are ready for ${destination.name}.`;
    return;
  }

  clearRouteDetails();
  const miles = distanceMiles(origin, destination);
  const direction = compassDirection(bearingDegrees(origin, destination));
  navigationStatus.textContent = `Ready to build a ${mapState.routeMode} route to ${destination.name}. It is about ${miles.toFixed(2)} miles ${direction} of you.`;
}

function setCurrentLocation(lat, lng, accuracy = 0) {
  mapState.currentLocation = { lat, lng };

  if (!mapState.map) {
    updateNavigationUI();
    return;
  }

  if (!mapState.userLocationMarker) {
    mapState.userLocationMarker = L.circleMarker([lat, lng], {
      radius: 10,
      color: "#ffffff",
      weight: 3,
      fillColor: "#0d5a8d",
      fillOpacity: 0.95
    }).addTo(mapState.map);
  } else {
    mapState.userLocationMarker.setLatLng([lat, lng]);
  }

  mapState.userLocationMarker.bindPopup(`
    <div class="popup-shell" style="--category-color:#0d5a8d; --category-tint:rgba(13, 90, 141, 0.14)">
      <div class="popup-category">Your location</div>
      <p class="popup-title">Current position</p>
      <p class="popup-meta">${accuracy ? `Accuracy about ${Math.round(accuracy)} meters` : "Live browser geolocation"}</p>
    </div>
  `);

  if (accuracy > 0) {
    if (!mapState.userAccuracyRing) {
      mapState.userAccuracyRing = L.circle([lat, lng], {
        radius: accuracy,
        color: "#0d5a8d",
        weight: 1,
        fillColor: "#0d5a8d",
        fillOpacity: 0.08
      }).addTo(mapState.map);
    } else {
      mapState.userAccuracyRing.setLatLng([lat, lng]);
      mapState.userAccuracyRing.setRadius(accuracy);
    }
  }

  updateNavigationUI();
}

function drawNavigationGuide(options = {}) {
  const { fitBounds = true } = options;
  const destination = selectedNavigationTarget();
  const origin = mapState.currentLocation;

  if (!mapState.map || !origin || !destination) {
    updateNavigationUI();
    return;
  }

  const points = [
    [origin.lat, origin.lng],
    [destination.lat, destination.lng]
  ];

  if (!mapState.navigationLine) {
    mapState.navigationLine = L.polyline(points, {
      color: "#103b4d",
      weight: 4,
      opacity: 0.8,
      dashArray: "10 10"
    }).addTo(mapState.map);
  } else {
    mapState.navigationLine.setLatLngs(points);
  }

  if (fitBounds) {
    mapState.map.fitBounds(points, { padding: [32, 32] });
  }

  updateNavigationUI();
}

async function fetchTurnByTurnRoute() {
  const destination = selectedNavigationTarget();
  const origin = mapState.currentLocation;

  if (!origin || !destination) {
    updateNavigationUI();
    return;
  }

  navigationStatus.textContent = `Building a ${mapState.routeMode} route to ${destination.name}...`;
  routeSummary.classList.add("is-hidden");
  routeSteps.classList.add("is-hidden");

  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const params = new URLSearchParams({
    overview: "full",
    geometries: "geojson",
    steps: "true"
  });

  try {
    const response = await fetch(`https://router.project-osrm.org/route/v1/${routeProfile(mapState.routeMode)}/${coordinates}?${params.toString()}`, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Routing failed with status ${response.status}`);
    }

    const payload = await response.json();
    const route = payload.routes?.[0];
    if (!route) {
      throw new Error("No route returned");
    }

    const points = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    if (!mapState.navigationLine) {
      mapState.navigationLine = L.polyline(points, {
        color: "#103b4d",
        weight: 4,
        opacity: 0.88
      }).addTo(mapState.map);
    } else {
      mapState.navigationLine.setStyle({
        color: "#103b4d",
        weight: 4,
        opacity: 0.88,
        dashArray: null
      });
      mapState.navigationLine.setLatLngs(points);
    }

    mapState.routeData = route;
    mapState.map.fitBounds(points, { padding: [32, 32] });
    renderRouteDetails(route);
    updateNavigationUI();
  } catch {
    mapState.routeData = null;
    navigationStatus.textContent = `${routeModeLabel(mapState.routeMode)} turn-by-turn routing is unavailable right now for ${destination.name}. The direct guide line is still shown on the map.`;
    drawNavigationGuide({ fitBounds: true });
  }
}

function requestCurrentLocation() {
  if (!("geolocation" in navigator)) {
    navigationStatus.textContent = "This browser does not support location access.";
    return;
  }

  navigationStatus.textContent = "Finding your current location...";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      setCurrentLocation(latitude, longitude, accuracy);

      const destination = selectedNavigationTarget();
      if (destination) {
        drawNavigationGuide({ fitBounds: true });
      } else if (mapState.map) {
        mapState.map.flyTo([latitude, longitude], Math.max(mapState.map.getZoom(), 16), {
          duration: 0.7
        });
      }
    },
    () => {
      navigationStatus.textContent = "Location access was unavailable. Check your browser permissions and try again.";
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
}

function popupMarkup(building) {
  const style = categoryStyles[building.category] || {
    label: building.typeLabel || "Landmark",
    color: "#103b4d"
  };
  const tint = hexToRgba(style.color, 0.14);
  return `
    <div class="popup-shell" style="--category-color:${style.color}; --category-tint:${tint}">
      <div class="popup-category">${style.label}</div>
      <p class="popup-title">${building.name}</p>
      <p class="popup-meta">${building.typeLabel}<br>${building.address}</p>
    </div>
  `;
}

function selectedBuilding() {
  return buildings.find((item) => item.name === selectedBuildingName) || null;
}

function destinationFromLocalMatch(building) {
  return {
    name: building.name,
    address: building.address,
    lat: building.lat,
    lng: building.lng
  };
}

function matchesViewMode(building) {
  if (mapState.currentView === "dining") {
    return ["restaurant", "brunch", "winery"].includes(building.category);
  }

  if (mapState.currentView === "events") {
    return building.category === "event-venue";
  }

  if (mapState.currentView === "regional") {
    return ["restaurant", "brunch", "winery", "event-venue"].includes(building.category);
  }

  return true;
}

function averagePriceRange(building) {
  return foodVenueCategories.has(building.category) ? foodPriceRanges[building.name] || "" : "";
}

function selectionAllowedInCurrentView() {
  const building = selectedBuilding();
  if (!building) {
    return true;
  }

  return matchesViewMode(building);
}

function detailMarkup(building) {
  const style = categoryStyles[building.category];
  const tint = hexToRgba(style.color, 0.12);
  const border = hexToRgba(style.color, 0.32);
  return `
    <div class="detail-shell" style="--category-color:${style.color}; --category-tint:${tint}; --category-border:${border}">
      <h2>${building.name}</h2>
      <div class="lot-type" style="background:${style.color}">
        <span class="swatch" style="background:rgba(255,255,255,0.28)"></span>
        ${building.typeLabel}
      </div>
      <p class="lot-meta">${building.note}</p>
      <div class="detail-grid">
        <div class="detail-row">
          <strong>Address</strong>
          <span>${building.address}</span>
        </div>
        <div class="detail-row">
          <strong>Category</strong>
          <span>${style.label}</span>
        </div>
      </div>
    </div>
  `;
}

function createMap() {
  if (!window.L) {
    return;
  }

  const campusCenter = [38.9211, -77.0181];
  const map = L.map("map", {
    zoomControl: false,
    scrollWheelZoom: true,
    minZoom: 12,
    maxZoom: 21
  });
  map.setView(campusCenter, 16);
  L.control.zoom({ position: "topright" }).addTo(map);

  const streetLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 20,
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
  });

  const imageryLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 21,
    attribution: "Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
  });

  streetLayer.addTo(map);
  mapState.map = map;
  mapState.baseLayers = {
    street: streetLayer,
    imagery: imageryLayer
  };

  buildings.forEach((building) => {
    const point = buildingPoint(building);
    if (!point) {
      return;
    }

    const style = categoryStyles[building.category];
    const layer = L.circleMarker([point.lat, point.lng], {
      radius: 9,
      color: "#ffffff",
      weight: 2,
      fillColor: style.color,
      fillOpacity: 0.92
    }).addTo(map);

    layer.bindTooltip(building.shortLabel, {
      permanent: true,
      direction: "top",
      offset: [0, -4],
      className: "lot-label"
    });
    layer.bindPopup(popupMarkup(building));
    layer.on("click", () => selectBuilding(building.name, true));
    mapState.layers.set(building.name, layer);
  });

  window.setTimeout(() => {
    map.invalidateSize();
    fitView(mapState.currentView);
  }, 0);
}

function matchesCurrentView(building) {
  const searchText = `${building.name} ${(building.aliases || []).join(" ")} ${building.address}`.toLowerCase();
  return matchesDirectoryScope(building) && searchText.includes(listQuery);
}

function filteredBuildings() {
  return buildings.filter(matchesCurrentView).sort((a, b) => a.name.localeCompare(b.name));
}

function renderDetails() {
  const building = buildings.find((item) => item.name === selectedBuildingName);
  if (!building) {
    buildingDetails.innerHTML = `
      <h2>Pick a landmark</h2>
      <p>Choose a campus or regional landmark on the map or from the list below to view its address, category, and notes.</p>
    `;
    return;
  }

  buildingDetails.innerHTML = detailMarkup(building);
}

function renderList() {
  const visible = filteredBuildings();

  if (!visible.length) {
    buildingList.innerHTML = `<div class="empty-state">No landmarks match that filter.</div>`;
    return;
  }

  buildingList.innerHTML = visible.map((building) => {
    const style = categoryStyles[building.category];
    const selected = building.name === selectedBuildingName ? "is-selected" : "";
    const tint = hexToRgba(style.color, 0.12);
    const border = hexToRgba(style.color, 0.3);
    const priceRange = averagePriceRange(building);
    return `
      <button
        class="lot-button ${selected}"
        data-name="${building.name}"
        style="--category-color:${style.color}; --category-tint:${tint}; --category-border:${border}"
      >
        <div class="lot-topline">
          <span class="lot-name">${building.name}</span>
          <span class="lot-badge">
            <span class="dot" style="background:${style.color}"></span>
            ${style.label}
          </span>
        </div>
        <div class="lot-meta"><strong class="lot-inline-label">${building.shortLabel}</strong> | ${building.typeLabel}</div>
        <div class="lot-address">${building.address}</div>
        ${priceRange ? `<div class="lot-price">Avg. price: ${priceRange}</div>` : ""}
      </button>
    `;
  }).join("");

  buildingList.querySelectorAll(".lot-button").forEach((button) => {
    button.addEventListener("click", () => selectBuilding(button.dataset.name, true));
  });
}

function syncMapState() {
  if (!mapState.map) {
    return;
  }

  buildings.forEach((building) => {
    const layer = mapState.layers.get(building.name);
    if (!layer) {
      return;
    }

    const visible = matchesCurrentView(building);
    const selected = building.name === selectedBuildingName;
    const style = categoryStyles[building.category];

    layer.setStyle({
      fillColor: style.color,
      fillOpacity: visible ? (selected ? 0.96 : 0.82) : 0,
      color: selected ? "#10231e" : "#ffffff",
      weight: selected ? 3 : 2,
      opacity: visible ? 1 : 0
    });
    layer.setRadius(visible ? (selected ? 11 : 8) : 0);

    const tooltipElement = layer.getTooltip()?.getElement?.();
    if (tooltipElement) {
      tooltipElement.style.display = visible ? "" : "none";
    }
  });
}

function focusBuildingOnMap(building) {
  if (!mapState.map) {
    return;
  }

  const layer = mapState.layers.get(building.name);
  const point = buildingPoint(building);
  if (!layer || !point) {
    return;
  }

  mapState.map.flyTo([point.lat, point.lng], Math.max(mapState.map.getZoom(), 18), {
    duration: 0.7
  });
  layer.openPopup();
}
