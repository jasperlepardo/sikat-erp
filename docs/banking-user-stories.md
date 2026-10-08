# Banking — User Stories

## Definition of Terms

### Accounts and postings

| Term | Definition |
|---|---|
| **House bank account** | A bank, cash-fund, or e-wallet account that the company itself owns (e.g. a BDO current account, a GCash merchant wallet). Each one is linked to a G/L cash account. Not the same as a **partner bank account**, which belongs to a customer or vendor. |
| **G/L account** | A general ledger account in the chart of accounts. See the Chart of Accounts user stories for the full glossary. |
| **Journal entry (JE)** | A balanced record of debits (Dr) and credits (Cr) posted to G/L accounts. |
| **Clearing account** | A temporary G/L account that holds amounts in transit until they are settled, e.g. *Cash on Hand – Store Collections* (cash and checks not yet deposited), *Checks Received*, or *Card and E-wallet Settlements Receivable* (card sales not yet remitted by the processor). It should return to zero once everything is settled. |
| **Incoming Payment** | A receipt of money from a customer (cash, check, card, or transfer). |
| **Outgoing Payment** | A disbursement of money to a vendor or another payee. |
| **Payment means** | How a payment is made or received: cash, check, bank transfer, or card. |
| **Running balance** | The account balance after each transaction, in date order. |

### Deposits and checks

| Term | Definition |
|---|---|
| **Deposit slip** | A bank form, and the matching document in the system, that lists the cash and checks being deposited to a bank account in one transaction. |
| **Undeposited / pending deposit** | Cash or checks that have been received and posted but not yet deposited to the bank. |
| **Check register** | The list of all checks the company has issued, with their status. |
| **Check voucher** | A printed form attached to an issued check that shows the payee, amount, the invoices being paid, and approval and signature lines. In the Philippines a voucher check combines the voucher (upper portion) and the check stub (lower portion). |
| **Void** | Cancelling an issued check (e.g. lost, damaged, stop payment). Voiding reverses the payment and re-opens the invoices it paid. |
| **Stale-dated check** | A check presented more than 6 months (180 days) after its date. Philippine banks will not honor it. |
| **Post-dated check (PDC)** | A check dated in the future. It cannot be deposited until that date. Common in the Philippines for installment and credit sales. |
| **Holding / For Deposit / Deposited** | PDC statuses: not yet due; due and ready to deposit; deposited. |
| **Bounced (dishonored) check** | A check the bank refused to pay. The customer's balance is restored and the bank's dishonor fee is charged. |
| **DAIF / DAUD** | Common bank return reasons: *Drawn Against Insufficient Funds* and *Drawn Against Uncollected Deposits*. |
| **Endorsed check** | A customer's check that the company signs over to a vendor as payment instead of depositing it. |

### Cards and e-wallets

| Term | Definition |
|---|---|
| **Card brand** | The card network or e-wallet used for a payment: Visa, Mastercard, Amex, GCash, Maya, etc. |
| **Card processor / acquirer** | The bank or company that processes card payments for the store and remits the proceeds (e.g. BDO Merchant Services). |
| **Card settlement** | Recording the processor's remittance of a batch of card sales: the gross sales, less the merchant discount fee, equals the net amount credited to the bank. |
| **Merchant discount fee (MDR)** | The percentage the processor deducts from each card sale as its fee. Booked as an expense. |
| **Voucher number** | The approval or reference number printed on a card terminal slip. |

### Payments and settings

| Term | Definition |
|---|---|
| **Payment wizard / payment run** | A batch process that selects open vendor invoices by due date and creates the outgoing payments in one go. |
| **Payment order** | A scheduled or recurring instruction to pay a payee (e.g. the monthly SSS remittance). |
| **SSS / PhilHealth / Pag-IBIG** | Philippine government agencies for social security, health insurance, and housing fund contributions. Employers must remit contributions to each by fixed monthly deadlines. |
| **Payment terms** | The rule for when an invoice is due, e.g. *Net 30* (due 30 days after the invoice date) or *2/10 n/30* (2% discount if paid within 10 days, otherwise the full amount is due in 30 days). |
| **Installments** | An invoice balance split into several partial payments with separate due dates. |
| **Holiday calendar** | The list of non-working days used to move due dates to the next working day. **Regular holidays** and **special non-working days** are set by Philippine law. **RA 9492** is the law that sets the fixed national holidays. **Local holidays** apply to one city or province. |
| **Dunning** | A process of escalating reminders to customers with overdue invoices. Each **dunning level** sets the days overdue, the letter text, and any fee. |
| **SWIFT code** | An international code that identifies a bank for cross-border wire transfers. |

