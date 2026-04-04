const buildingList = document.getElementById("lotList");
const buildingDetails = document.getElementById("lotDetails");
const mapCanvas = document.getElementById("map");
const listSearchBox = document.getElementById("searchBox");
const listSuggestions = document.getElementById("listSuggestions");
const buildingFinder = document.getElementById("buildingFinder");
const buildingSearchBox = document.getElementById("buildingSearchBox");
const buildingSuggestions = document.getElementById("buildingSuggestions");
const buildingSearchStatus = document.getElementById("buildingSearchStatus");
const parkingResults = document.getElementById("parkingResults");
const installAppButton = document.getElementById("installAppButton");
const shareAppButton = document.getElementById("shareAppButton");
const installHelpPanel = document.getElementById("installHelpPanel");
const installHelpTitle = document.getElementById("installHelpTitle");
const installHelpBody = document.getElementById("installHelpBody");
const appQrPanel = document.getElementById("appQrPanel");
const appQrLink = document.getElementById("appQrLink");
const appQrImage = document.getElementById("appQrImage");
const appQrNote = document.getElementById("appQrNote");
const appActionStatus = document.getElementById("appActionStatus");
const useLocationButton = document.getElementById("useLocationButton");
const startingLocationButton = document.getElementById("startingLocationButton");
const navigateButton = document.getElementById("navigateButton");
const stopNavigationButton = document.getElementById("stopNavigationButton");
const clearSelectionButton = document.getElementById("clearSelectionButton");
const navigationActiveBanner = document.getElementById("navigationActiveBanner");
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
  currentLocationLabel: "Current position",
  currentLocationDescription: "Live browser geolocation",
  userLocationMarker: null,
  userAccuracyRing: null,
  navigationLine: null,
  navigationActive: false,
  navigationFallbackMessage: "",
  routeMode: "driving",
  routeData: null,
  routeKey: ""
};

let activeFilter = "all";
let selectedBuildingName = "";
let listQuery = "";
let destinationSuggestions = [];
let activeDestinationSuggestionIndex = -1;
let directorySuggestions = [];
let activeDirectorySuggestionIndex = -1;
let deferredInstallPrompt = null;
let serviceWorkerRegistration = null;

function snapViewportToMap() {
  if (!mapCanvas) {
    return;
  }

  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  window.setTimeout(() => {
    const rect = mapCanvas.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const absoluteCenter = window.scrollY + rect.top + (rect.height / 2);
    const centeredTop = absoluteCenter - (viewportHeight / 2);
    window.scrollTo({
      top: Math.max(0, centeredTop),
      behavior
    });
  }, 120);
}

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

