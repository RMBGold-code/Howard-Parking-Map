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
const voiceGuidanceButton = document.getElementById("voiceGuidanceButton");
const clearSelectionButton = document.getElementById("clearSelectionButton");
const navigationActiveBanner = document.getElementById("navigationActiveBanner");
const appMapNavigationBanner = document.getElementById("appMapNavigationBanner");
const mapTurnBanner = document.getElementById("mapTurnBanner");
const navigationStatus = document.getElementById("navigationStatus");
const navigationLink = document.getElementById("navigationLink");
const routeSummary = document.getElementById("routeSummary");
const routeSteps = document.getElementById("routeSteps");
const mapUseLocationButton = document.getElementById("mapUseLocationButton");
const mapNavigateButton = document.getElementById("mapNavigateButton");
const mapVoiceGuidanceButton = document.getElementById("mapVoiceGuidanceButton");
const mapRecenterButton = document.getElementById("mapRecenterButton");
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
  navigationLineHalo: null,
  navigationLineCore: null,
  navigationActive: false,
  navigationFallbackMessage: "",
  routeMode: "driving",
  routeData: null,
  routeKey: "",
  routeRequestKeyPending: "",
  lastRouteRequestAt: 0,
  navigationFollowMode: false,
  followViewportSuspended: false,
  geolocationWatchId: null,
  lastRouteRefreshAt: 0,
  lastRouteRefreshPoint: null,
  programmaticMapMoveCount: 0,
  lastUserMarkerTapAt: 0,
  voiceGuidanceEnabled: false,
  lastSpokenInstructionKey: "",
  activeGuidanceStepIndex: -1,
  lastGuidanceAdvanceAt: 0,
  arrivalParkingPromptKey: "",
  parkingPromptInFlight: false,
  arrivedDestinationKey: ""
};

const DRIVING_ROUTE_SERVICES = [
  {
    name: "routing.openstreetmap.de",
    routeBase: "https://routing.openstreetmap.de/routed-car/route/v1/driving"
  },
  {
    name: "router.project-osrm.org",
    routeBase: "https://router.project-osrm.org/route/v1/driving"
  }
];

const ROUTE_REQUEST_SPACING_MS = 100;
const ROUTE_REQUEST_TIMEOUT_MS = 3200;
const FOLLOW_NAVIGATION_ZOOM = 19;
const FOLLOW_ROUTE_REFRESH_MS = 2600;
const FOLLOW_ROUTE_REFRESH_MILES = 0.012;
const DOUBLE_TAP_WINDOW_MS = 360;
const ARRIVAL_PROMPT_THRESHOLD_MILES = 0.05;
const OFF_ROUTE_REROUTE_THRESHOLD_MILES = 0.02;
const OFF_ROUTE_REROUTE_MIN_MS = 1200;
const MAP_FOLLOW_ANIMATION_SECONDS = 0.35;
const MAP_CONTEXT_FLY_SECONDS = 0.45;
const CAMPUS_VIEW_CATEGORIES = new Set([
  "health-sciences",
  "library-admin",
  "academic",
  "student-life",
  "arts",
  "athletics"
]);
const HEALTH_SCIENCES_VIEW_CATEGORIES = new Set([
  "health-sciences",
  "library-admin"
]);
const HOT_CATEGORIES = new Set(["restaurant", "brunch", "winery", "event-venue"]);
const HOT_PLACE_NAMES = new Set([
  "Ben's Chili Bowl",
  "Busboys and Poets 14th & V",
  "Le Diplomate",
  "Maydan",
  "Founding Farmers DC",
  "Rasika Penn Quarter",
  "Zaytinya",
  "District Winery",
  "Howard Theatre",
  "9:30 Club",
  "Lincoln Theatre",
  "The Anthem",
  "Nationals Park",
  "MGM National Harbor"
]);

let activeFilter = "all";
let selectedBuildingName = "";
let listQuery = "";
let destinationSuggestions = [];
let activeDestinationSuggestionIndex = -1;
let directorySuggestions = [];
let activeDirectorySuggestionIndex = -1;
let deferredInstallPrompt = null;
let serviceWorkerRegistration = null;

mapState.voiceGuidanceEnabled = loadVoiceGuidancePreference();

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

function projectPointToMiles(origin, point) {
  const averageLat = toRadians((origin.lat + point.lat) / 2);
  const milesPerLatDegree = 69.0;
  const milesPerLngDegree = 69.172 * Math.cos(averageLat);
  return {
    x: (point.lng - origin.lng) * milesPerLngDegree,
    y: (point.lat - origin.lat) * milesPerLatDegree
  };
}

function pointToSegmentDistanceMiles(point, segmentStart, segmentEnd) {
  const a = projectPointToMiles(point, segmentStart);
  const b = projectPointToMiles(point, segmentEnd);
  const p = { x: 0, y: 0 };

  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abLengthSquared = (abx * abx) + (aby * aby);

  if (!abLengthSquared) {
    return Math.hypot(a.x - p.x, a.y - p.y);
  }

  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const t = Math.max(0, Math.min(1, ((apx * abx) + (apy * aby)) / abLengthSquared));
  const closestX = a.x + (abx * t);
  const closestY = a.y + (aby * t);
  return Math.hypot(closestX - p.x, closestY - p.y);
}

function distanceFromPointToRouteMiles(point, route) {
  const coordinates = route?.geometry?.coordinates;
  if (!point || !Array.isArray(coordinates) || coordinates.length < 2) {
    return Number.POSITIVE_INFINITY;
  }

  let minDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = normalizePoint(coordinates[index]?.[1], coordinates[index]?.[0]);
    const end = normalizePoint(coordinates[index + 1]?.[1], coordinates[index + 1]?.[0]);
    if (!start || !end) {
      continue;
    }
    minDistance = Math.min(minDistance, pointToSegmentDistanceMiles(point, start, end));
  }

  return minDistance;
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
  return "https://howarddclandmarks.netlify.app/";
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