### Reconciliation

| Term | Definition |
|---|---|
| **Bank reconciliation** | Matching the bank statement against the company's books to explain every difference between the two balances. |
| **Bank statement line** | One transaction on the bank's statement: date, description, debit, credit, balance. |
| **Auto-match / tolerance** | The system pairs statement lines with book entries by amount and date. The tolerance is how far apart the dates (or amounts) may be and still match. |
| **Outstanding check** | A check recorded in the books that the bank has not yet paid. |
| **Deposit in transit** | A deposit recorded in the books that does not yet appear on the bank statement. |
| **Reconciling item** | A bank-side entry not yet in the books, such as a bank charge or interest earned. It is recorded with a journal entry. |
| **Adjusted balance** | The bank balance and the book balance after the items above are applied. The two must be equal for the reconciliation to balance. |
| **Lock (reconciliation)** | Freezes a completed reconciliation so that matched entries cannot be changed. |

### Petty cash

| Term | Definition |
|---|---|
| **Petty cash fund** | A small amount of cash kept on hand for minor expenses. |
| **Imprest / fixed float** | The fixed amount the petty cash fund is restored to after each replenishment. |
| **Custodian** | The person responsible for the petty cash fund. |
| **Petty cash voucher** | A record of one petty cash expense: payee, purpose, amount, expense account, and receipt. |
| **Replenishment** | Reimbursing the fund for the vouchers paid out, which brings it back to its fixed float and books the expenses. |

### BIR withholding tax

| Term | Definition |
|---|---|
| **BIR** | Bureau of Internal Revenue, the Philippine tax authority. |
| **EWT** | Expanded Withholding Tax: a percentage of a supplier payment that the payer withholds and remits to the BIR as an advance on the supplier's income tax. |
| **FWT** | Final Withholding Tax: withholding that fully settles the payee's tax on that income (e.g. payments to non-residents). |
| **CWT** | Creditable Withholding Tax: tax withheld from the company by its customers. The company can credit it against its own income tax. |
| **Withholding agent / Top withholding agent (TWA)** | A taxpayer required to withhold tax on its payments. **Top withholding agents** are large taxpayers the BIR designates to withhold on purchases of goods and services from all regular suppliers. |
| **ATC** | Alphanumeric Tax Code: the BIR code that identifies the type of income payment and its withholding rate (e.g. WC158). |
| **BIR Form 2307** | Certificate of Creditable Tax Withheld at Source. The payer issues it to the payee as proof of the tax withheld. |
| **0619-E / 0619-F** | Monthly remittance forms for EWT and FWT (filed for the first two months of each quarter). |
| **1601-EQ / 1601-FQ** | Quarterly remittance returns for EWT and FWT. |
| **eFPS** | Electronic Filing and Payment System, the BIR's online portal for filing returns and paying taxes. |
| **RR 11-2018** | BIR Revenue Regulations No. 11-2018, which sets the current withholding tax rules and rates. |
| **TIN** | Taxpayer Identification Number. |
| **ITR** | Annual Income Tax Return. |

### Financing and transfers

| Term | Definition |
|---|---|
| **Factoring** | Selling receivables (open AR invoices) to a financing company for cash now, at a discount. |
| **Face value** | The total amount of the invoices sold. |
| **Advance rate** | The percentage of face value the factor pays upfront (e.g. 80%). |
| **Factoring fee** | The factor's charge, booked as an expense. |
| **Reserve** | The part of the face value held back by the factor (face value − advance). It is remitted to the company, less fees, once the customers pay. |
| **Interbank transfer** | Moving money between two of the company's own bank accounts. |
| **FX gain/loss** | The gain or loss from exchange-rate differences when converting between currencies. |

### Electronic payments