function installAppUrl() {
  return "https://rmbgold-code.github.io/Howard-Parking-Map/";
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

function buildRouteKey(origin, destination, mode) {
  if (!origin || !destination) {
    return "";
  }

  const round = (value) => Number(value).toFixed(5);
  return [
    mode,
    round(origin.lat),
    round(origin.lng),
    round(destination.lat),
    round(destination.lng)
  ].join("|");
}

function estimatedTravelMinutes(miles, mode) {
  if (!Number.isFinite(miles) || miles <= 0) {
    return 0;
  }

  if (mode === "driving") {
    const roadMiles = (miles * 1.28) + 0.2;
    const averageUrbanSpeedMph = 20;
    const trafficDelayMinutes = Math.min(16, Math.max(3, miles * 1.6));
    return ((roadMiles / averageUrbanSpeedMph) * 60) + trafficDelayMinutes;
  }

  const pedestrianMiles = (miles * 1.08) + 0.05;
  const walkingSpeedMph = 3.0;
  const crossingDelayMinutes = Math.min(14, Math.max(4, miles * 2.8));
  return ((pedestrianMiles / walkingSpeedMph) * 60) + crossingDelayMinutes;
}

function estimatedTravelDistanceMiles(miles, mode) {
  if (!Number.isFinite(miles) || miles <= 0) {
    return 0;
  }

  return mode === "driving"
    ? (miles * 1.28) + 0.2
    : (miles * 1.08) + 0.05;
}

function routeModeBasisLabel(mode) {
  return mode === "driving"
    ? "roads and traffic patterns"
    : "sidewalks, crossings, and walkable street access";
}

function renderEstimatedRouteDetails(origin, destination) {
  const directMiles = distanceMiles(origin, destination);
  const estimatedMiles = estimatedTravelDistanceMiles(directMiles, mapState.routeMode);
  const estimatedMinutes = estimatedTravelMinutes(directMiles, mapState.routeMode);

  routeSummary.textContent = `${routeModeLabel(mapState.routeMode)} estimate: ${estimatedMiles.toFixed(2)} mi • about ${formatDuration(estimatedMinutes)}`;
  routeSummary.classList.remove("is-hidden");

  routeSteps.innerHTML = `
    <div class="route-step">
      <p class="route-step-title">Estimated ${mapState.routeMode} travel</p>
      <div class="route-step-meta">Based on ${routeModeBasisLabel(mapState.routeMode)} from your starting point to ${destination.name}.</div>
    </div>
  `;
  routeSteps.classList.remove("is-hidden");
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

function syncNavigationActivityUI(destination = selectedNavigationTarget(), origin = mapState.currentLocation) {
  const active = Boolean(mapState.navigationActive && origin && destination);

  if (stopNavigationButton) {
    stopNavigationButton.disabled = !active;
  }

  if (!navigationActiveBanner) {
    return;
  }

  if (!active) {
    navigationActiveBanner.textContent = "";
    navigationActiveBanner.classList.add("is-hidden");
    return;
  }

  navigationActiveBanner.innerHTML = `
    <strong class="nav-active-title">${routeModeLabel(mapState.routeMode)} navigation active</strong>
    <span class="nav-active-copy">Following directions to ${escapeHtml(destination.name)}.</span>
  `;
  navigationActiveBanner.classList.remove("is-hidden");
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
  mapState.routeKey = "";
  routeSummary.classList.add("is-hidden");
  routeSummary.textContent = "";
  routeSteps.classList.add("is-hidden");
  routeSteps.innerHTML = "";
}

function syncClearSelectionButton() {
  if (!clearSelectionButton) {
    return;
  }

  clearSelectionButton.disabled = !(selectedBuildingName || mapState.selectedParkingId);
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

function selectParkingSpot(id, moveMap = false, snapToMap = false) {
  mapState.selectedParkingId = id;
  mapState.navigationActive = false;
  mapState.navigationFallbackMessage = "";
  clearRouteDetails();
  syncParkingSelection();
  updateNavigationUI();
  syncClearSelectionButton();

  const spot = selectedParking();
  if (mapState.currentLocation && spot) {
    fetchTurnByTurnRoute();
  }

  if (moveMap && spot && mapState.map) {
    mapState.map.flyTo([spot.lat, spot.lng], Math.max(mapState.map.getZoom(), 18), {
      duration: 0.7
    });
    const entry = mapState.parkingMarkers.find((markerEntry) => markerEntry.id === id);
    entry?.marker.openPopup();
  }

  if (snapToMap) {
    snapViewportToMap();
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
    button.addEventListener("click", () => selectParkingSpot(button.dataset.parkingId, true, true));
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
      marker.on("click", () => selectParkingSpot(spot.id, false, false));

    return { id: spot.id, marker };
  });

  renderParkingResults(destination, parkingSpots);
  if (parkingSpots[0]) {
    selectParkingSpot(parkingSpots[0].id, false);
  }
}

function setRouteMode(mode) {
  mapState.routeMode = mode === "driving" ? "driving" : "walking";
  mapState.navigationActive = false;
  mapState.navigationFallbackMessage = "";
  routeModeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.routeMode === mapState.routeMode);
  });

  clearRouteDetails();

  if (mapState.currentLocation && selectedNavigationTarget()) {
    fetchTurnByTurnRoute();
  } else {
    updateNavigationUI();
  }
}

function clearNavigationGuide() {
  mapState.routeData = null;
  mapState.routeKey = "";
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
  const currentRouteKey = buildRouteKey(origin, destination, mapState.routeMode);

  navigateButton.textContent = parkingSpot ? "Navigate to selected parking" : "Navigate to selected";
  syncNavigationActivityUI(destination, origin);

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

  if (mapState.routeData && mapState.routeKey === currentRouteKey) {
    navigationStatus.textContent = `${routeModeLabel(mapState.routeMode)} directions are ready for ${destination.name}.`;
    return;
  }

  if (mapState.navigationActive) {
    navigationStatus.textContent = mapState.navigationFallbackMessage
      || `${routeModeLabel(mapState.routeMode)} navigation is active for ${destination.name}.`;
    return;
  }

  clearRouteDetails();
  const miles = distanceMiles(origin, destination);
  const direction = compassDirection(bearingDegrees(origin, destination));
  const estimatedMinutes = estimatedTravelMinutes(miles, mapState.routeMode);
  navigationStatus.textContent = `Ready to build a ${mapState.routeMode} route to ${destination.name}. It is about ${miles.toFixed(2)} miles ${direction} of you, or roughly ${formatDuration(estimatedMinutes)} using ${routeModeBasisLabel(mapState.routeMode)} before live routing is loaded.`;
}

