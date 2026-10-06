# Chart of Accounts — User Stories

## 1. Standard Chart of Accounts Templates

**US-COA-001**
As a finance manager setting up a new company, I want to load a standard Philippine chart of accounts template so that I start with a compliant structure without building it from scratch.

**Acceptance criteria:**
- The setup wizard offers at least two templates: PFRS for SMEs (for small and medium enterprises) and a BIR-aligned layout for sole proprietors and partnerships.
- Selecting a template populates the full account tree including drawers, title accounts, active accounts, statement line mappings, and default flags.
- After loading a template I can add, rename, or deactivate accounts before saving; I cannot delete drawer-level title accounts.
- Loading a template on an existing chart of accounts shows a diff preview (new accounts to add, conflicts with existing codes) before applying.

---

## 2. Account Structure

**US-COA-010**
As a finance manager, I want to create and maintain a hierarchical chart of accounts organized by drawer (Assets, Liabilities, Equity, Revenue, etc.) so that all financial transactions post to the correct account.

**Acceptance criteria:**
- I can create a title account that groups accounts under it; title accounts cannot receive postings.
- I can create an active account under a title account in the same drawer; only active accounts appear in document pickers.
- Account code is 4 digits and is immutable after saving — the system warns me that documents already reference it.
- Changing the drawer is blocked after saving because it affects financial statement mapping.
- I can set the currency to PHP, a single foreign currency (e.g. USD), or "All currencies."

---

**US-COA-011**
As a bookkeeper, I want to see the chart of accounts displayed as an indented tree filtered by drawer so that I can quickly navigate to the account I need.

**Acceptance criteria:**
- The list page has tabs for All and each drawer (Assets, Liabilities, Equity, etc.), each showing a count.
- Accounts are indented by depth under their drawer to show the parent-child hierarchy.
- I can search across code, name, drawer, flags (control, cash, contra), tax code, and required dimensions.
- I can sort by any column including usage count.

---

**US-COA-012**
As a finance manager, I want to flag accounts with special behaviors (Control, Cash, Contra, Block manual JEs, Confidential) so that the system enforces posting rules automatically.

**Acceptance criteria:**
- Control accounts (AR/AP) only accept postings through a business partner; they cannot be used in direct journal entries.
- Cash accounts are available for bank reconciliation and appear in the Cash flow statement as the cash itself.
- Contra accounts carry the opposite normal balance of their drawer (e.g. Accumulated Depreciation under Assets is credit-normal).
- "Block manual JEs" prevents the account from appearing in the manual journal entry line picker.
- Confidential accounts are visible only to users with the Confidential Accounts permission.
- An account cannot be both Control and Cash at the same time.

---

## 3. Statement Line Management

**US-COA-020**
As a CFO, I want to manage the financial statement lines that accounts roll up to so that the P&L and Balance Sheet match the format my auditor and the BIR expect.

**Acceptance criteria:**
- I can add, rename, and deactivate statement lines per drawer (e.g. add "Right-of-use assets" under Assets for PFRS 16 leases).
- I can set the order of lines within each drawer to control how they appear on printed statements.
- Deactivating a statement line is blocked if any active accounts are still mapped to it — I must remap them first.
- A standard PFRS for SMEs template is available to reset the lines to a common starting point.

---

**US-COA-021**
As a finance manager, I want to see a live financial statement preview organized by statement line so that I can confirm the account mapping before running period-end reports.

**Acceptance criteria:**
- The preview shows a collapsible P&L and Balance Sheet with each statement line, the accounts under it, and their current balances summed.
- Statement lines with no mapped accounts are flagged in amber.
- Accounts with no statement line assigned are listed in a separate "Unmapped" panel at the bottom.
- Clicking a statement line expands it to show the individual accounts and their balances.
- The preview can be printed or exported as a formatted PDF.

---

## 4. Reporting Mapping

**US-COA-030**
As a CFO, I want every active account mapped to a financial statement line and cash flow category so that the system can produce a P&L and Balance Sheet without manual adjustments.

**Acceptance criteria:**
- Each active account must have a statement line assigned; saving without one shows a validation error.
- Balance sheet accounts (Assets, Liabilities) must be classified as Current or Non-current.
- Income statement accounts default to the Operating cash flow category (indirect method); I can override to Investing or Financing.
- Cash accounts themselves have no cash flow category — they are the cash.
- When I add an account under an existing title, the system pre-fills the statement line, classification, cash flow category, and account type from the sibling accounts already there.

---

**US-COA-031**
As a finance manager, I want to preview the financial statement layout using the current account mapping so that I can verify the structure before closing a period.

**Acceptance criteria:**
- A "Statement preview" view shows a collapsed P&L and Balance Sheet tree with each statement line and the accounts rolled up under it.
- Lines with no mapped accounts are highlighted so I know where gaps exist.
- Unmarked accounts (no statement line) appear in an "Unmapped" section at the bottom.

---

## 5. Posting Controls

**US-COA-040**
As a finance manager, I want to set a valid date range on an account so that the system refuses postings outside the window without me having to manually check.