function currentGuidanceStep(route = mapState.routeData) {
  const steps = routeLegSteps(route);
  if (!steps.length) {
    return null;
  }

  const index = Math.max(0, Math.min(mapState.activeGuidanceStepIndex, steps.length - 1));
  return {
    step: steps[index],
    index,
    total: steps.length
  };
}

function turnArrowGlyph(step) {
  const type = step?.maneuver?.type || "continue";
  const modifier = step?.maneuver?.modifier || "";

  if (type === "arrive") {
    return "◎";
  }

  if (type === "roundabout") {
    return "↺";
  }

  if (modifier === "uturn" || modifier === "sharp left") {
    return "↰";
  }

  if (modifier === "slight left") {
    return "↖";
  }

  if (modifier === "left") {
    return "←";
  }

  if (modifier === "uturn right" || modifier === "sharp right") {
    return "↱";
  }

  if (modifier === "slight right") {
    return "↗";
  }

  if (modifier === "right") {
    return "→";
  }

  return "↑";
}

function turnBannerStreet(step, destination) {
  const street = [step?.name, step?.ref]
    .find((value) => typeof value === "string" && value.trim());

  if (street) {
    return street.trim();
  }

  if (step?.maneuver?.type === "arrive") {
    return destination?.name || "Destination";
  }

  return "Current route";
}

function syncMapTurnBanner(destination = selectedNavigationTarget(), origin = mapState.currentLocation) {
  if (!mapTurnBanner) {
    return;
  }

  const active = Boolean(mapState.navigationActive && origin && destination && mapState.routeData);
  if (!active) {
    mapTurnBanner.innerHTML = "";
    mapTurnBanner.classList.add("is-hidden");
    return;
  }

  const guidance = currentGuidanceStep(mapState.routeData);
  if (!guidance?.step) {
    mapTurnBanner.innerHTML = "";
    mapTurnBanner.classList.add("is-hidden");
    return;
  }

  const { step, index, total } = guidance;
  const instruction = stepInstruction(step);
  const street = turnBannerStreet(step, destination);
  const distanceText = step.maneuver?.type === "arrive"
    ? "Destination ahead"
    : `In ${formatDistanceMiles(step.distance)}`;

  mapTurnBanner.innerHTML = `
    <span class="map-turn-icon" aria-hidden="true">${turnArrowGlyph(step)}</span>
    <div class="map-turn-copy">
      <p class="map-turn-label">Next turn ${index + 1} of ${total}</p>
      <p class="map-turn-road">${escapeHtml(street)}</p>
      <p class="map-turn-instruction">${escapeHtml(instruction)}</p>
      <p class="map-turn-meta">${escapeHtml(distanceText)}</p>
    </div>
  `;
  mapTurnBanner.classList.remove("is-hidden");
}

function syncNavigationActivityUI(destination = selectedNavigationTarget(), origin = mapState.currentLocation) {
  const active = Boolean(mapState.navigationActive && origin && destination);

  if (stopNavigationButton) {
    stopNavigationButton.disabled = !active;
  }

  [navigationActiveBanner, appMapNavigationBanner].forEach((banner) => {
    if (!banner) {
      return;
    }

    if (!active) {
      banner.textContent = "";
      banner.classList.add("is-hidden");
      return;
    }

    const bannerMarkup = `
      <strong class="nav-active-title">${routeModeLabel(mapState.routeMode)} navigation active</strong>
      <span class="nav-active-copy">${mapState.navigationFollowMode ? "Follow mode is tracking your movement to" : "Following directions to"} ${escapeHtml(destination.name)}.</span>
    `;

    banner.innerHTML = bannerMarkup;
    banner.classList.remove("is-hidden");
  });

  syncMapTurnBanner(destination, origin);
}

function syncRecenterButton() {
  if (!mapRecenterButton) {
    return;
  }

  const showButton = Boolean(
    mapState.navigationActive
    && mapState.navigationFollowMode
    && mapState.followViewportSuspended
  );
  mapRecenterButton.classList.toggle("is-hidden", !showButton);
}

function canUseVoiceGuidance() {
  return typeof window !== "undefined"
    && "speechSynthesis" in window
    && typeof SpeechSynthesisUtterance !== "undefined";
}

function loadVoiceGuidancePreference() {
  try {
    return window.localStorage.getItem("howard-voice-guidance") === "on";
  } catch (error) {
    return false;
  }
}

function persistVoiceGuidancePreference() {
  try {
    window.localStorage.setItem("howard-voice-guidance", mapState.voiceGuidanceEnabled ? "on" : "off");
  } catch (error) {
    // Ignore storage errors in private or restricted browsing contexts.
  }
}

function stopVoiceGuidancePlayback() {
  if (!canUseVoiceGuidance()) {
    return;
  }

  window.speechSynthesis.cancel();
}