function clearSelection() {
  selectedBuildingName = "";
  mapState.selectedParkingId = "";
  mapState.navigationActive = false;
  mapState.navigationFallbackMessage = "";

  if (mapState.map) {
    mapState.map.closePopup();
  }

  clearNavigationGuide();
  renderDetails();
  renderList();
  syncMapState();
  syncParkingSelection();
  updateNavigationUI();
  syncClearSelectionButton();
}

function stopNavigation() {
  mapState.navigationActive = false;
  mapState.navigationFallbackMessage = "";
  clearNavigationGuide();
  updateNavigationUI();
}

function setCurrentLocation(lat, lng, accuracy = 0, options = {}) {
  const previousLocation = mapState.currentLocation;
  mapState.currentLocation = { lat, lng };
  mapState.currentLocationLabel = options.label || "Current position";
  mapState.currentLocationDescription = options.description
    || (accuracy ? `Accuracy about ${Math.round(accuracy)} meters` : "Live browser geolocation");
  const locationChanged = !previousLocation || distanceMiles(previousLocation, mapState.currentLocation) > 0.02;

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
      <p class="popup-title">${escapeHtml(mapState.currentLocationLabel)}</p>
      <p class="popup-meta">${escapeHtml(mapState.currentLocationDescription)}</p>
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

  if (locationChanged) {
    mapState.navigationActive = false;
    mapState.navigationFallbackMessage = "";
    clearNavigationGuide();
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
    mapState.navigationLine.setStyle({
      color: "#103b4d",
      weight: 4,
      opacity: 0.8,
      dashArray: "10 10"
    });
    mapState.navigationLine.setLatLngs(points);
  }

  if (fitBounds) {
    mapState.map.fitBounds(points, { padding: [32, 32] });
  }

  updateNavigationUI();
}

