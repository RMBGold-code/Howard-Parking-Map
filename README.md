# Howard+DC landmarks

A single-page interactive map focused on Howard University and the nearby Washington, D.C. area. The app highlights academic buildings, student life, arts, athletics, health sciences, and selected regional restaurants, brunch spots, wineries, and event venues.

## Features

- real basemap with aerial and street views
- color-coded landmark categories
- searchable directory with live suggestion dropdowns
- parking finder for any typed destination
- clickable nearby parking options
- in-app walking or driving navigation from your location
- installable PWA shell with share and QR access

## Files

- `index.html`: page structure and controls
- `styles.css`: layout, colors, cards, and responsive styling
- `app-data.js`: landmark dataset and category metadata
- `app-core.js`: shared DOM references, state, map creation, and rendering helpers
- `app-ui.js`: UI events, search flows, parking lookup, navigation, and install/share behavior
- `manifest.json`: PWA metadata
- `sw.js`: service worker for local app shell caching
- `icons/`: app icon and QR asset

## Local use

Open `index.html` in a browser for the local version. Some features need internet access:

- map tiles
- search fallback
- parking lookup
- route generation

## Share it

The live hosted app is:

[Howard+DC landmarks](https://rmbgold-code.github.io/Howard-Parking-Map/)

To share it with other people:

- send them the hosted URL above
- let them scan the QR code on the page
- install it with the `Install shortcut` button when supported

## Notes

- Howard campus coordinates are curated in source data
- off-campus places use source coordinates baked into the app data
- routing depends on live network access
- parking results depend on live OpenStreetMap data availability