function speakImmediateMessage(message) {
  if (!mapState.voiceGuidanceEnabled || !canUseVoiceGuidance() || !message) {
    return;
  }

  stopVoiceGuidancePlayback();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

function syncVoiceGuidanceButton() {
  if (!voiceGuidanceButton) {
    // Continue to sync app map button state below.
  }

  const supported = canUseVoiceGuidance();
  if (voiceGuidanceButton) {
    voiceGuidanceButton.disabled = !supported;
    voiceGuidanceButton.textContent = mapState.voiceGuidanceEnabled ? "Voice guidance on" : "Voice guidance off";
    voiceGuidanceButton.classList.toggle("is-active", mapState.voiceGuidanceEnabled);
    voiceGuidanceButton.title = supported
      ? "Toggle spoken navigation instructions"
      : "Voice guidance is unavailable in this browser";
  }

  if (mapVoiceGuidanceButton) {
    mapVoiceGuidanceButton.disabled = !supported;
    mapVoiceGuidanceButton.classList.toggle("is-active", mapState.voiceGuidanceEnabled);
    mapVoiceGuidanceButton.title = supported
      ? (mapState.voiceGuidanceEnabled ? "Voice guidance on" : "Voice guidance off")
      : "Voice guidance is unavailable in this browser";
  }
}

function routeLegSteps(route) {
  return route.legs
    .flatMap((leg) => leg.steps || [])
    .filter((step) => step.distance > 0 || (step.maneuver && step.maneuver.type === "arrive"));
}

function routeStepLocation(step) {
  const location = step?.maneuver?.location;
  if (!Array.isArray(location) || location.length < 2) {
    return null;
  }

  return normalizePoint(location[1], location[0]);
}

function guidanceAdvanceThresholdMiles(step) {
  const stepMiles = (step?.distance || 0) / 1609.344;
  return Math.max(0.03, Math.min(0.09, (stepMiles * 0.25) + 0.02));
}

function speakNavigationGuidance(route, destination, options = {}) {
  if (!mapState.voiceGuidanceEnabled || !canUseVoiceGuidance() || !route) {
    return;
  }

  const steps = routeLegSteps(route);
  if (!steps.length) {
    return;
  }

  const targetStepIndex = Math.max(0, Math.min(options.stepIndex ?? 0, steps.length - 1));
  const nextStep = steps[targetStepIndex];
  const nextInstruction = stepInstruction(nextStep);
  const instructionKey = `${destination?.name || ""}|${targetStepIndex}|${nextInstruction}|${Math.round(nextStep.distance)}`;
  if (!options.force && mapState.lastSpokenInstructionKey === instructionKey) {
    return;
  }

  mapState.activeGuidanceStepIndex = targetStepIndex;
  mapState.lastSpokenInstructionKey = instructionKey;
  mapState.lastGuidanceAdvanceAt = Date.now();
  stopVoiceGuidancePlayback();

  const parts = [];
  if (nextStep.maneuver?.type === "arrive") {
    parts.push("You have arrived at your destination.");
  } else {
    parts.push(`${nextInstruction}. Continue for ${formatDistanceMiles(nextStep.distance)}.`);
  }

  const utterance = new SpeechSynthesisUtterance(parts.join(" "));
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

function maybeAdvanceVoiceGuidance(currentLocation) {
  if (!mapState.voiceGuidanceEnabled || !mapState.navigationActive || !mapState.routeData || !currentLocation) {
    return;
  }

  const destination = selectedNavigationTarget();
  if (!destination) {
    return;
  }

  const steps = routeLegSteps(mapState.routeData);
  if (!steps.length) {
    return;
  }

  const currentIndex = Math.max(0, mapState.activeGuidanceStepIndex);
  if (currentIndex >= steps.length - 1) {
    return;
  }

  if ((Date.now() - mapState.lastGuidanceAdvanceAt) < 5000) {
    return;
  }

  const currentStep = steps[currentIndex];
  const currentStepPoint = routeStepLocation(currentStep);
  if (!currentStepPoint) {
    return;
  }

  const distanceToCurrentStep = distanceMiles(currentLocation, currentStepPoint);
  const thresholdMiles = guidanceAdvanceThresholdMiles(currentStep);
  if (distanceToCurrentStep > thresholdMiles) {
    return;
  }

  speakNavigationGuidance(mapState.routeData, destination, {
    force: true,
    includeSummary: false,
    stepIndex: currentIndex + 1
  });
}

function toggleVoiceGuidance() {
  if (!canUseVoiceGuidance()) {
    navigationStatus.textContent = "Voice guidance is not available in this browser.";
    syncVoiceGuidanceButton();
    return;
  }

  mapState.voiceGuidanceEnabled = !mapState.voiceGuidanceEnabled;
  if (!mapState.voiceGuidanceEnabled) {
    mapState.lastSpokenInstructionKey = "";
    mapState.activeGuidanceStepIndex = -1;
    mapState.lastGuidanceAdvanceAt = 0;
    stopVoiceGuidancePlayback();
  }

  persistVoiceGuidancePreference();
  syncVoiceGuidanceButton();

  if (mapState.voiceGuidanceEnabled) {
    navigationStatus.textContent = "Voice guidance is on. Spoken navigation updates will play when routes are ready.";
    const destination = selectedNavigationTarget();
    if (destination && mapState.routeData) {
      speakNavigationGuidance(mapState.routeData, destination, { force: true });
    } else {
      speakImmediateMessage("Voice guidance is now on.");
    }
  } else {
    navigationStatus.textContent = "Voice guidance is off.";
  }
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
  mapState.activeGuidanceStepIndex = -1;
  mapState.lastGuidanceAdvanceAt = 0;
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

function navigationDestinationKey(destination = selectedNavigationTarget()) {
  if (!destination) {
    return "";
  }

  const roundedLat = Number(destination.lat).toFixed(5);
  const roundedLng = Number(destination.lng).toFixed(5);
  return mapState.selectedParkingId
    ? `parking:${mapState.selectedParkingId}|${roundedLat}|${roundedLng}`
    : `destination:${destination.name}|${roundedLat}|${roundedLng}`;
}

function resetArrivalState() {
  mapState.arrivedDestinationKey = "";
}

function announceArrival(destination, options = {}) {
  const { messageSuffix = "", speak = true } = options;
  if (!destination) {
    return false;
  }

  const destinationKey = navigationDestinationKey(destination);
  if (!destinationKey) {
    return false;
  }

  mapState.arrivedDestinationKey = destinationKey;
  const message = `You have arrived at ${destination.name}.${messageSuffix}`;
  navigationStatus.textContent = message.trim();
  if (speak) {
    speakImmediateMessage(`You have arrived at ${destination.name}.`);
  }
  return true;
}

function resetArrivalParkingPrompt() {
  mapState.arrivalParkingPromptKey = "";
  mapState.parkingPromptInFlight = false;
}

function activeArrivalLandmarkTarget() {
  return mapState.selectedParkingId ? null : selectedBuilding();
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
      radius: selected ? 11 : 9,
      color: "#10231e",
      weight: selected ? 3.5 : 2.5,
      fillColor: "#c08a10",
      fillOpacity: selected ? 1 : 0.98
    });
  });
}