| Term | Definition |
|---|---|
| **EFT** | Electronic Funds Transfer. |
| **InstaPay** | A Philippine real-time electronic transfer service for smaller amounts, processed one transaction at a time. |
| **PESONet** | A Philippine batch electronic transfer service for larger amounts, credited the same or next banking day. |
| **Batch payment file** | A file in the bank's required format that lists many transfers, uploaded to the bank's online portal in a single step. |
| **Cash position** | The total funds available across all house bank accounts at a point in time. |
| **Cash flow forecast** | The expected inflows (receivables, maturing PDCs) minus outflows (payables, scheduled payments, tax remittances) over a future period. |

---

## 1. House Bank Accounts

**US-BNK-001**
As a finance manager, I want to register the company's bank accounts (BDO, BPI, Metrobank, GCash, etc.) so that payment transactions can reference the correct account and G/L mapping.

**Acceptance criteria:**
- I can create a bank account with: bank name, branch, account number, currency (PHP or USD), linked G/L account, and account type (bank, cash fund, e-wallet/InstaPay).
- I can set the next check number for accounts that issue checks.
- I can mark an account inactive to hide it from payment forms without deleting it.
- The account's running balance is shown, derived from the linked G/L account.

---

**US-BNK-002**
As a bookkeeper, I want to select a house bank account on outgoing and incoming payments instead of picking a raw G/L account, so that the bank details (branch, account number) are pre-filled automatically.

**Acceptance criteria:**
- Outgoing Payment > Payment Means shows only house bank accounts for the Bank Transfer and Check tabs.
- Selecting a house bank account populates the G/L account, bank name, branch, and account number fields.
- Accounts in a currency other than the payment currency are still shown (the bank handles the conversion) but flagged.

---

## 2. Deposits

**US-BNK-010**
As a cashier, I want to create a deposit slip that bundles undeposited checks and cash into a single bank deposit, so that the clearing account (Store Collections Receivable) is cleared and the bank account balance is updated.

**Acceptance criteria:**
- I can select undeposited checks from posted Incoming Payments.
- I can select undeposited cash receipts from posted Incoming Payments.
- The deposit slip shows: deposit date, bank account, reference, and a lines table of selected receipts.
- Posting the deposit creates a journal entry: Dr Bank Account / Cr Cash on Hand – Store Collections (or Checks Received, as applicable).
- Once posted, the included receipts are marked as deposited and no longer appear in the undeposited list.

---

**US-BNK-011**
As a finance manager, I want to see all undeposited cash and checks at any time so that I can ensure collections are being deposited promptly.

**Acceptance criteria:**
- A "Pending Deposits" view lists all posted Incoming Payments whose payment means have not yet been deposited, grouped by payment type (cash, check).
- The view shows: receipt date, customer, amount, and days pending.
- I can initiate a deposit directly from this view.

---

## 3. Checks for Payment

**US-BNK-020**
As an AP clerk, I want to view all outgoing checks in a register, so that I can track which checks have been issued, cleared, or are still outstanding.

**Acceptance criteria:**
- The check register lists all checks from posted Outgoing Payments with: check number, payee, bank account, amount, issue date, due date, and status.
- Statuses are: Printed, Issued, Cleared, Voided, Stale-dated.
- I can filter by bank account, status, date range, and payee.

---

**US-BNK-021**
As a finance manager, I want to void a check that was issued in error, so that the payment is reversed and the vendor's open balance is restored.

**Acceptance criteria:**
- I can void a check from the check register or from the Outgoing Payment form.
- Voiding prompts for a reason (lost, damaged, stop payment, etc.).
- A void reversal journal entry is created automatically.
- The Outgoing Payment's status changes to Cancelled.
- The vendor's A/P invoices that were settled by that payment return to open.

---

**US-BNK-022**
As a bookkeeper, I want checks older than 6 months to be automatically flagged as stale-dated, so that I am reminded to follow up with the payee or void and reissue.

**Acceptance criteria:**
- A check whose due date is more than 180 days in the past is flagged with the status "Stale-dated."
- Stale-dated checks appear in a dedicated filter view.
- Flagging is automatic on page load; no manual step is required.
- Stale-dating does not automatically reverse the payment — I must explicitly void it.

---

