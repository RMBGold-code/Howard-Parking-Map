# Howard University Landmarks App

This project is now set up as a shareable installable web app.

## What was added

- `manifest.json` for installability
- `sw.js` service worker for app-shell caching
- local app icons in [`icons`](C:/Users/ckell/OneDrive/Documents/Map/icons)
- install/share buttons in the welcome panel

## How to share it

Because browsers only allow full app install behavior from hosted URLs, the best next step is to publish this folder to a static host.

Good options:

1. GitHub Pages
2. Netlify
3. Vercel
4. OneDrive or SharePoint static hosting if available in your environment

## Quickest path with GitHub Pages

1. Create a new GitHub repository.
2. Upload the files from this folder.
3. In the repository settings, open `Pages`.
4. Set the source to the main branch root.
5. Save and wait for GitHub to publish the site.

Once it is live on `https://...`, users can:

- open the link in their browser
- use the `Share app` button
- install it with the `Install app` button when supported

## Local testing note

If you open `index.html` directly as a local file, the app still works, but:

- service worker install features will not fully activate
- the share button cannot produce a useful public URL
- install prompts will usually stay unavailable