function selectParkingSpot(id, moveMap = false, snapToMap = false) {
  mapState.selectedParkingId = id;
  resetArrivalState();
  resetArrivalParkingPrompt();
  disableNavigationFollowMode();
  mapState.navigationActive = false;
  mapState.navigationFallbackMessage = "";
  mapState.lastSpokenInstructionKey = "";
  stopVoiceGuidancePlayback();
  clearRouteDetails();
  syncParkingSelection();
  updateNavigationUI();
  syncClearSelectionButton();

  const spot = selectedParking();
  if (moveMap && spot && mapState.map) {
    mapState.map.flyTo([spot.lat, spot.lng], Math.max(mapState.map.getZoom(), 18), {
      duration: MAP_CONTEXT_FLY_SECONDS
    });
    const entry = mapState.parkingMarkers.find((markerEntry) => markerEntry.id === id);
    entry?.marker.openPopup();
  }

  if (mapState.currentLocation && spot) {
    clearRouteDetails();
    previewOptimalRoute({
      fitBounds: true
    });
  }

  if (snapToMap) {
    snapViewportToMap();
  }
}

async function navigateToParkingSpot(id, moveMap = false, snapToMap = false) {
  selectParkingSpot(id, moveMap, snapToMap);
  const spot = selectedParking();
  if (!spot) {
    return;
  }

  if (!mapState.currentLocation) {
    navigationStatus.textContent = `Parking selected: ${spot.name}. Use your location or set a starting location to begin navigation.`;
    updateNavigationUI();
    return;
  }

  navigationStatus.textContent = `Building a driving route to parking at ${spot.name}...`;
  await fetchTurnByTurnRoute();
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
    button.addEventListener("click", () => {
      navigateToParkingSpot(button.dataset.parkingId, true, true);
    });
  });

  syncParkingSelection();
}

function fitDestinationAndParkingPoints(destination, parkingSpots) {
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
    mapState.map.flyTo(points[0], Math.max(mapState.map.getZoom(), 16), { duration: MAP_CONTEXT_FLY_SECONDS });
    return;
  }

  mapState.map.fitBounds(points, { padding: [30, 30] });
}