**US-BNK-023**
As an AP supervisor, I want to print a check voucher for each outgoing check so that I have a paper record with the payee, amount, and signatory lines.

**Acceptance criteria:**
- I can print a check voucher from the Outgoing Payment form or the check register.
- The voucher shows: check number, date, payee name, amount in figures and words, bank account, and the invoices being settled.
- The layout follows the standard Philippine voucher check format (upper portion: voucher details; lower portion: check stub).

---

## 4. Card Settlements

**US-BNK-030**
As a cashier, I want to record the settlement remittance from the card terminal processor (e.g. BDO Merchant Services, GCash) so that the card settlements clearing account is cleared and the net proceeds land in the bank account.

**Acceptance criteria:**
- I can create a card settlement for a specific card brand (Visa, Mastercard, GCash, Maya, etc.) and a date range.
- The settlement lists the card receipts from Incoming Payments in that period that have not yet been settled.
- I enter the actual remittance amount and the merchant discount fee charged by the processor.
- Posting creates a journal entry: Dr Bank Account, Dr Merchant Discount Fee (expense) / Cr Card and E-wallet Settlements Receivable.
- Settled receipts are marked so they no longer appear in future settlement batches.

---

**US-BNK-031**
As a finance manager, I want to see unsettled card and e-wallet collections grouped by card brand, so that I can reconcile the clearing account against what the processor owes us.

**Acceptance criteria:**
- An "Unsettled Cards" view shows all card/e-wallet receipts not yet included in a settlement, grouped by card brand.
- The view shows: transaction date, customer, card brand, voucher number, amount.
- The total per brand is shown at the bottom.

---

## 5. Payment Orders (Payment Wizard)

**US-BNK-040**
As an AP manager, I want to run a payment wizard that selects all open vendor invoices due within a date range and generates the outgoing payments in a single batch, so that I do not have to create each payment manually.

**Acceptance criteria:**
- I can set filters: due date range, currency, house bank account, vendor, and vendor group.
- The wizard previews the selected invoices grouped by vendor, showing total per vendor and total per bank account.
- I can exclude individual vendors or invoices before executing.
- Executing the run creates one posted Outgoing Payment per vendor (or per bank account, if the vendor has multiple).
- The run is logged with: run date, filters used, number of payments created, and total amount.

---

**US-BNK-041**
As a finance manager, I want to schedule payment runs for government-mandated remittances (SSS, PhilHealth, Pag-IBIG), so that statutory deadlines are never missed.

**Acceptance criteria:**
- I can create a payment order template tied to a specific vendor and a recurring schedule (e.g. every 10th of the month).
- On the scheduled date, the system generates a draft Outgoing Payment ready for review and posting.
- If the scheduled date falls on a holiday (per the holiday calendar in Settings > Banking), the due date shifts to the next working day.

---

## 6. Bank Reconciliation

**US-BNK-050**
As a bookkeeper, I want to enter bank statement lines for a given period and match them against G/L entries, so that I can identify discrepancies between the bank's records and the books.

**Acceptance criteria:**
- I select a house bank account and a statement period.
- I enter (or import via CSV) bank statement lines: date, description, debit, credit, running balance.
- The system auto-matches lines to Outgoing Payments, Incoming Payments, Deposits, and Journal Entries by amount and date within a configurable tolerance.
- Unmatched book entries are listed as outstanding items.
- Unmatched bank lines can be linked to an existing entry or used to create a journal entry (e.g. bank charges, interest).

---

**US-BNK-051**
As a finance manager, I want the reconciliation statement to show the path from the bank's closing balance to the book's G/L balance, so that the reconciliation is audit-ready.

**Acceptance criteria:**
- The statement displays: Bank closing balance → less outstanding checks → add deposits in transit → adjusted bank balance, compared to Book G/L balance → less/plus reconciling items → adjusted book balance.
- Both adjusted balances must match before I can lock the reconciliation.
- I can print or export the reconciliation statement as a PDF.

---

**US-BNK-052**
As a finance manager, I want to lock a completed reconciliation for a period so that no one can modify the matched entries retroactively.

**Acceptance criteria:**
- Locking a reconciliation requires both adjusted balances to agree.
- Locked entries cannot be unposted or modified.
- An attempt to edit a locked entry shows a message identifying the reconciliation period it belongs to.

