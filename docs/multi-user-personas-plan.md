# Multi-user personas (acting-as switcher) + role-gated queues

## Context

The prototype runs as **one hardcoded user**. `src/mocks/common.ts` fixes:

```ts
export const CURRENT_USER    = 'Jasper L.';                 // name, for "created by" stamps
export const CURRENT_USER_ID = employeeId('Jasper L.');     // employee id, default owner/buyer/sales employee
```

`CURRENT_USER_ID` / `CURRENT_USER` are imported in **~41 files**. There is no sign-in, no notion of
"who is acting", and therefore **no handoff**: when a sales order spawns a purchase order or (per
`sales-order-stock-sourcing-plan.md`) an inventory transfer request, the same single user is navigated
straight into the new draft and creates it themselves. A real purchasing or inventory person is never
involved, and nothing lands in anyone's queue to act on.

The **data model is already multi-user** — only the active user is fixed:
- Employees carry `roles: EmployeeRole[]` + `defaultRoleId` (`src/mocks/employees.ts:105-107`). Seeded
  roles: **Approver, Employee, Purchaser, Sales, Technician**.
- `isApprover(docType)` already gates approval by comparing the rule's `approverId` to `CURRENT_USER_ID`
  (`src/services/approval.ts:43`).
- Per-user data already exists: `UserPreferences` is keyed by user id and seeded with `CURRENT_USER_ID`
  (`src/mocks/preferences.ts`).

**Goal:** let the user *act as* different people (Sales, Purchaser, Inventory, Approver) so the
cross-role handoff and queues become real — **without** real auth (out of scope for a frontend
prototype). The SO availability/transfer feature is the first consumer: the Sales persona creates a
transfer request; the Inventory persona finds and executes it.

### Decisions (proposed)

| Decision | Choice | Why |
|---|---|---|
| **Auth** | **None** — a persona *switcher*, not login | Frontend prototype; no backend, no secrets |
| **Active user** | A tiny **current-user store** (localStorage), seeded to Jasper | Mirrors how the app already persists state; survives reload |
| **Seed vs runtime author** | Keep a **fixed seed-author constant** for `src/mocks/` seeds; only **runtime** new-doc defaults read the active user | Seed documents must hash-stably to a fixed author (seed fingerprint); only live edits should follow the persona |
| **Roles** | Reuse existing `EmployeeRole` set (Sales / Purchaser / Approver / …) | Already modelled and seeded; no new master data |
| **Gating** | Role-based **visibility of queues/actions**, not hard security | Prototype demonstrates the workflow; it isn't enforcing permissions |

---

## Feature A — A switchable "current user"

**The core refactor: constant → accessor.**

- Keep the seed author fixed. Rename the literal used by `src/mocks/**` seeds to make intent explicit —
  e.g. `SEED_AUTHOR_ID` / `SEED_AUTHOR` (same value as today). Seeds must **not** change hash when the
  persona changes (`scripts/seed-fingerprint.ts` must stay green).
- Add a current-user store (new `src/services/session.ts`):
  - `currentUserId(): string` and `currentUser(): string` — read the active employee (default Jasper).
  - `setCurrentUser(employeeId)` — switch persona; bumps the store version so dependent views refresh.
  - `useCurrentUser()` hook for components.
- Migrate the **runtime** call sites (new-document defaults, activity `ownerId`, `createdBy` stamps,
  `isApprover`) from the constant to `currentUserId()` / `currentUser()`. Leave **seed** call sites on
  `SEED_AUTHOR_ID`. The ~41 usages split into these two buckets; most mock-file usages are seeds (stay),
  most page/service usages are runtime (switch).

**Consumers to switch (representative, not exhaustive):**
- `src/services/approval.ts` — `isApprover`/`needsApproval` compare against the active user.
- `src/components/activity/ActivityTab.tsx` (`ownerId`), `ActivityPanel.tsx` / `AttachmentsCard.tsx`
  (`createdBy`), `accounting/vouchers/VoucherEntryDetail.tsx`.
- `blankX(ownerId)` builders when called **at runtime** from a detail page's `new` branch (pass
  `currentUserId()`), while seed arrays keep `SEED_AUTHOR_ID`.