function showParkingMarkers(destination, parkingSpots) {
  clearParkingResults();

  if (!mapState.map || !parkingSpots.length) {
    return;
  }

  mapState.parkingOptions = parkingSpots;
  mapState.parkingMarkers = parkingSpots.map((spot) => {
    const marker = L.circleMarker([spot.lat, spot.lng], {
      radius: 9,
      color: "#10231e",
      weight: 2.5,
      fillColor: "#c08a10",
      fillOpacity: 0.98
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
  resetArrivalState();
  disableNavigationFollowMode();
  mapState.navigationActive = false;
  mapState.navigationFallbackMessage = "";
  routeModeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.routeMode === mapState.routeMode);
  });

  clearRouteDetails();

  updateNavigationUI();
  if (mapState.currentLocation && selectedNavigationTarget()) {
    previewOptimalRoute({
      fitBounds: true,
      silent: true
    });
  }
}

function clearNavigationGuide() {
  mapState.routeData = null;
  mapState.routeKey = "";
  if (!mapState.map || (!mapState.navigationLine && !mapState.navigationLineHalo && !mapState.navigationLineCore)) {
    clearRouteDetails();
    return;
  }

  if (mapState.navigationLineHalo) {
    mapState.map.removeLayer(mapState.navigationLineHalo);
    mapState.navigationLineHalo = null;
  }
  if (mapState.navigationLine) {
    mapState.map.removeLayer(mapState.navigationLine);
    mapState.navigationLine = null;
  }
  if (mapState.navigationLineCore) {
    mapState.map.removeLayer(mapState.navigationLineCore);
    mapState.navigationLineCore = null;
  }
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
  const destinationKey = navigationDestinationKey(destination);

  navigateButton.textContent = parkingSpot ? "Navigate to selected parking" : "Navigate to selected";
  syncNavigationActivityUI(destination, origin);
  syncVoiceGuidanceButton();
  syncRecenterButton();

  navigateButton.disabled = !(origin && destination);
  if (mapNavigateButton) {
    mapNavigateButton.disabled = !(origin && destination);
    mapNavigateButton.title = parkingSpot ? "Navigate to selected parking" : "Navigate to selected";
  }
  if (mapUseLocationButton) {
    mapUseLocationButton.disabled = false;
    mapUseLocationButton.title = "Use my location";
  }

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

  if (mapState.arrivedDestinationKey && mapState.arrivedDestinationKey === destinationKey) {
    navigationStatus.textContent = `You have arrived at ${destination.name}.`;
    return;
  }

  if (mapState.routeData && mapState.routeKey === currentRouteKey) {
    if (mapState.navigationFollowMode) {
      navigationStatus.textContent = `${routeModeLabel(mapState.routeMode)} follow mode is active for ${destination.name}.`;
    } else if (mapState.navigationActive) {
      navigationStatus.textContent = `${routeModeLabel(mapState.routeMode)} directions are ready for ${destination.name}.`;
    } else {
      navigationStatus.textContent = `The best ${mapState.routeMode} route to ${destination.name} is highlighted on the map. Select Navigate to selected to start live guidance.`;
    }
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
  resetArrivalState();
  resetArrivalParkingPrompt();
  disableNavigationFollowMode();
  mapState.navigationActive = false;
  mapState.navigationFallbackMessage = "";
  mapState.lastSpokenInstructionKey = "";
  stopVoiceGuidancePlayback();

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
  disableNavigationFollowMode();
  resetArrivalParkingPrompt();
  mapState.navigationActive = false;
  mapState.navigationFallbackMessage = "";
  mapState.lastSpokenInstructionKey = "";
  mapState.activeGuidanceStepIndex = -1;
  mapState.lastGuidanceAdvanceAt = 0;
  stopVoiceGuidancePlayback();
  clearNavigationGuide();
  updateNavigationUI();
}

function stopLocationWatch() {
  if (!("geolocation" in navigator) || mapState.geolocationWatchId === null) {
    return;
  }

  navigator.geolocation.clearWatch(mapState.geolocationWatchId);
  mapState.geolocationWatchId = null;
}

function disableNavigationFollowMode() {
  mapState.navigationFollowMode = false;
  mapState.followViewportSuspended = false;
  mapState.lastRouteRefreshAt = 0;
  mapState.lastRouteRefreshPoint = null;
  syncRecenterButton();
}

function beginProgrammaticMapMove() {
  mapState.programmaticMapMoveCount += 1;
}

function endProgrammaticMapMove() {
  if (mapState.programmaticMapMoveCount > 0) {
    mapState.programmaticMapMoveCount -= 1;
  }
}

function suspendFollowViewportForManualMapMove() {
  if (!mapState.navigationActive || !mapState.navigationFollowMode) {
    return;
  }

  mapState.followViewportSuspended = true;
  navigationStatus.textContent = "Map follow is paused while you explore. Tap Recenter to return to your live position.";
  syncRecenterButton();
}

function resumeFollowViewport() {
  if (!mapState.navigationFollowMode) {
    return;
  }

  mapState.followViewportSuspended = false;
  syncRecenterButton();
  syncFollowViewport({ force: true });
  const destination = selectedNavigationTarget();
  if (destination) {
    navigationStatus.textContent = `${routeModeLabel(mapState.routeMode)} follow mode is active for ${destination.name}.`;
  }
}

function syncFollowViewport(options = {}) {
  const { force = false } = options;
  if (!mapState.navigationFollowMode || !mapState.map || !mapState.currentLocation) {
    return;
  }

  if (mapState.followViewportSuspended && !force) {
    return;
  }

  const latLng = [mapState.currentLocation.lat, mapState.currentLocation.lng];
  const currentZoom = mapState.map.getZoom();
  const targetZoom = Math.max(currentZoom, FOLLOW_NAVIGATION_ZOOM);

  if (targetZoom > currentZoom) {
    beginProgrammaticMapMove();
    mapState.map.flyTo(latLng, targetZoom, {
      duration: MAP_FOLLOW_ANIMATION_SECONDS
    });
    return;
  }

  beginProgrammaticMapMove();
  mapState.map.panTo(latLng, {
    animate: true,
    duration: MAP_FOLLOW_ANIMATION_SECONDS,
    noMoveStart: true
  });
}

function maybeRefreshFollowRoute(previousLocation, nextLocation) {
  if (!mapState.navigationActive || !selectedNavigationTarget()) {
    return;
  }

  if (mapState.navigationFollowMode) {
    syncFollowViewport();
  }

  if (!nextLocation) {
    return;
  }

  const referencePoint = mapState.lastRouteRefreshPoint || previousLocation || nextLocation;
  const movedMiles = distanceMiles(referencePoint, nextLocation);
  const offRouteMiles = mapState.routeData
    ? distanceFromPointToRouteMiles(nextLocation, mapState.routeData)
    : Number.POSITIVE_INFINITY;
  const isOffRoute = Number.isFinite(offRouteMiles) && offRouteMiles >= OFF_ROUTE_REROUTE_THRESHOLD_MILES;
  const refreshWindowMs = isOffRoute ? OFF_ROUTE_REROUTE_MIN_MS : FOLLOW_ROUTE_REFRESH_MS;
  const enoughTime = (Date.now() - mapState.lastRouteRefreshAt) >= refreshWindowMs;

  if ((!mapState.routeData || movedMiles >= FOLLOW_ROUTE_REFRESH_MILES || isOffRoute) && enoughTime && !mapState.routeRequestKeyPending) {
    if (isOffRoute) {
      navigationStatus.textContent = "You’ve moved off the current route. Rerouting now...";
    }
    fetchTurnByTurnRoute();
  }
}

async function maybePromptForParkingAfterArrival(currentLocation) {
  if (!mapState.navigationActive || mapState.parkingPromptInFlight) {
    return;
  }

  const destination = activeArrivalLandmarkTarget();
  if (!destination || !currentLocation) {
    return;
  }

  if (mapState.arrivalParkingPromptKey === destination.name) {
    return;
  }

  if (distanceMiles(currentLocation, destination) > ARRIVAL_PROMPT_THRESHOLD_MILES) {
    return;
  }

  mapState.arrivalParkingPromptKey = destination.name;
  mapState.parkingPromptInFlight = true;

  try {
    const parkingFetcher = window.fetchNearbyParkingForDestination;
    if (typeof parkingFetcher !== "function") {
      announceArrival(destination);
      stopNavigation();
      return;
    }

    const parkingSpots = await parkingFetcher(destination);
    if (!parkingSpots.length) {
      announceArrival(destination, {
        messageSuffix: " No nearby parking entries were returned.",
        speak: true
      });
      stopNavigation();
      return;
    }

    const shouldNavigateToParking = window.confirm(`You have arrived at ${destination.name}. Would you like directions to the nearest parking location?`);
    if (!shouldNavigateToParking) {
      announceArrival(destination);
      stopNavigation();
      return;
    }

    showParkingMarkers(destination, parkingSpots);
    fitDestinationAndParkingPoints(destination, parkingSpots);
    await navigateToParkingSpot(parkingSpots[0].id, true, true);
  } catch (error) {
    announceArrival(destination, {
      messageSuffix: " Nearby parking search is unavailable right now.",
      speak: true
    });
    stopNavigation();
  } finally {
    mapState.parkingPromptInFlight = false;
  }
}

function maybeAnnounceArrival(currentLocation) {
  if (!mapState.navigationActive) {
    return;
  }

  const destination = selectedNavigationTarget();
  if (!destination || !currentLocation) {
    return;
  }

  if (distanceMiles(currentLocation, destination) > ARRIVAL_PROMPT_THRESHOLD_MILES) {
    return;
  }

  const destinationKey = navigationDestinationKey(destination);
  if (!destinationKey || mapState.arrivedDestinationKey === destinationKey) {
    return;
  }

  announceArrival(destination);
}

function startLiveLocationWatch() {
  if (!("geolocation" in navigator) || mapState.geolocationWatchId !== null) {
    return;
  }

  mapState.geolocationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const previousLocation = mapState.currentLocation
        ? { ...mapState.currentLocation }
        : null;
      const { latitude, longitude, accuracy } = position.coords;
      setCurrentLocation(latitude, longitude, accuracy, {
        preserveNavigation: mapState.navigationActive,
        followMap: mapState.navigationFollowMode
      });
      maybeRefreshFollowRoute(previousLocation, mapState.currentLocation);
    },
    () => {
      navigationStatus.textContent = mapState.navigationFollowMode
        ? "Follow mode is on, but live movement updates are unavailable right now."
        : "Live location tracking is unavailable right now.";
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 1200
    }
  );
}