**Acceptance criteria:**
- Valid from and Valid to are optional; leaving them blank means the account is open-ended.
- A transaction dated before Valid from or after Valid to is rejected at posting time with a clear error message.
- Valid to must be on or after Valid from; saving with a reversed range shows a validation error.

---

**US-COA-041**
As a finance controller, I want to require specific dimensions (Branch, Cost center, Project) on certain accounts so that management reports always have the detail they need.

**Acceptance criteria:**
- I can tick one or more required dimensions on each account.
- Posting a journal entry to an account with required dimensions without filling them in is rejected.
- Revenue, Cost of Sales, and Operating Expense accounts default to requiring Branch when created.

---

## 6. Period Locking

**US-COA-050**
As a finance controller, I want to lock closed accounting periods so that no one can backdate or amend postings after the period has been reported.

**Acceptance criteria:**
- I can close a period (e.g. January 2026) which prevents any new journal entries dated within that period from being saved.
- Attempting to post to a locked period shows a clear error: "Period Jan 2026 is closed. Use a date in the current open period."
- I can view a list of all periods with their status (Open, Closed, Locked) and the date they were closed.
- A "soft lock" option warns users before posting to a prior period without hard-blocking, for controlled adjustments.

---

**US-COA-051**
As a finance controller, I want to reopen a closed period for a controlled adjustment so that I can post an auditor's entry or a prior-period correction without unlocking the whole year.

**Acceptance criteria:**
- Reopening a period requires an explicit confirmation step and records who reopened it and when in the period history.
- The reopened period reverts to Open status; I close it again manually after posting the adjustment.
- Reopening a period does not affect the lock status of other periods.

---

## 7. Period-End and Tax

**US-COA-060**
As a bookkeeper, I want to set a default VAT tax code on an account so that manual journal entries to that account propose the right tax code automatically.

**Acceptance criteria:**
- I can assign a default tax code to any non-title account.
- The picker shows only tax codes in the direction matching the account type (Sales codes for Sales accounts; Purchase codes for all others).
- The proposed tax code is overridable on the journal entry line.

---

**US-COA-061**
As a finance manager, I want to mark foreign-currency accounts for period-end revaluation so that FX gains and losses are recognized at each reporting date.

**Acceptance criteria:**
- The Revalue flag is available only on accounts with a single foreign currency (e.g. USD); it is disabled for PHP and "All currencies" accounts.
- A period-end revaluation run processes all flagged accounts, computes the gain or loss at the closing rate, and posts a journal entry to the FX gain/loss accounts.
- The revaluation journal entry is reversible at the start of the next period.

---

**US-COA-062**
As a bookkeeper, I want to mark cash and bank accounts for reconciliation so that the system knows which accounts to include in the bank reconciliation workflow.

**Acceptance criteria:**
- The Reconcile flag is available only on cash accounts (the Cash flag must be ticked first).
- Bank reconciliation shows only reconcile-flagged accounts in the account picker.
- Reconciled transactions are marked so that the unreconciled balance is always visible.

---

## 8. BIR Compliance Mapping

**US-COA-070**
As a tax accountant, I want to map G/L accounts to BIR alpha list fields so that the system can generate the Expanded Withholding Tax (EWT) alpha list without manual spreadsheet work.

**Acceptance criteria:**
- Each withholding-related account (EWT Payable, FWT Payable, Creditable Withholding Tax) can be tagged with the corresponding BIR alpha list category (e.g. 1601-EQ, 1601-FQ).
- The alpha list export pulls amounts from the mapped accounts for the selected period and formats them to the BIR's prescribed CSV layout.
- Accounts not mapped to an alpha list category are excluded from the export with a warning listing them by name.

---

**US-COA-071**
As a tax accountant, I want to map G/L accounts to the relevant schedules on the BIR Annual Income Tax Return (ITR) so that I can auto-populate the ITR schedules from the general ledger.

**Acceptance criteria:**
- Each account can be assigned a BIR ITR schedule line (e.g. Schedule 1 – Gross Sales, Schedule 3 – Cost of Sales, Schedule 6 – Deductions).
- An ITR schedule report aggregates the mapped account balances by schedule line for a selected fiscal year.
- Accounts mapped to more than one schedule line are flagged as a conflict.
- Unmapped income statement accounts appear in a "Review needed" list so the tax accountant can assign them before filing.

---

## 9. Import and Export

**US-COA-080**
As a finance manager setting up a new company, I want to import a chart of accounts from a CSV file so that I can onboard without re-entering hundreds of accounts manually.

**Acceptance criteria:**
- I can download a CSV template showing the required columns (code, name, drawer, parentCode, currency, flags, statement line, etc.).
- Uploading a CSV shows a preview table highlighting errors (duplicate codes, unknown drawers, missing required columns) before committing.
- Valid rows are imported; rows with errors are skipped and listed in a downloadable error report.
- Importing does not overwrite existing accounts — codes that already exist are flagged as conflicts for me to resolve.

---

**US-COA-081**
As a finance manager, I want to export the chart of accounts to CSV or Excel so that I can share it with an auditor or import it into another system.

**Acceptance criteria:**
- An "Export" button on the list page downloads all accounts (or the current drawer filter) with all fields.
- The export includes the computed normal balance, statement line, and usage count columns.