## Feature B — The "Acting as…" switcher (app shell)

- A dropdown in `src/app/AppShell.tsx` top bar: lists employees (or a curated persona shortlist —
  Sales / Purchaser / Inventory / Approver / Manager), shows the active one, calls `setCurrentUser`.
- Label it clearly as a **demo persona switch** (not a login) so it's never mistaken for real auth.
- On switch, role-gated views (Feature C) re-evaluate; nav may hide areas the persona doesn't use.

## Feature C — Role-gated queues & handoff

This is what makes a created draft *reach someone*.

- Add a helper `hasRole(roleName)` / `activeRoles()` on the session, reading the active employee's
  `roles` (`EmployeeRole[]`).
- **Approvals page** already lists "Not Confirmed" docs for the approver; with a switchable user it
  genuinely filters to the acting approver.
- **Ownership on handoff docs.** When the SO flow creates a PO / transfer request, stamp it with the
  owning team/role (the existing owner/sales-employee field already exists on these docs). A persona
  with the matching role sees it via that list's status view (e.g. Inventory → open transfer requests).
- **Nav/area visibility (optional).** Hide or de-emphasise areas a persona doesn't act in (a Sales
  persona needn't see Purchasing queues), driven by `hasRole`.

## Feature D — (Optional) lightweight notification surface

Still **pull-based**, consistent with the app (no real push):
- A **dashboard tile / count badge** per persona: "3 transfer requests awaiting you", "2 draft POs",
  "1 pending approval" — each links to the filtered list.
- Sourced from the same `list*()` + status-view filters the queues already use; no new storage.
- A true push/inbox/bell is explicitly **out of scope** — it would be a new subsystem.

---

## Critical files

**Modify**
- `src/mocks/common.ts` — introduce `SEED_AUTHOR_ID` / `SEED_AUTHOR`; keep seed usages on it.
- `~runtime call sites` — swap the constant for `currentUserId()` / `currentUser()` (approval, activity,
  attachments, vouchers, detail-page `new` branches).
- `src/app/AppShell.tsx` — the "Acting as…" switcher; `src/app/nav.tsx` — optional role visibility.
- `src/pages/approvals/ApprovalsPage.tsx` — now meaningfully per-approver.

**Create**
- `src/services/session.ts` — current-user store + `useCurrentUser`, `hasRole`, `setCurrentUser`.

**Reuse (do not re-implement)**
- Employee `roles` / `defaultRoleId` and the `employeeRoleId()` helpers (`src/mocks/employees.ts`).
- `isApprover` / `needsApproval` (`src/services/approval.ts`) — repoint to the active user.
- `createCollection` / store-version invalidation pattern (`src/services/store.ts`) for the session store.
- `UserPreferences` (`src/mocks/preferences.ts`) as the precedent for per-user state.

## Risks / notes

- **Seed stability is the main trap.** If a seed document's author becomes dynamic, the seed fingerprint
  moves and `npx tsx scripts/check-seeds.ts` / `seed-fingerprint.ts` break. Strictly separate
  `SEED_AUTHOR_ID` (seeds) from `currentUserId()` (runtime).
- **Scope of the 41-site migration.** Mechanical but wide; do it in one pass with the seed/runtime split
  as the rule, and typecheck after.
- **Not security.** Gating is for workflow demonstration; anyone can switch persona. Document this.

## Test plan

1. `npm run typecheck`, `npm run lint`, `npm run knip` (0).
2. `npx tsx scripts/check-seeds.ts` and `npx tsx scripts/seed-fingerprint.ts` — **unchanged** vs a
   `main` worktree (proves the seed author split kept seeds stable).
3. Manual (`npm run dev`):
   - Switch persona to **Sales**, create an SO that's short → "Create stock transfer" → a transfer
     request draft is created, owned by Inventory.
   - Switch to **Inventory** → the open transfer request appears in its queue / a dashboard tile;
     execute it.
   - Switch to **Approver** → a "Not Confirmed" doc appears on the Approvals page; approve it. Switch
     back to a non-approver → it's gone from that queue.
4. `npm run test:e2e` smoke sweep — all routes still load, no console errors, with the default persona.