function activateNavigationFollowMode() {
  if (!mapState.navigationActive || !mapState.currentLocation || !selectedNavigationTarget() || !mapState.map) {
    navigationStatus.textContent = "Start navigation first, then double-click your blue location marker to enter follow mode.";
    return;
  }

  mapState.navigationFollowMode = true;
  mapState.followViewportSuspended = false;
  setBasemap("street");
  mapState.lastRouteRefreshAt = Date.now();
  mapState.lastRouteRefreshPoint = mapState.currentLocation
    ? { ...mapState.currentLocation }
    : null;
  syncFollowViewport();
  startLiveLocationWatch();
  updateNavigationUI();
}

function handleUserMarkerDoubleActivate(event) {
  if (event?.originalEvent) {
    event.originalEvent.preventDefault?.();
    event.originalEvent.stopPropagation?.();
  }
  activateNavigationFollowMode();
}

function handleUserMarkerTap(event) {
  const originalEvent = event?.originalEvent;
  const isTouchLike = Boolean(
    originalEvent
    && (
      originalEvent.pointerType === "touch"
      || originalEvent.pointerType === "pen"
      || originalEvent.type?.startsWith("touch")
    )
  );

  if (!isTouchLike) {
    return;
  }

  const now = Date.now();
  if (now - mapState.lastUserMarkerTapAt <= DOUBLE_TAP_WINDOW_MS) {
    mapState.lastUserMarkerTapAt = 0;
    originalEvent.preventDefault?.();
    originalEvent.stopPropagation?.();
    activateNavigationFollowMode();
    return;
  }

  mapState.lastUserMarkerTapAt = now;
}