---

## 7. Banking Settings

**US-BNK-060**
As a system administrator, I want to define payment terms (Net 30, 2/10 n/30, installments) so that due dates are calculated consistently across purchasing and sales documents.

**Acceptance criteria:**
- I can define a payment term with: name, number of days net, early-payment discount percentage and deadline, and installment schedule.
- Payment terms integrate with: Purchase Orders, AP Invoices, AR Invoices, Sales Orders.
- Due dates that fall on a public holiday (per the assigned holiday calendar) shift to the next working day.

---

**US-BNK-061**
As a system administrator, I want to maintain a holiday calendar with Philippine public holidays so that due date calculations skip non-working days.

**Acceptance criteria:**
- I can create named holiday calendars (e.g. "National Holidays PH 2026").
- I can add dates as: regular holiday (double pay), special non-working day (130% pay), or local holiday.
- Calendars can be assigned to payment terms and payment order schedules.
- Pre-loaded seed data includes all RA 9492 fixed holidays.

---

**US-BNK-062**
As a system administrator, I want to configure dunning terms that define when and how overdue notices are sent to customers, so that collections follow a consistent escalation process.

**Acceptance criteria:**
- A dunning term has one or more levels: days overdue threshold, dunning text, and fee amount.
- Partners can be assigned a default dunning term.
- The dunning run lists all overdue AR invoices and their current dunning level.
- Generating a dunning letter records the level and date on the invoice so the next run advances to the next level.

---

**US-BNK-063**
As a system administrator, I want to maintain the list of banks (BDO, BPI, Metrobank, RCBC, etc.) with their SWIFT/BSB codes so that bank accounts and check details always reference a validated bank.

**Acceptance criteria:**
- Each bank entry has: name, short code, SWIFT code (for international wires), and country.
- Banks are used as lookups on: House Bank Accounts, Partner Bank Accounts (Payment Methods tab), and Checks for Payment.
- Pre-loaded seed data includes major Philippine banks.

---

**US-BNK-064**
As a system administrator, I want to define card brands (Visa, Mastercard, Amex, GCash, Maya) with their linked clearing G/L accounts so that card receipts always post to the correct account.

**Acceptance criteria:**
- Each card brand has: name, icon/logo, default clearing G/L account, and merchant discount fee rate.
- Card brands are selectable in Incoming Payments > Payment Means and in Card Settlements.
- The default clearing account and fee rate pre-fill when a card brand is selected.

---

## 8. Post-dated Check (PDC) Registry

**US-BNK-070**
As a cashier, I want to log checks received from customers that have a future due date so that I can track when each check matures and is ready for deposit.

**Acceptance criteria:**
- Checks with a due date after the posting date are automatically listed in the PDC registry.
- The registry shows: check number, customer, bank, branch, account number, amount, due date, and status.
- Statuses are: Holding, For Deposit, Deposited, Bounced, Returned.
- A check moves to "For Deposit" automatically when its due date is reached (on next page load).
- I can initiate a deposit for a matured check directly from the registry, linking it to a Deposit slip.

---

**US-BNK-071**
As a finance manager, I want to record a bounced check and reverse the original collection so that the customer's balance is restored and a bank charge is posted.

**Acceptance criteria:**
- I can mark a check in the PDC registry as "Bounced."
- Bouncing creates a reversal journal entry: Dr Accounts Receivable / Cr Bank (or clearing account), plus Dr Bank Charges (expense) / Cr Bank for the dishonor fee.
- The original Incoming Payment is re-opened or a new open AR balance is created.
- The customer's record shows the bounced check history.
- Philippine context: the dishonor fee and return reason (DAIF, DAUD, closed account) are recorded.

---

## 9. Endorsed Checks

**US-BNK-080**
As an AP clerk, I want to endorse a check received from a customer over to a vendor as payment, so that I avoid a bank trip and settle the vendor's invoice directly.

