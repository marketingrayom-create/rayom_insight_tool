# Static BEACON frontend

The React/Vite frontend recreates the supplied BEACON recording with orange navigation, marketplace controls, dashboard charts and reusable components. All displayed figures and creator/product records are sample data. No backend, login, API request or external image/font service is required by the active frontend.

## Run

```sh
npm install
npm run dev
```

Build: `npm run build`. Preview the production build: `npm run preview`.

## Structure

- `src/main.jsx`: entry point for the static application.
- `src/static/App.jsx`: page navigation and shared UI state.
- `src/static/components/Layout.jsx`: sidebar, account selector and top bar.
- `src/static/components/UI.jsx`: buttons, filters, tabs, tables, modal, CSV export.
- `src/static/pages/Dashboard.jsx`: metric cards, SVG charts, brand and listing summaries.
- `src/static/pages/WorkspacePages.jsx`: orders, campaigns, posts, creators, groups, inventory, search trends and reports.
- `src/static/data/mockData.js`: editable sample data.
- `src/static/styles.css`: responsive layout, colors, chart styling and themes.
- `src/OriginalApp.jsx`: preserved original entry implementation; not imported by the static app.

## Preview behavior

Navigation supports URL hashes and browser back/forward. Campaign/report forms, account selection, creator search and selection, inventory filtering/pagination, CSV export, theme controls and support panel run locally. Preview form records reset when their page is left or reloaded. No submissions reach a server.

The video shows some empty/loading/coming-soon screens. Stable empty states or representative sample rows are supplied instead of permanent loading placeholders. Raw Data, Reviews, Share of Voice and administration pages use coming-soon views. Creator photos and the original brand asset were not included; local initials and a recreated wordmark are used. Some advanced filter controls are visual previews only. Live marketplace research is not connected.

The existing backend and API files are preserved. `npm run dev` now starts only Vite; the previous combined startup is available explicitly as `npm run dev:full`.