function setCurrentLocation(lat, lng, accuracy = 0, options = {}) {
  const previousLocation = mapState.currentLocation;
  mapState.currentLocation = { lat, lng };
  mapState.currentLocationLabel = options.label || "Current position";
  mapState.currentLocationDescription = options.description
    || (accuracy ? `Accuracy about ${Math.round(accuracy)} meters` : "Live browser geolocation");
  const locationChanged = !previousLocation || distanceMiles(previousLocation, mapState.currentLocation) > 0.02;
  const preserveNavigation = options.preserveNavigation === true;

  if (!mapState.map) {
    updateNavigationUI();
    return;
  }

  if (!mapState.userLocationMarker) {
    mapState.userLocationMarker = L.circleMarker([lat, lng], {
      radius: 10.5,
      color: "#10231e",
      weight: 3.5,
      fillColor: "#0d5a8d",
      fillOpacity: 0.98
    }).addTo(mapState.map);
    mapState.userLocationMarker.on("dblclick", handleUserMarkerDoubleActivate);
    mapState.userLocationMarker.on("click", handleUserMarkerTap);
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

  if (locationChanged && !preserveNavigation) {
    disableNavigationFollowMode();
    mapState.navigationActive = false;
    mapState.navigationFallbackMessage = "";
    clearNavigationGuide();
  }

  if (options.followMap) {
    syncFollowViewport();
  }

  maybeAdvanceVoiceGuidance(mapState.currentLocation);
  maybeAnnounceArrival(mapState.currentLocation);
  maybePromptForParkingAfterArrival(mapState.currentLocation);
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

  renderNavigationLine(points, {
    fitBounds,
    dashed: true
  });
  updateNavigationUI();
}

function renderNavigationLine(points, options = {}) {
  const { fitBounds = true, dashed = false } = options;
  if (!mapState.map || !Array.isArray(points) || !points.length) {
    return;
  }

  const haloStyle = dashed
    ? {
      color: "rgba(13, 90, 141, 0.14)",
      weight: 10,
      opacity: 0.34,
      dashArray: "10 10",
      lineCap: "round",
      lineJoin: "round",
      pane: "routeHighlightPane"
    }
    : {
      color: "#eff9ff",
      weight: 22,
      opacity: 0.98,
      lineCap: "round",
      lineJoin: "round",
      pane: "routeHighlightPane"
    };

  const lineStyle = dashed
    ? {
      color: "#103b4d",
      weight: 4.5,
      opacity: 0.84,
      dashArray: "10 10",
      lineCap: "round",
      lineJoin: "round",
      pane: "routeHighlightPane"
    }
    : {
      color: "#1979c7",
      weight: 15,
      opacity: 0.94,
      dashArray: null,
      lineCap: "round",
      lineJoin: "round",
      pane: "routeHighlightPane"
    };

  const coreStyle = dashed
    ? null
    : {
      color: "#fff6c7",
      weight: 7,
      opacity: 0.98,
      dashArray: null,
      lineCap: "round",
      lineJoin: "round",
      pane: "routeHighlightPane"
    };

  if (!mapState.navigationLineHalo) {
    mapState.navigationLineHalo = L.polyline(points, haloStyle).addTo(mapState.map);
  } else {
    mapState.navigationLineHalo.setStyle(haloStyle);
    mapState.navigationLineHalo.setLatLngs(points);
  }

  if (!mapState.navigationLine) {
    mapState.navigationLine = L.polyline(points, lineStyle).addTo(mapState.map);
  } else {
    mapState.navigationLine.setStyle(lineStyle);
    mapState.navigationLine.setLatLngs(points);
  }

  if (coreStyle) {
    if (!mapState.navigationLineCore) {
      mapState.navigationLineCore = L.polyline(points, coreStyle).addTo(mapState.map);
    } else {
      mapState.navigationLineCore.setStyle(coreStyle);
      mapState.navigationLineCore.setLatLngs(points);
    }
    mapState.navigationLineCore.bringToFront();
  } else if (mapState.navigationLineCore) {
    mapState.map.removeLayer(mapState.navigationLineCore);
    mapState.navigationLineCore = null;
  }

  mapState.navigationLineHalo.bringToFront();
  mapState.navigationLine.bringToFront();

  if (fitBounds) {
    mapState.map.fitBounds(points, { padding: [32, 32] });
  }
}

function renderRouteOnMap(route, options = {}) {
  const coordinates = route?.geometry?.coordinates || [];
  const points = coordinates.map(([lng, lat]) => [lat, lng]);
  if (!points.length) {
    return;
  }

  renderNavigationLine(points, {
    fitBounds: options.fitBounds !== false,
    dashed: false
  });
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForRoutingWindow() {
  const elapsed = Date.now() - mapState.lastRouteRequestAt;
  if (elapsed < ROUTE_REQUEST_SPACING_MS) {
    await sleep(ROUTE_REQUEST_SPACING_MS - elapsed);
  }
  mapState.lastRouteRequestAt = Date.now();
}

async function requestDrivingRouteFromService(origin, destination, service, options = {}) {
  const params = new URLSearchParams({
    overview: options.overview || "full",
    geometries: "geojson",
    steps: options.steps === false ? "false" : "true",
    alternatives: "false"
  });

  const normalizedOrigin = normalizePoint(origin?.lat, origin?.lng);
  const normalizedDestination = normalizePoint(destination?.lat, destination?.lng);
  if (!normalizedOrigin || !normalizedDestination) {
    throw new Error("Route points were invalid");
  }

  const coordinates = `${normalizedOrigin.lng},${normalizedOrigin.lat};${normalizedDestination.lng},${normalizedDestination.lat}`;
  const controller = typeof AbortController !== "undefined"
    ? new AbortController()
    : null;
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), ROUTE_REQUEST_TIMEOUT_MS)
    : 0;

  let response;
  try {
    response = await fetch(`${service.routeBase}/${coordinates}?${params.toString()}`, {
      headers: {
        Accept: "application/json"
      },
      signal: controller?.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${service.name} timed out`);
    }
    throw new Error(`${service.name} could not be reached`);
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }

  if (!response.ok) {
    throw new Error(`${service.name} returned status ${response.status}`);
  }

  const payload = await response.json();
  const route = payload.routes?.[0];
  if (!route?.geometry?.coordinates?.length) {
    throw new Error(`${service.name} returned no route geometry`);
  }

  return route;
}

async function requestDrivingRouteBatch(origin, destination, options = {}) {
  await waitForRoutingWindow();

  const attempts = DRIVING_ROUTE_SERVICES.map((service) => (
    requestDrivingRouteFromService(origin, destination, service, options)
  ));

  try {
    if (typeof Promise.any === "function") {
      return await Promise.any(attempts);
    }

    const settled = await Promise.allSettled(attempts);
    const match = settled.find((result) => result.status === "fulfilled");
    if (match) {
      return match.value;
    }

    throw settled.find((result) => result.status === "rejected")?.reason
      || new Error("Driving route unavailable");
  } catch (error) {
    const failure = error?.errors?.find(Boolean) || error;
    throw failure || new Error("Driving route unavailable");
  }
}

async function resolveDrivingRoute(origin, destination) {
  const attempts = [
    { steps: true, overview: "full" },
    { steps: true, overview: "simplified" }
  ];

  let lastError = null;
  for (const options of attempts) {
    try {
      return await requestDrivingRouteBatch(origin, destination, options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Driving route unavailable");
}

async function previewOptimalRoute(options = {}) {
  const { fitBounds = true, silent = false } = options;
  const destination = selectedNavigationTarget();
  const origin = mapState.currentLocation;

  if (!mapState.map || !origin || !destination) {
    return false;
  }

  const requestKey = buildRouteKey(origin, destination, mapState.routeMode);
  if (mapState.routeData && mapState.routeKey === requestKey) {
    renderRouteOnMap(mapState.routeData, { fitBounds });
    updateNavigationUI();
    return true;
  }

  if (mapState.routeRequestKeyPending === requestKey) {
    return false;
  }

  mapState.routeRequestKeyPending = requestKey;
  if (!silent) {
    navigationStatus.textContent = `Highlighting the best ${mapState.routeMode} route to ${destination.name}...`;
  }

  try {
    const route = await resolveDrivingRoute(origin, destination);
    if (requestKey !== buildRouteKey(mapState.currentLocation, selectedNavigationTarget(), mapState.routeMode)) {
      return false;
    }

    mapState.routeData = route;
    mapState.routeKey = requestKey;
    mapState.navigationFallbackMessage = "";
    renderRouteOnMap(route, { fitBounds });
    renderRouteDetails(route);
    updateNavigationUI();
    return true;
  } catch (error) {
    if (requestKey !== buildRouteKey(mapState.currentLocation, selectedNavigationTarget(), mapState.routeMode)) {
      return false;
    }

    mapState.routeData = null;
    mapState.routeKey = "";
    drawNavigationGuide({ fitBounds });
    if (!silent) {
      const reason = error?.message ? ` (${error.message})` : "";
      navigationStatus.textContent = `The live route preview is unavailable right now, so the map is showing a straight guide line instead${reason}.`;
    }
    return false;
  } finally {
    if (mapState.routeRequestKeyPending === requestKey) {
      mapState.routeRequestKeyPending = "";
    }
  }
}

async function fetchTurnByTurnRoute() {
  const destination = selectedNavigationTarget();
  const origin = mapState.currentLocation;

  if (!origin || !destination) {
    updateNavigationUI();
    return;
  }

  resetArrivalState();
  const wasNavigating = mapState.navigationActive;
  mapState.navigationActive = true;
  if (mapState.map && mapState.currentLocation) {
    mapState.navigationFollowMode = true;
    setBasemap("street");
    startLiveLocationWatch();
    syncFollowViewport();
  }
  mapState.navigationFallbackMessage = "";
  const requestKey = buildRouteKey(origin, destination, mapState.routeMode);
  if (mapState.routeData && mapState.routeKey === requestKey) {
    updateNavigationUI();
    return;
  }

  if (mapState.routeRequestKeyPending === requestKey) {
    return;
  }

  mapState.routeRequestKeyPending = requestKey;
  const isRouteRefresh = Boolean(wasNavigating && mapState.routeData);
  syncNavigationActivityUI(destination, origin);
  navigationStatus.textContent = `Building a ${mapState.routeMode} route to ${destination.name}...`;
  routeSummary.classList.add("is-hidden");
  routeSteps.classList.add("is-hidden");

  try {
    if (requestKey !== buildRouteKey(mapState.currentLocation, selectedNavigationTarget(), mapState.routeMode)) {
      return;
    }

    const route = await resolveDrivingRoute(origin, destination);

    if (requestKey !== buildRouteKey(mapState.currentLocation, selectedNavigationTarget(), mapState.routeMode)) {
      return;
    }

    mapState.routeData = route;
    mapState.routeKey = requestKey;
    mapState.navigationFallbackMessage = "";
    mapState.lastRouteRefreshAt = Date.now();
    mapState.lastRouteRefreshPoint = origin ? { ...origin } : null;
    renderRouteOnMap(route, { fitBounds: !mapState.navigationFollowMode && !isRouteRefresh });
    if (mapState.navigationFollowMode) {
      syncFollowViewport();
    }
    renderRouteDetails(route);
    mapState.activeGuidanceStepIndex = 0;
    mapState.lastGuidanceAdvanceAt = 0;
    speakNavigationGuidance(route, destination, {
      force: !mapState.navigationFollowMode
    });
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
  } finally {
    if (mapState.routeRequestKeyPending === requestKey) {
      mapState.routeRequestKeyPending = "";
    }
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
      startLiveLocationWatch();
      const accuracyText = accuracy ? ` Accuracy about ${Math.round(accuracy)} meters.` : "";

      const destination = selectedNavigationTarget();
      if (destination) {
        clearRouteDetails();
        navigationStatus.textContent = `Location updated.${accuracyText} Highlighting the best ${mapState.routeMode} route to ${destination.name}...`;
        previewOptimalRoute({
          fitBounds: true
        });
      } else if (mapState.map) {
        navigationStatus.textContent = `Location updated.${accuracyText} Live tracking is on. Select a destination to navigate.`;
        mapState.map.flyTo([latitude, longitude], Math.max(mapState.map.getZoom(), 16), {
          duration: MAP_CONTEXT_FLY_SECONDS
        });
      }
    },
    () => {
      navigationStatus.textContent = "Location access was unavailable. Check your browser permissions and try again.";
    },
    {
      enableHighAccuracy: true,
      timeout: 9000,
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
  if (mapState.currentView === "campus") {
    return CAMPUS_VIEW_CATEGORIES.has(building.category);
  }

  if (mapState.currentView === "hospital") {
    return HEALTH_SCIENCES_VIEW_CATEGORIES.has(building.category);
  }

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
    throw new Error("Leaflet did not load.");
  }

  const campusCenter = [38.9211, -77.0181];
  const map = L.map("map", {
    zoomControl: false,
    scrollWheelZoom: true,
    minZoom: 12,
    maxZoom: 20,
    preferCanvas: true
  });
  map.setView(campusCenter, 16);
  L.control.zoom({ position: "topright" }).addTo(map);
  map.createPane("routeHighlightPane");
  map.getPane("routeHighlightPane").style.zIndex = "430";

  const streetLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 20,
    maxNativeZoom: 20,
    detectRetina: true,
    updateWhenZooming: false,
    keepBuffer: 4,
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
  });

  const imageryLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 20,
    maxNativeZoom: 19,
    detectRetina: true,
    updateWhenZooming: false,
    keepBuffer: 4,
    attribution: "Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
  });

  streetLayer.addTo(map);
  if (mapCanvas) {
    mapCanvas.dataset.basemap = "street";
  }
  mapState.map = map;
  mapState.baseLayers = {
    street: streetLayer,
    imagery: imageryLayer
  };

  map.on("moveend zoomend", () => {
    endProgrammaticMapMove();
  });

  map.on("dragstart zoomstart", () => {
    if (mapState.programmaticMapMoveCount > 0) {
      return;
    }
    suspendFollowViewportForManualMapMove();
  });

  buildings.forEach((building) => {
    const point = buildingPoint(building);
    if (!point) {
      return;
    }

    const style = categoryStyles[building.category];
    const layer = L.circleMarker([point.lat, point.lng], {
      radius: 10,
      color: "#10231e",
      weight: 2.5,
      fillColor: style.color,
      fillOpacity: 0.98
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

function showHotBadge(building) {
  return HOT_CATEGORIES.has(building.category) && HOT_PLACE_NAMES.has(building.name);
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
        ${showHotBadge(building) ? `<div class="lot-hot">🔥 HOT</div>` : ""}
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
      fillOpacity: visible ? (selected ? 1 : 0.9) : 0,
      color: "#10231e",
      weight: selected ? 3.5 : 2.5,
      opacity: visible ? 1 : 0
    });
    layer.setRadius(visible ? (selected ? 12 : 9.5) : 0);

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
    duration: MAP_CONTEXT_FLY_SECONDS
  });
  layer.openPopup();
  bounceLandmarkMarker(layer);
}

function bounceLandmarkMarker(layer) {
  if (!layer || typeof layer.setRadius !== "function") {
    return;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const baseRadius = typeof layer.getRadius === "function" ? layer.getRadius() : 12;
  const baseWeight = layer.options?.weight ?? 3.5;
  const frames = [
    { radius: baseRadius, weight: baseWeight, delay: 0 },
    { radius: baseRadius + 4, weight: baseWeight + 0.8, delay: 90 },
    { radius: baseRadius + 1.5, weight: baseWeight + 0.3, delay: 180 },
    { radius: baseRadius + 3, weight: baseWeight + 0.6, delay: 270 },
    { radius: baseRadius, weight: baseWeight, delay: 360 }
  ];

  (layer.__bounceTimeouts || []).forEach((timeoutId) => window.clearTimeout(timeoutId));
  layer.__bounceTimeouts = frames.map((frame) => window.setTimeout(() => {
    layer.setStyle({ weight: frame.weight });
    layer.setRadius(frame.radius);
  }, frame.delay));
}