**Acceptance criteria:**
- I can mark a check in the PDC/check registry as endorsed when paying a vendor.
- The endorsed check appears in Outgoing Payments > Payment Means as a payment method.
- The journal entry: Dr Accounts Payable / Cr Checks Received (clearing) — the check exits the clearing account directly to the vendor's payable.
- The vendor's partner record must have "Accepts endorsed checks" enabled (from the Payment Methods tab) before this option is available.
- The endorsed check's status in the registry changes to "Endorsed" with the payee vendor recorded.

---

## 10. Petty Cash Management

**US-BNK-090**
As a cashier, I want to establish a petty cash fund with a fixed float so that small day-to-day expenses can be paid without going through the full payment process.

**Acceptance criteria:**
- I can create a petty cash fund linked to account 1011 – Cash on Hand – Petty Cash, with a named custodian and a fixed float amount.
- The fund is funded by a cash advance from a house bank account (journal entry: Dr Petty Cash / Cr Bank).
- Multiple funds can exist (e.g. one per department or branch).

---

**US-BNK-091**
As a petty cash custodian, I want to record individual petty cash disbursements against expense accounts so that the fund's running balance is always accurate.

**Acceptance criteria:**
- I can create a petty cash voucher with: date, payee/purpose, amount, and G/L expense account.
- The voucher deducts from the fund's running balance.
- I can attach a photo of the receipt.
- Vouchers can be in Draft until the replenishment is filed.

---

**US-BNK-092**
As a finance manager, I want to replenish the petty cash fund when it falls below a threshold so that the custodian is never short of cash.

**Acceptance criteria:**
- A replenishment bundles all un-replenished petty cash vouchers for the fund into a single request.
- The request shows: total by expense account, total to replenish, and custodian.
- Approving the replenishment creates an Outgoing Payment (cash or check) for the total and posts the expense entries.
- After replenishment the fund's balance returns to its fixed float.

---

## 11. BIR Withholding Tax Remittance

**US-BNK-100**
As a tax accountant, I want to generate BIR Form 2307 (Certificate of Creditable Tax Withheld at Source) for vendors from whom we withheld EWT, so that we can hand them their copy and satisfy our BIR obligation.

**Acceptance criteria:**
- The system collects all posted Outgoing Payments with EWT withheld for a selected period and vendor.
- A printable Form 2307 is generated with: payor TIN and address, payee TIN and name, ATC, quarter, and total amount withheld per income payment type.
- I can generate in bulk for all vendors for a given quarter.
- Philippine context: ATCs and the quarterly schedule follow BIR RR 11-2018 as seeded in the withholding tax settings.

---

**US-BNK-101**
As a tax accountant, I want to record BIR Form 2307 certificates received from customers (top withholding agents) who withheld EWT on our sales invoices, so that we can claim them as creditable taxes on our income tax return.

**Acceptance criteria:**
- I can attach a Form 2307 to an Incoming Payment or directly to an AR Invoice.
- The certificate records: customer TIN, quarter covered, ATC, and amount withheld.
- The system accumulates total creditable withholding tax per quarter for ITR preparation.
- An alert appears on the AR Invoice if a customer is flagged as a top withholding agent but no 2307 has been received.

---

**US-BNK-102**
As a tax accountant, I want to generate the monthly/quarterly BIR remittance payment (0619-E / 1601-EQ) for expanded withholding taxes, so that we can file and pay on time through eFPS.

**Acceptance criteria:**
- The system aggregates all EWT withheld on posted Outgoing Payments for the selected period, grouped by ATC.
- A summary report shows: ATC, tax base, rate, tax withheld — matching the 1601-EQ layout.
- I can record the remittance payment (Outgoing Payment to BIR as vendor) linked to the filing, which posts Dr EWT Payable / Cr Bank.
- The BIR remittance schedule from Settings > Accounting & Tax > Withholding Forms drives due date warnings.
- Philippine context: separate runs for EWT (0619-E monthly, 1601-EQ quarterly) and FWT (0619-F monthly, 1601-FQ quarterly).

---

## 12. Factoring (Accounts Receivable Financing)

**US-BNK-110**
As a finance manager, I want to sell a batch of AR invoices to a factoring company so that we receive early cash against our receivables, at a discount.

