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

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
    .map((building) => [building.lat, building.lng]);

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

function readGeocodeCache() {
  try {
    return JSON.parse(window.localStorage.getItem(geocodeCacheKey) || "{}");
  } catch {
    return {};
  }
}

function writeGeocodeCache(cache) {
  try {
    window.localStorage.setItem(geocodeCacheKey, JSON.stringify(cache));
  } catch {
    // Ignore storage failures.
  }
}

function readCorrectionFlags() {
  try {
    return JSON.parse(window.localStorage.getItem(correctionFlagsKey) || "{}");
  } catch {
    return {};
  }
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

function correctionFlags() {
  return readCorrectionFlags();
}

function applyStoredCorrections() {
  const flags = correctionFlags();

  buildings.forEach((building) => {
    const flag = flags[building.name];
    if (!flag) {
      return;
    }

    applyCoordinatesToBuilding(building, flag.lat, flag.lng);
  });
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
      <div class="parking-card-meta">${escapeHtml(spot.typeLabel)} â€¢ ${formatDistanceMiles(spot.distanceMeters)} from ${escapeHtml(destination.name)}</div>
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
  routeSummary.textContent = `${routeModeLabel(mapState.routeMode)} route: ${formatDistanceMiles(route.distance)} â€¢ about ${formatDuration(durationMinutes)}`;
  routeSummary.classList.remove("is-hidden");

  const steps = route.legs.flatMap((leg) => leg.steps || []).filter((step) => step.distance > 0 || (step.maneuver && step.maneuver.type === "arrive"));
  routeSteps.innerHTML = steps.map((step, index) => `
    <div class="route-step">
      <p class="route-step-title">${index + 1}. ${stepInstruction(step)}</p>
      <div class="route-step-meta">${formatDistanceMiles(step.distance)} â€¢ about ${formatDuration(step.duration / 60)}</div>
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

function applyCoordinatesToBuilding(building, lat, lng) {
  building.lat = lat;
  building.lng = lng;

  const layer = mapState.layers.get(building.name);
  if (!layer) {
    return;
  }

  layer.setLatLng([lat, lng]);
}

function setBaseCoordinates(building, lat, lng) {
  building.baseLat = lat;
  building.baseLng = lng;

  if (correctionFlags()[building.name]) {
    return;
  }

  applyCoordinatesToBuilding(building, lat, lng);
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

function detailMarkup(bº)]¥±‘¥¹œ¤ì4(€½¹ÍĞÍÑå±”€ô…Ñ•½ÉåMÑå±•Ím‰Õ¥±‘¥¹œ¹…Ñ•½Éåtì4(€½¹ÍĞÑ¥¹Ğ€ô¡•áQ½I‰„¡ÍÑå±”¹½±½È°€À¸ÄÈ¤ì4(€½¹ÍĞ‰½É‘•È€ô¡•áQ½I‰„¡ÍÑå±”¹½±½È°€À¸ÌÈ¤ì4(€É•ÑÕÉ¸€4(€€€€ñ‘¥Ø±…ÍÌô‰‘•Ñ…¥°µÍ¡•±°ˆÍÑå±”ôˆ´µ…Ñ•½Éäµ½±½Èè‘íÍÑå±”¹½±½Éôì€´µ…Ñ•½ÉäµÑ¥¹Ğè‘íÑ¥¹Ñôì€´µ…Ñ•½Éäµ‰½É‘•Èè‘í‰½É‘•Éôˆø4(€€€€€€ñ Èø‘í‰Õ¥±‘¥¹œ¹¹…µ•ôğ½ Èø4(€€€€€€ñ‘¥Ø±…ÍÌô‰±½ĞµÑåÁ”ˆÍÑå±”ô‰‰…­É½Õ¹è‘íÍÑå±”¹½±½Éôˆø4(€€€€€€€€ñÍÁ…¸±…ÍÌô‰Íİ…Ñ ˆÍÑå±”ô‰‰…­É½Õ¹éÉ‰„ ÈÔÔ°ÈÔÔ°ÈÔÔ°À¸Èà¤ˆøğ½ÍÁ…¸ø4(€€€€€€€€‘í‰Õ¥±‘¥¹œ¹ÑåÁ•1…‰•±ô4(€€€€€€ğ½‘¥Øø4(€€€€€€ñÀ±…ÍÌô‰±½Ğµµ•Ñ„ˆø‘í‰Õ¥±‘¥¹œ¹¹½Ñ•ôğ½Àø4(€€€€€€ñ‘¥Ø±…ÍÌô‰‘•Ñ…¥°µÉ¥ˆø4(€€€€€€€€ñ‘¥Ø±…ÍÌô‰‘•Ñ…¥°µÉ½Üˆø4(€€€€€€€€€€ñÍÑÉ½¹œù‘‘É•ÍÌğ½ÍÑÉ½¹œø4(€€€€€€€€€€ñÍÁ…¸ø‘í‰Õ¥±‘¥¹œ¹…‘‘É•ÍÍôğ½ÍÁ…¸ø4(€€€€€€€€ğ½‘¥Øø4(€€€€€€€€ñ‘¥Ø±…ÍÌô‰‘•Ñ…¥°µÉ½Üˆø4(€€€€€€€€€€ñÍÑÉ½¹œù…Ñ•½Éäğ½ÍÑÉ½¹œø4(€€€€€€€€€€ñÍÁ…¸ø‘íÍÑå±”¹±…‰•±ôğ½ÍÁ…¸ø4(€€€€€€€€ğ½‘¥Øø4(€€€€€€ğ½‘¥Øø4(€€€€ğ½‘¥Øø4(€€ì4)ô4(4)™Õ¹Ñ¥½¸É•…Ñ•5…À ¤ì4(€¥˜€ …İ¥¹‘½Ü¹0¤ì4(€€€É•ÑÕÉ¸ì4(€ô4(4(€…ÁÁ±åMÑ½É•‘½ÉÉ•Ñ¥½¹Ì ¤ì4(4(€½¹ÍĞ…µÁÕÍ•¹Ñ•È€ôlÌà¸äÈÄÄ°€´ÜÜ¸ÀÄàÅtì4(€½¹ÍĞµ…À€ô0¹µ…À ‰µ…Àˆ°ì4(€€€é½½µ½¹ÑÉ½°è™…±Í”°4(€€€ÍÉ½±±]¡••±i½½´èÑÉÕ”°4(€€€µ¥¹i½½´è€ÄÈ°4(€€€µ…ái½½´è€ÈÄ4(€ô¤ì4(€µ…À¹Í•ÑY¥•Ü¡…µÁÕÍ•¹Ñ•È°€ÄØ¤ì4(€0¹½¹ÑÉ½°¹é½½´¡ìÁ½Í¥Ñ¥½¸è€‰Ñ½ÁÉ¥¡Ğˆô¤¹…‘‘Q¼¡µ…À¤ì4(4(€½¹ÍĞÍÑÉ••Ñ1…å•È€ô0¹Ñ¥±•1…å•È ‰¡ÑÑÁÌè¼½íÍô¹‰…Í•µ…ÁÌ¹…ÉÑ½‘¸¹½´½±¥¡Ñ}…±°½íéô½íáô½íåõíÉô¹Á¹œˆ°ì4(€€€ÍÕ‰‘½µ…¥¹Ìè€‰…‰ˆ°4(€€€µ…ái½½´è€ÈÀ°4(€€€…ÑÑÉ¥‰ÕÑ¥½¸è€ˆ™½Áäì=Á•¹MÑÉ••Ñ5…À½¹ÑÉ¥‰ÕÑ½ÉÌ€™½ÁäìIQ<ˆ4(€ô¤ì4(4(€½¹ÍĞ¥µ…•Éå1…å•È€ô0¹Ñ¥±•1…å•È ‰¡ÑÑÁÌè¼½Í•ÉÙ•È¹…É¥Í½¹±¥¹”¹½´½É%L½É•ÍĞ½Í•ÉÙ¥•Ì½]½É±‘}%µ…•Éä½5…ÁM•ÉÙ•È½Ñ¥±”½íéô½íåô½íáôˆ°ì4(€€€µ…ái½½´è€ÈÄ°4(€€€…ÑÑÉ¥‰ÕÑ¥½¸è€‰M½ÕÉ•ÌèÍÉ¤°5…á…È°…ÉÑ¡ÍÑ…È•½É…Á¡¥Ì°…¹Ñ¡”%LUÍ•È½µµÕ¹¥Ñäˆ4(€ô¤ì4(4(€ÍÑÉ••Ñ1…å•È¹…‘‘Q¼¡µ…À¤ì4(€µ…ÁMÑ…Ñ”¹µ…À€ôµ…Àì4(€µ…ÁMÑ…Ñ”¹‰…Í•1…å•ÉÌ€ôì4(€€€ÍÑÉ••ĞèÍÑÉ••Ñ1…å•È°4(€€€¥µ…•Éäè¥µ…•Éå1…å•È4(€ôì4(4(€‰Õ¥±‘¥¹Ì¹™½É…  ¡‰Õ¥±‘¥¹œ¤€ôøì4(€€€½¹ÍĞÍÑå±”€ô…Ñ•½ÉåMÑå±•Ím‰Õ¥±‘¥¹œ¹…Ñ•½Éåtì4(€€€½¹ÍĞ±…å•È€ô0¹¥É±•5…É­•È¡m‰Õ¥±‘¥¹œ¹±…Ğ°‰Õ¥±‘¥¹œ¹±¹t°ì4(€€€€€É…‘¥ÕÌè€ä°4(€€€€€½±½Èè€ˆ™™™™™˜ˆ°4(€€€€€İ•¥¡Ğè€È°4(€€€€€™¥±±½±½ÈèÍÑå±”¹½±½È°4(€€€€€™¥±±=Á…¥Ñäè€À¸äÈ4(€€€ô¤¹…‘‘Q¼¡µ…À¤ì4(4(€€€±…å•È¹‰¥¹‘Q½½±Ñ¥À¡‰Õ¥±‘¥¹œ¹Í¡½ÉÑ1…‰•°°ì4(€€€€€Á•Éµ…¹•¹ĞèÑÉÕ”°4(€€€€€‘¥É•Ñ¥½¸è€‰Ñ½Àˆ°4(€€€€€½™™Í•ĞèlÀ°€´Ñt°4(€€€€€±…ÍÍ9…µ”è€‰±½Ğµ±…‰•°ˆ4(€€€ô¤ì4(€€€±…å•È¹‰¥¹‘A½ÁÕÀ¡Á½ÁÕÁ5…É­ÕÀ¡‰Õ¥±‘¥¹œ¤¤ì4(€€€±…å•È¹½¸ ‰±¥¬ˆ°€ ¤€ôøÍ•±•Ñ	Õ¥±‘¥¹œ¡‰Õ¥±‘¥¹œ¹¹…µ”°ÑÉÕ”¤¤ì4(€€€µ…ÁMÑ…Ñ”¹±…å•ÉÌ¹Í•Ğ¡‰Õ¥±‘¥¹œ¹¹…µ”°±…å•È¤ì4(€ô¤ì4(4(€İ¥¹‘½Ü¹Í•ÑQ¥µ•½ÕĞ  ¤€ôøì4(€€€µ…À¹¥¹Ù…±¥‘…Ñ•M¥é” ¤ì4(€€€™¥ÑY¥•Ü¡µ…ÁMÑ…Ñ”¹ÕÉÉ•¹ÑY¥•Ü¤ì4(€ô°€À¤ì)ô4(4)™Õ¹Ñ¥½¸µ…Ñ¡•ÍÕÉÉ•¹ÑY¥•Ü¡‰Õ¥±‘¥¹œ¤ì4(€½¹ÍĞÍ•…É¡Q•áĞ€ô€‘í‰Õ¥±‘¥¹œ¹¹…µ•ô€‘ì¡‰Õ¥±‘¥¹œ¹…±¥…Í•Ìñğmt¤¹©½¥¸ ˆ€ˆ¥ô€‘í‰Õ¥±‘¥¹œ¹…‘‘É•ÍÍõ€¹Ñ½1½İ•É…Í” ¤ì4(€É•ÑÕÉ¸µ…Ñ¡•Í¥É•Ñ½ÉåM½Á”¡‰Õ¥±‘¥¹œ¤€˜˜Í•…É¡Q•áĞ¹¥¹±Õ‘•Ì¡±¥ÍÑEÕ•Éä¤ì4)ô4(4)™Õ¹Ñ¥½¸™¥±Ñ•É•‘	Õ¥±‘¥¹Ì ¤ì4(€É•ÑÕÉ¸‰Õ¥±‘¥¹Ì¹™¥±Ñ•È¡µ…Ñ¡•ÍÕÉÉ•¹ÑY¥•Ü¤¹Í½ÉĞ ¡„°ˆ¤€ôø„¹¹…µ”¹±½…±•½µÁ…É”¡ˆ¹¹…µ”¤¤ì4)ô4(4)™Õ¹Ñ¥½¸É•¹‘•É•Ñ…¥±Ì ¤ì4(€½¹ÍĞ‰Õ¥±‘¥¹œ€ô‰Õ¥±‘¥¹Ì¹™¥¹ ¡¥Ñ•´¤€ôø¥Ñ•´¹¹…µ”€ôôôÍ•±•Ñ•‘	Õ¥±‘¥¹9…µ”¤ì4(€¥˜€ …‰Õ¥±‘¥¹œ¤ì4(€€€‰Õ¥±‘¥¹•Ñ…¥±Ì¹¥¹¹•É!Q50€ô€4(€€€€€€ñ ÈùA¥¬„±…¹‘µ…É¬ğ½ Èø4(€€€€€€ñÀù¡½½Í”„…µÁÕÌ½ÈÉ•¥½¹…°±…¹‘µ…É¬½¸Ñ¡”µ…À½È™É½´Ñ¡”±¥ÍĞ‰•±½ÜÑ¼Ù¥•Ü¥ÑÌ…‘‘É•ÍÌ°…Ñ•½Éä°…¹¹½Ñ•Ì¸ğ½Àø4(€€€€ì4(€€€É•ÑÕÉ¸ì4(€ô4(4(€‰Õ¥±‘¥¹•Ñ…¥±Ì¹¥¹¹•É!Q50€ô‘•Ñ…¥±5…É­ÕÀ¡‰Õ¥±‘¥¹œ¤ì4)ô4(4)™Õ¹Ñ¥½¸É•¹‘•É1¥ÍĞ ¤ì4(€½¹ÍĞÙ¥Í¥‰±”€ô™¥±Ñ•É•‘	Õ¥±‘¥¹Ì ¤ì4(4(€¥˜€ …Ù¥Í¥‰±”¹±•¹Ñ ¤ì4(€€€‰Õ¥±‘¥¹1¥ÍĞ¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰•µÁÑäµÍÑ…Ñ”ˆù9¼±…¹‘µ…É­Ìµ…Ñ Ñ¡…Ğ™¥±Ñ•È¸ğ½‘¥Øù€ì4(€€€É•ÑÕÉ¸ì4(€ô4(4(€‰Õ¥±‘¥¹1¥ÍĞ¹¥¹¹•É!Q50€ôÙ¥Í¥‰±”¹µ…À ¡‰Õ¥±‘¥¹œ¤€ôøì4(€€€½¹ÍĞÍÑå±”€ô…Ñ•½ÉåMÑå±•Ím‰Õ¥±‘¥¹œ¹…Ñ•½Éåtì4(€€€½¹ÍĞÍ•±•Ñ•€ô‰Õ¥±‘¥¹œ¹¹…µ”€ôôôÍ•±•Ñ•‘	Õ¥±‘¥¹9…µ”€ü€‰¥ÌµÍ•±•Ñ•ˆ€è€ˆˆì4(€€€½¹ÍĞÑ¥¹Ğ€ô¡•áQ½I‰„¡ÍÑå±”¹½±½È°€À¸ÄÈ¤ì4(€€€½¹ÍĞ‰½É‘•È€ô¡•áQ½I‰„¡ÍÑå±”¹½±½È°€À¸Ì¤ì4(€€€½¹ÍĞÁÉ¥•I…¹”€ô…Ù•É…•AÉ¥•I…¹”¡‰Õ¥±‘¥¹œ¤ì4(€€€É•ÑÕÉ¸€4(€€€€€€ñ‰ÕÑÑ½¸4(€€€€€€€±…ÍÌô‰±½Ğµ‰ÕÑÑ½¸€‘íÍ•±•Ñ•‘ôˆ4(€€€€€€€‘…Ñ„µ¹…µ”ôˆ‘í‰Õ¥±‘¥¹œ¹¹…µ•ôˆ4(€€€€€€€ÍÑå±”ôˆ´µ…Ñ•½Éäµ½±½Èè‘íÍÑå±”¹½±½Éôì€´µ…Ñ•½ÉäµÑ¥¹Ğè‘íÑ¥¹Ñôì€´µ…Ñ•½Éäµ‰½É‘•Èè‘í‰½É‘•Éôˆ4(€€€€€€ø4(€€€€€€€€ñ‘¥Ø±…ÍÌô‰±½ĞµÑ½Á±¥¹”ˆø4(€€€€€€€€€€ñÍÁ…¸±…ÍÌô‰±½Ğµ¹…µ”ˆø‘í‰Õ¥±‘¥¹œ¹¹…µ•ôğ½ÍÁ…¸ø4(€€€€€€€€€€ñÍÁ…¸±…ÍÌô‰±½Ğµ‰…‘”ˆø4(€€€€€€€€€€€€ñÍÁ…¸±…ÍÌô‰‘½ĞˆÍÑå±”ô‰‰…­É½Õ¹è‘íÍÑå±”¹½±½Éôˆøğ½ÍÁ…¸ø4(€€€€€€€€€€€€‘íÍÑå±”¹±…‰•±ô4(€€€€€€€€€€ğ½ÍÁ…¸ø4(€€€€€€€€ğ½‘¥Øø4(€€€€€€€€ñ‘¥Ø±…ÍÌô‰±½Ğµµ•Ñ„ˆøñÍÑÉ½¹œ±…ÍÌô‰±½Ğµ¥¹±¥¹”µ±…‰•°ˆø‘í‰Õ¥±‘¥¹œ¹Í¡½ÉÑ1…‰•±ôğ½ÍÑÉ½¹œøğ€‘í‰Õ¥±‘¥¹œ¹ÑåÁ•1…‰•±ôğ½‘¥Øø4(€€€€€€€€ñ‘¥Ø±…ÍÌô‰±½Ğµ…‘‘É•ÍÌˆø‘í‰Õ¥±‘¥¹œ¹…‘‘É•ÍÍôğ½‘¥Øø4(€€€€€€€€‘íÁÉ¥•I…¹”€ü€ñ‘¥Ø±…ÍÌô‰±½ĞµÁÉ¥”ˆùÙœ¸ÁÉ¥”è€‘íÁÉ¥•I…¹•ôğ½‘¥Øù€€è€ˆ‰ô4(€€€€€€ğ½‰ÕÑÑ½¸ø4(€€€€ì4(€ô¤¹©½¥¸ ˆˆ¤ì4(4(€‰Õ¥±‘¥¹1¥ÍĞ¹ÅÕ•ÉåM•±•Ñ½É±° ˆ¹±½Ğµ‰ÕÑÑ½¸ˆ¤¹™½É…  ¡‰ÕÑÑ½¸¤€ôøì4(€€€‰ÕÑÑ½¸¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ°€ ¤€ôøÍ•±•Ñ	Õ¥±‘¥¹œ¡‰ÕÑÑ½¸¹‘…Ñ…Í•Ğ¹¹…µ”°ÑÉÕ”¤¤ì4(€ô¤ì4)ô4(4)™Õ¹Ñ¥½¸Íå¹5…ÁMÑ…Ñ” ¤ì4(€¥˜€ …µ…ÁMÑ…Ñ”¹µ…À¤ì4(€€€É•ÑÕÉ¸ì4(€ô4(4(€‰Õ¥±‘¥¹Ì¹™½É…  ¡‰Õ¥±‘¥¹œ¤€ôøì4(€€€½¹ÍĞ±…å•È€ôµ…ÁMÑ…Ñ”¹±…å•ÉÌ¹•Ğ¡‰Õ¥±‘¥¹œ¹¹…µ”¤ì4(€€€¥˜€ …±…å•È¤ì4(€€€€€É•ÑÕÉ¸ì4(€€€ô4(4(€€€½¹ÍĞÙ¥Í¥‰±”€ôµ…Ñ¡•ÍÕÉÉ•¹ÑY¥•Ü¡‰Õ¥±‘¥¹œ¤ì4(€€€½¹ÍĞÍ•±•Ñ•€ô‰Õ¥±‘¥¹œ¹¹…µ”€ôôôÍ•±•Ñ•‘	Õ¥±‘¥¹9…µ”ì4(€€€½¹ÍĞÍÑå±”€ô…Ñ•½ÉåMÑå±•Ím‰Õ¥±‘¥¹œ¹…Ñ•½Éåtì4(4(€€€±…å•È¹Í•ÑMÑå±”¡ì4(€€€€€™¥±±½±½ÈèÍÑå±”¹½±½È°4(€€€€€™¥±±=Á…¥ÑäèÙ¥Í¥‰±”€ü€¡Í•±•Ñ•€ü€À¸äØ€è€À¸àÈ¤€è€À°4(€€€€€½±½ÈèÍ•±•Ñ•€ü€ˆŒÄÀÈÌÅ”ˆ€è€ˆ™™™™™˜ˆ°4(€€€€€İ•¥¡ĞèÍ•±•Ñ•€ü€Ì€è€È°4(€€€€€½Á…¥ÑäèÙ¥Í¥‰±”€ü€Ä€è€À4(€€€ô¤ì4(€€€±…å•È¹Í•ÑI…‘¥ÕÌ¡Ù¥Í¥‰±”€ü€¡Í•±•Ñ•€ü€ÄÄ€è€à¤€è€À¤ì4(4(€€€½¹ÍĞÑ½½±Ñ¥Á±•µ•¹Ğ€ô±…å•È¹•ÑQ½½±Ñ¥À ¤ü¹•Ñ±•µ•¹Ğü¸ ¤ì4(€€€¥˜€¡Ñ½½±Ñ¥Á±•µ•¹Ğ¤ì4(€€€€€Ñ½½±Ñ¥Á±•µ•¹Ğ¹ÍÑå±”¹‘¥ÍÁ±…ä€ôÙ¥Í¥‰±”€ü€ˆˆ€è€‰¹½¹”ˆì4(€€€ô4(€ô¤ì4)ô4(4)™Õ¹Ñ¥½¸™½ÕÍ	Õ¥±‘¥¹=¹5…À¡‰Õ¥±‘¥¹œ¤ì4(€¥˜€ …µ…ÁMÑ…Ñ”¹µ…À¤ì4(€€€É•ÑÕÉ¸ì4(€ô4(4(€½¹ÍĞ±…å•È€ôµ…ÁMÑ…Ñ”¹±…å•ÉÌ¹•Ğ¡‰Õ¥±‘¥¹œ¹¹…µ”¤ì4(€¥˜€ …±…å•È¤ì4(€€€É•ÑÕÉ¸ì4(€ô4(4(€µ…ÁMÑ…Ñ”¹µ…À¹™±åQ¼¡m‰Õ¥±‘¥¹œ¹±…Ğ°‰Õ¥±‘¥¹œ¹±¹t°5…Ñ ¹µ…à¡µ…ÁMÑ…Ñ”¹µ…À¹•Ñi½½´ ¤°€Äà¤°ì4(€€€‘ÕÉ…Ñ¥½¸è€À¸Ü4(€ô¤ì4(€±…å•È¹½Á•¹A½ÁÕÀ ¤ì4)ô4(4