---

## 10. Opening Balances

**US-COA-090**
As a finance manager going live on the system, I want to enter opening balances for all balance sheet accounts so that the starting financial position is correct before recording any new transactions.

**Acceptance criteria:**
- An opening balances wizard lists all active non-title balance sheet accounts with a debit and credit amount column.
- The wizard shows a running total of debits and credits; saving is blocked if they don't balance.
- Posted opening balances create a single system journal entry dated the go-live date.
- Opening balances can be re-entered before the first period is locked; afterwards an adjusting journal entry is required.

---

## 11. Account Ledger and Balances

**US-COA-100**
As a bookkeeper, I want to see the current balance of each account in the chart of accounts list so that I can spot accounts with unexpected balances at a glance.

**Acceptance criteria:**
- The account list shows a Balance column with the net debit or credit balance for the current open period.
- Title accounts show the sum of all accounts beneath them.
- Contra accounts display their balance in the opposite sign to their drawer's normal balance.
- A currency indicator is shown for foreign-currency accounts (e.g. USD 12,450.00 / PHP equivalent).
- Inactive accounts show their last known balance with an "Inactive" badge so historical postings are not lost.

---

**US-COA-101**
As a finance manager, I want to drill into an account's transaction history from the chart of accounts so that I can investigate individual postings without leaving the accounting module.

**Acceptance criteria:**
- Clicking an account opens an Account Ledger view showing all journal entry lines posted to it: date, JE reference, description, debit, credit, and running balance.
- I can filter the ledger by date range, journal type (manual JE, AP invoice, AR invoice, payment, etc.), and dimension (Branch, Cost center, Project).
- Each line links to the source document (e.g. clicking an AP invoice line opens that invoice).
- The ledger can be exported to CSV with the current filter applied.
- The opening balance for the selected period is shown as the first line.

---

## 12. Budget per Account

**US-COA-110**
As a finance manager, I want to enter an annual budget broken down by account and month so that I can track actual-vs-budget variance in management reports.

**Acceptance criteria:**
- I can enter a budget amount (debit or credit) per active account per calendar month for a chosen fiscal year.
- I can distribute an annual total evenly across months or enter monthly amounts manually.
- Budget figures can be copied from the prior year and adjusted by a percentage.
- The Account Ledger (US-COA-101) shows a Budget column and a Variance column alongside actual balances.
- Accounts with no budget entered show "—" in the Budget column; they are not treated as zero-budget.

---

## 13. Usage Tracking and Safeguards

**US-COA-120**
As a finance manager, I want to see which records currently use each account so that I know the impact before deactivating or restructuring it.

**Acceptance criteria:**
- The account editor shows a "Used in" field listing item groups, items, business partners, and tax codes that reference the account, with a count and the names of the first four.
- The account list shows a "Used in" column with the total reference count for quick scanning.

---

**US-COA-121**
As a system, I want to block deactivation of accounts that are still in use so that live transactions are never posted to a closed account.

**Acceptance criteria:**
- Attempting to deactivate an in-use account shows an error naming the records that reference it and instructing the user to reassign them first.
- Bulk deactivation skips in-use accounts and shows a summary notice listing which were skipped and why.
- Switching an account from active to a title account while it has usage is also blocked.

---

## 14. Account Maintenance

**US-COA-130**
As a bookkeeper, I want to duplicate an existing account as a starting point for a new one so that I don't have to re-enter all the reporting and posting settings from scratch.

**Acceptance criteria:**
- A "Duplicate" action on the account detail creates a copy with a blank code and a "(copy)" suffix on the name.
- All flags, reporting settings, and posting controls are copied; the code and name must be edited before saving.
- Usage references are not copied — the duplicate starts with zero usage.

---

**US-COA-131**
As a finance manager, I want to merge one account into another so that I can clean up duplicate or obsolete accounts after reassigning their balances.

**Acceptance criteria:**
- A "Merge into" action lets me pick a target account of the same drawer and account type.
- The system updates all item groups, items, business partners, and tax codes that reference the source account to point to the target.
- After all references are moved the source account is automatically deactivated.
- The merge is logged in the account's change history.

---

## 15. Audit and History

**US-COA-140**
As a finance controller, I want to see a change history for each account so that I can audit who changed the name, flags, or statement mapping and when.

**Acceptance criteria:**
- The account detail shows a "History" section listing each change: timestamp, user, field changed, old value, and new value.
- Name changes, flag changes (control, cash, contra, block JE, confidential), statement line changes, and active/inactive transitions are all logged.
- The history is read-only and cannot be edited or deleted.

---

## 16. Printed and PDF Reports

**US-COA-150**
As a finance manager, I want to print the chart of accounts as a formatted report so that I can hand it to an auditor or submit it with a BIR letter of authority response.

**Acceptance criteria:**
- A "Print / Export PDF" action on the list page generates a formatted report with company name, report date, and page numbers.
- The report groups accounts by drawer with title accounts bolded and active accounts indented.
- I can choose to include or exclude inactive accounts and the Usage column.
- The PDF layout fits on A4 paper in portrait orientation.