**Acceptance criteria:**
- I can select open AR invoices assigned to a partner whose factoring company is set (e.g. First Metro Factors Inc., BDO Factoring).
- The factoring transaction records: face value of invoices sold, advance rate (%), factoring fee, and net advance received.
- Posting creates a journal entry: Dr Bank (advance) + Dr Factoring Fee (expense) / Cr Accounts Receivable.
- The sold invoices are marked as factored and no longer appear in the standard collections workflow.
- When the factoring company collects from the customer, the reserve amount (face value less advance) is remitted back and a final settlement entry is posted.

---

**US-BNK-111**
As a finance manager, I want to see all factored receivables and their settlement status so that I can track the reserve balance owed back to us by the factoring company.

**Acceptance criteria:**
- A factoring register lists all sold invoice batches with: factoring company, face value, advance received, fee, reserve, and status (Advanced, Collected, Settled).
- The outstanding reserve balance per factoring company is shown.
- I can record the reserve remittance when the factoring company pays it back.

---

## 13. Interbank Transfers

**US-BNK-120**
As a bookkeeper, I want to record a transfer of funds between two of the company's own bank accounts so that both account balances are updated and a journal entry is created.

**Acceptance criteria:**
- I can create an interbank transfer with: from-account, to-account, amount, transfer date, and reference (e.g. InstaPay ref. no.).
- The journal entry posts: Dr To-Account / Cr From-Account.
- Both accounts must be house bank accounts in the same company.
- For transfers between currencies (e.g. PHP to USD), the exchange rate and converted amount are recorded, and any exchange gain/loss posts to the forex accounts.
- Statuses: Draft → Posted → Cancelled.

---

## 14. Banking Insights

**US-BNK-130**
As a finance manager, I want a cash position dashboard that shows the current balance of every house bank account so that I have an instant view of available funds.

**Acceptance criteria:**
- The dashboard shows each house bank account with: account name, bank, currency, G/L balance as of today.
- PHP-equivalent totals are shown for foreign-currency accounts using the latest exchange rate.
- A combined total in PHP is shown at the bottom.
- Clicking an account navigates to its ledger / bank reconciliation.

---

**US-BNK-131**
As a finance manager, I want a cash flow forecast for the next 30/60/90 days based on open receivables and payables, so that I can anticipate shortfalls before they happen.

**Acceptance criteria:**
- Inflows are derived from: open AR invoices by due date, expected PDC maturities, and scheduled payment order receipts.
- Outflows are derived from: open AP invoices by due date, scheduled payment orders, and BIR remittance due dates.
- The forecast shows a daily or weekly net cash position graph.
- I can switch between PHP and USD views.

---

**US-BNK-132**
As a finance manager, I want an outstanding checks report that lists all issued checks not yet cleared in the bank reconciliation, so that I can follow up on long-outstanding items.

**Acceptance criteria:**
- The report lists checks by bank account, sorted by issue date ascending (oldest first).
- Columns: check number, payee, issue date, due date, amount, days outstanding.
- Checks outstanding more than 90 days are highlighted.
- The total outstanding per bank account is shown.

---

## 15. Bank Statement Import

**US-BNK-140**
As a bookkeeper, I want to import a bank statement CSV exported from the bank's online portal so that I do not have to key in statement lines manually during reconciliation.

**Acceptance criteria:**
- I can upload a CSV file on the Bank Reconciliation screen.
- The import maps columns: date, description, debit, credit, running balance.
- A preview shows the parsed lines before import; I can correct any mapping errors.
- Duplicate lines (same date, amount, and description already in the statement) are flagged and skipped.
- Supported format: standard BDO/BPI/Metrobank online banking CSV export.

---

## 16. EFT Batch File Generation

**US-BNK-150**
As an AP manager, I want to generate an InstaPay or PESONet batch payment file from a payment order run so that I can upload it directly to the bank's online portal without re-keying each transfer.

**Acceptance criteria:**
- After executing a payment order run with "Bank transfer" as the payment means, I can export a batch file.
- The file includes: beneficiary name, beneficiary account number, beneficiary bank, amount, currency, reference, and remarks.
- I can choose between InstaPay (per-transaction, real-time) and PESONet (batch, next-day) as the rail.
- The export format matches the template required by the selected house bank (BDO, BPI, Metrobank).
- Once the file is exported, the payment order run is marked as "File generated"; the payments remain in Draft until I confirm remittance and post them.
