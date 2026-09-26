# Sikat ERP — UI prototype

A frontend-only prototype of Sikat ERP built on the
[Sikat design system](https://github.com/jasperlepardo/sikat-design-system).
There is no backend: screens read and write mock data through small async
"service" functions, and edits are saved to `localStorage`.

**Stack:** Vite · React 19 · TypeScript · React Router 7 · Tailwind CSS v4 (themed by the design system's tokens)

## Setup

The design system is published to **GitHub Packages**, which needs a token even for reads:

1. Create a **classic** GitHub personal access token with only the `read:packages` scope
   (GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)).
   Fine-grained tokens don't work with the npm registry.
2. Export it before installing. The repo's `.npmrc` reads `NODE_AUTH_TOKEN`:

   ```bash
   export NODE_AUTH_TOKEN=ghp_…   # add to your shell profile
   npm install
   npm run dev
   ```

| Command             | Does                                    |
| ------------------- | --------------------------------------- |
| `npm run dev`       | Start the dev server                    |
| `npm run build`     | Typecheck and build a static site to `dist/` |
| `npm run preview`   | Serve the built site locally            |
| `npm run typecheck` | Typecheck only                          |

The build is fully static and uses hash routing (`/#/inventory/items`), so `dist/` can be
hosted anywhere (GitHub Pages, Netlify, Vercel) with no rewrite rules.

## Project layout

```
src/
  app/
    AppShell.tsx   Navbar + SideNav + routed content (<Outlet />)
    nav.tsx        Sidebar hubs and pages (from the navigation architecture); a page's id is its route (/sales/invoices)
    router.tsx     Route table; unbuilt nav entries fall through to <Placeholder />
  pages/           One folder per hub (Home, inventory/items/ItemList, inventory/items/ItemDetail)
  mocks/           Seed data and types
  services/        Fake async API over the mocks (swap for fetch() later)
  index.css        Tailwind + the design system's token theme
  main.tsx         Loads the design system CSS, applies the saved theme, mounts the router
```

## Adding a screen

1. Create `src/pages/<hub>/<Screen>.tsx`. Compose it from design system parts:
   `Panel` + `PanelHeader` for the page frame, `Table` for lists, `Card` +
   `FormField` for forms.
2. Register its route in `src/app/router.tsx`, using the same path as the nav leaf's id
   in `src/app/nav.tsx` (for example, `sales/customers` or `purchasing/purchase-orders`).
3. If it needs data, add seed records to `src/mocks/` and a service in `src/services/`.

## Notes

- Fonts (DM Sans, Urbanist) and the Material Symbols icon font load from Google
  Fonts in `index.html`. The design system doesn't ship font files, and `<Icon>`
  needs Material Symbols.
- The design system's JS doesn't inject its CSS on its own, so `main.tsx` imports
  `@jasperlepardo/sikat-design-system/styles` explicitly.
- Theme: light, dark, or follow the OS. Switch it from the avatar menu.
- To reset the mock data, clear the `sikat-erp:items` key in `localStorage`.
