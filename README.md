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
  components/form/ Shared master-data form pieces: field builders, "You can also" menu,
                   problems alert, attachments table, MasterList (editable settings lists)
  pages/           One folder per hub (Home, inventory/items/…, partners/…)
    inventory/items/ The item master; detail/ holds the form, one file per tab
    settings/accounting-tax/ Settings › Accounting & Tax: tax codes, tax groups, withholding,
                   excise, currencies and BSP exchange rates
    partners/      Business partners: the Business Partners master lists every record;
                   CRM › Leads, Sales › Customers and Purchasing › Vendors are role views
                   of it. detail/ holds the master form, one file per tab
  mocks/           Seed data and types
  services/        Fake async API over the mocks (store.ts; swap for fetch() later)
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
- To reset the mock data, clear the `sikat-erp:*` keys in `localStorage`.
- Tax master data (Settings › Accounting & Tax) covers Philippine VAT (12%, zero-rated,
  exempt, government, importation, digital-services reverse charge), 3% percentage tax,
  expanded withholding tax ATCs, withholding VAT and excise categories. Rows marked
  "To confirm" / "Enter current rate" still need your accountant's check.
- Tax on a document line is decided by rules in `src/services/taxDetermination.ts`:
  company status (VAT-registered, top withholding agent) → item fixed code → partner
  status (government / zero-rated / exempt customer; non-VAT / non-resident supplier)
  → item tax group. Withholding comes from the vendor override, else the item's
  withholding category and the company's TWA status. Try it on the Determination
  rules tab. Tax codes keep effective-dated rates.
- Exchange rates are PHP per unit from the BSP Reference Exchange Rate Bulletin. Paste
  the day's bulletin into "Import BSP bulletin"; the sample data holds the 30 Apr 2026
  (partial) and 25 Sep 2026 bulletins.
- Item fields follow the SAP B1 Item Master Data field map, localized (BIR VAT tax
  groups, PH warehouses). Seed items are marked as having transactions, which locks
  Item No., type, inventory UoM, tracking and valuation, as SAP does. Issue method
  and phantom live only on the Production tab (the map lists them twice).
- Business partner fields follow the SAP B1 BP master field mapping, localized for
  the Philippines (TIN, barangay/province, GCash/Maya/PDC). Left out on purpose:
  portal passwords and card numbers (security), IBAN/SEPA mandate (EU-only), pager,
  factoring and country of birth. "Connected vendor" is unnecessary because one
  record can be both customer and vendor.