async function snapPointToNetwork(point, mode) {
  const normalized = normalizePoint(point?.lat, point?.lng);
  if (!normalized) {
    return null;
  }

  const params = new URLSearchParams({
    number: "1"
  });

  const response = await fetch(
    `https://router.project-osrm.org/nearest/v1/${routeProfile(mode)}/${normalized.lng},${normalized.lat}?${params.toString()}`,
    {
      headers: {
        Accept: "application/json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Nearest-point lookup failed with status ${response.status}`);
  }

  const payload = await response.json();
  const waypoint = payload.waypoints?.[0];
  const location = waypoint?.location;

  if (!Array.isArray(location) || location.length < 2) {
    return normalized;
  }

  return {
    lat: Number(location[1]),
    lng: Number(location[0])
  };
}

async function requestOsrmRoute(origin, destination, mode, options = {}) {
  const params = new URLSearchParams({
    overview: options.overview || "full",
    geometries: "geojson",
    steps: options.steps === false ? "false" : "true"
  });

  const coordinates = `${destination ? `${origin.lng},${origin.lat};${destination.lng},${destination.lat}` : ""}`;
  const response = await fetch(
    `https://router.project-osrm.org/route/v1/${routeProfile(mode)}/${coordinates}?${params.toString()}`,
    {
      headers: {
        Accept: "application/json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Routing failed with status ${response.status}`);
  }

  const payload = await response.json();
  const route = payload.routes?.[0];
  if (!route) {
    throw new Error(payload.code || "No route returned");
  }

  return route;
}

async function resolveDrivingRoute(origin, destination) {
  const snappedOrigin = await snapPointToNetwork(origin, "driving").catch(() => origin);
  const snappedDestination = await snapPointToNetwork(destination, "driving").catch(() => destination);

  const attempts = [
    () => requestOsrmRoute(snappedOrigin, snappedDestination, "driving", { steps: true, overview: "full" }),
    () => requestOsrmRoute(origin, destination, "driving", { steps: true, overview: "full" }),
    () => requestOsrmRoute(snappedOrigin, snappedDestination, "driving", { steps: false, overview: "simplified" }),
    () => requestOsrmRoute(origin, destination, "driving", { steps: false, overview: "simplified" })
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Driving route unavailable");
}

async function fetchTurnByTurnRoute() {
  const destination = selectedNavigationTarget();
  const origin = mapState.currentLocation;

  if (!origin || !destination) {
    updateNavigationUI();
    return;
  }

  mapState.navigationActive = true;
  mapState.navigationFallbackMessage = "";
  const requestKey = buildRouteKey(origin, destination, mapState.routeMode);
  syncNavigationActivityUI(destination, origin);
  navigationStatus.textContent = `Building a ${mapState.routeMode} route to ${destination.name}...`;
  routeSummary.classList.add("is-hidden");
  routeSteps.classList.add("is-hidden");

  try {
    if (requestKey !== buildRouteKey(mapState.currentLocation, selectedNavigationTarget(), mapState.routeMode)) {
      return;
    }

    const route = mapState.routeMode === "driving"
      ? await resolveDrivingRoute(origin, destination)
      : await requestOsrmRoute(origin, destination, mapState.routeMode, { steps: true, overview: "full" });

    if (requestKey !== buildRouteKey(mapState.currentLocation, selectedNavigationTarget(), mapState.routeMode)) {
      return;
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
    mapState.routeKey = requestKey;
    mapState.navigationFallbackMessage = "";
    mapState.map.fitBounds(points, { padding: [32, 32] });
    renderRouteDetails(route);
    updateNavigationUI();
  } catch (error) {
    if (requestKey !== buildRouteKey(mapState.currentLocation, selectedNavigationTarget(), mapState.routeMode)) {
      return;
    }
    mapState.routeData = null;
    mapState.routeKey = "";
    const reason = error?.message ? ` (${error.message})` : "";
    mapState.navigationFallbackMessage = `${routeModeLabel(mapState.routeMode)} turn-by-turn routing is unavailable right now for ${destination.name}, so this is an estimate based on ${routeModeBasisLabel(mapState.routeMode)}${reason}.`;
    navigationStatus.textContent = mapState.navigationFallbackMessage;
    renderEstimatedRouteDetails(origin, destination);
    drawNavigationGuide({ fitBounds: true });
  }
}

function requestCurrentLocation() {
  if (!("geolocation" in navigator)) {
    navigationStatus.textContent = "This browser does not support location access.";
    return;
  }

  navigationStatus.textContent = "Finding your current location with a fresh browser fix...";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      setCurrentLocation(latitude, longitude, accuracy);
      const accuracyText = accuracy ? ` Accuracy about ${Math.round(accuracy)} meters.` : "";

      const destination = selectedNavigationTarget();
      if (destination) {
        navigationStatus.textContent = `Location updated.${accuracyText} Building a ${mapState.routeMode} route to ${destination.name}...`;
        fetchTurnByTurnRoute();
      } else if (mapState.map) {
        navigationStatus.textContent = `Location updated.${accuracyText} Select a destination to navigate.`;
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
      timeout: 15000,
      maximumAge: 0
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
  const hours = buildingHours(building);
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
        <div class="detail-row">
          <strong>Hours</strong>
          <span>${hours}</span>
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
      layer.on("click", () => selectBuilding(building.name, true, false));
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
      <p>Tap any landmark on the map or in the directory to view:</p>
      <div class="detail-grid">
        <div class="detail-row"><strong>Address</strong></div>
        <div class="detail-row"><strong>Category</strong></div>
        <div class="detail-row"><strong>Notes</strong></div>
        <div class="detail-row"><strong>Navigation options</strong></div>
      </div>
    `;
    syncClearSelectionButton();
    return;
  }

  buildingDetails.innerHTML = detailMarkup(building);
  syncClearSelectionButton();
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
    const hours = buildingHours(building);
    const selectedFlag = building.name === selectedBuildingName
      ? `<div class="lot-selected-flag">Selected</div>`
      : "";
    return `
      <button
        class="lot-button ${selected}"
        data-name="${building.name}"
        style="--category-color:${style.color}; --category-tint:${tint}; --category-border:${border}"
      >
        ${selectedFlag}
        <div class="lot-topline">
          <span class="lot-name">${building.name}</span>
          <span class="lot-badge">
            <span class="dot" style="background:${style.color}"></span>
            ${style.label}
          </span>
        </div>
        <div class="lot-meta"><strong class="lot-inline-label">${building.shortLabel}</strong> | ${building.typeLabel}</div>
        <div class="lot-address">${building.address}</div>
        <div class="lot-hours">Hours: ${hours}</div>
        ${priceRange ? `<div class="lot-price">Avg. price: ${priceRange}</div>` : ""}
      </button>
    `;
  }).join("");

  buildingList.querySelectorAll(".lot-button").forEach((button) => {
    button.addEventListener("click", () => selectBuilding(button.dataset.name, true, true));
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
