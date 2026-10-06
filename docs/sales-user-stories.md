# Sales — User Stories

## 1. Sales Settings

**US-SAL-001**
As a sales manager, I want to configure sales document series so that Sales Orders, Deliveries, and Invoices are numbered consistently by document type and customer segment.

**Acceptance criteria:**
- I can define multiple series per document type (e.g. Primary 410001, Government 470001) with a name, starting number, and prefix.
- The active series is selectable on each document header; the number is assigned on save.
- I can set a default series per document type.

---

**US-SAL-002**
As a sales manager, I want to configure global sales behavior (credit limit enforcement, freight in documents, partial delivery default, gross profit warning) so that the system matches our business rules without custom code.

**Acceptance criteria:**
- Credit limit check can be toggled on or off; when on, saving a sales order over the customer's limit shows a warning before allowing override.
- Freight management can be toggled; when off, the freight row is hidden from all sales documents.
- I can set the default "Allow partial delivery" value that new customers and orders inherit.
- I can set a gross profit warning threshold (e.g. warn when GP% falls below 10%).
- I can set default payment terms and payment method for new customers and orders.

---

## 2. Pricing

**US-SAL-010**
As a pricing manager, I want to create and maintain price lists so that different customer segments (Retail, Wholesale, Government, SRP) are charged the correct prices.

**Acceptance criteria:**
- I can create a price list with a name, base currency, rounding rule, and an optional validity date range.
- Each price list entry links an item to a unit price in the list's currency; I can set it per UoM.
- I can mark a price list inactive to hide it from new documents without losing the historical prices.
- When a sales order line picks a price list, the unit price updates to match; switching back restores it.

---

**US-SAL-011**
As a pricing manager, I want to set special prices per customer and item so that contract customers automatically get their negotiated price without manual override.

**Acceptance criteria:**
- A special price links a customer (or customer group), an item, and a price or discount %, with optional validity dates and minimum quantity.
- When a sales order line is priced, special prices are checked first; the Price Source field shows "Special price" when applied.
- Expired special prices are ignored; the price list price is used instead.
- I can view all special prices for a customer from the customer record.

---

**US-SAL-012**
As a pricing manager, I want to configure discount groups so that trade customers in a group automatically receive the correct item-group discount.

**Acceptance criteria:**
- A discount group defines a matrix of customer group × item group → discount %.
- When a sales order line is priced, the discount group is checked after special prices; Price Source shows "Discount group [name]".
- I can assign a customer to a discount group on the customer record.
- Multiple discount groups can coexist; the system applies the one assigned to the customer.

---

**US-SAL-013**
As a pricing manager, I want to set period and volume discounts so that promotional pricing and bulk-buy incentives apply automatically during a campaign.

**Acceptance criteria:**
- A period discount applies to an item (or item group) within a date range and an optional minimum quantity.
- A volume discount applies a higher discount % once quantity exceeds a threshold (e.g. 5% off 10+, 10% off 50+).
- When a line qualifies, Price Source shows "Period discount [%]" or "Volume discount [%]".
- Discounts outside their validity dates or below their minimum qty are ignored automatically.

---

**US-SAL-014**
As a sales manager, I want a price approval workflow so that lines manually priced below a gross profit floor require manager sign-off before the order can be placed.

**Acceptance criteria:**
- I can set a minimum GP% threshold in Sales Settings; lines below it are flagged on the order.
- An order with flagged lines can be saved as Draft but not confirmed until an authorized approver approves it.
- The approver sees the GP% on each flagged line and can approve or reject with a comment.
- Once approved, the order can be confirmed; if rejected, it returns to Draft with the comment shown.

---

## 3. Quotations

**US-SAL-020**
As a sales representative, I want to create a quotation for a customer so that I can present a priced offer before committing stock or raising an order.

**Acceptance criteria:**
- A quotation has the same line structure as a sales order (item, qty, price list, unit price, discount %, tax code) but does not commit stock.
- I can set a validity date; expired quotations are flagged in the list and cannot be copied to an order.
- Status lifecycle: Draft → Open → Accepted / Declined / Expired.
- I can print or export the quotation as a PDF to send to the customer.

---

**US-SAL-021**
As a sales representative, I want to copy an accepted quotation to a sales order so that I don't re-enter the lines, prices, and customer details.

**Acceptance criteria:**
- A "Copy to Sales Order" action on an Open quotation creates a new sales order pre-filled with all header and line data from the quotation.
- The quotation status changes to Accepted and links to the resulting sales order.
- Lines from the quotation that the customer did not accept can be removed before saving the order.
- Copying a quotation more than once is allowed but shows a warning that a sales order already exists for it.

---

## 4. Sales Orders

**US-SAL-030**
As a sales representative, I want to create a sales order for a customer so that the committed stock is reserved and the fulfillment process can begin.

**Acceptance criteria:**
- Picking a customer fills currency, payment terms, ship-to/bill-to addresses, price list, sales employee, and allow partial delivery from the customer record.
- I can switch between Item and Service document types; Item orders reserve warehouse stock, Service orders post amounts directly to revenue accounts.
- Each item line shows available stock in the selected warehouse; a warning is shown when the open quantity exceeds what is available.
- Open lines commit the warehouse stock; confirming, closing, or cancelling the order adjusts the committed quantity accordingly.
- I can save as Draft (no stock commitment, no number assigned) or confirm as Open.

---

**US-SAL-031**
As a sales representative, I want the system to check the customer's credit limit when I confirm a sales order so that I am warned before taking an order that exceeds their approved credit.

**Acceptance criteria:**
- When credit limit check is enabled and the customer has a limit, the header shows their current open balance and the impact of this order.
- Confirming an order that would take the customer over their limit shows a warning; I can save anyway with a second confirmation.
- The open balance includes all other Open sales orders for the same customer, valued in PHP.

---

**US-SAL-032**
As a sales representative, I want to copy a sales order to a delivery or A/R invoice so that I don't need to re-enter lines that are already committed.

**Acceptance criteria:**
- "Copy to Delivery" is available on Open item orders with at least one line with open quantity.
- "Copy to A/R Invoice" is available on Open orders with at least one open line (item or service).
- Copied lines carry their item, quantity, unit price, discount %, tax code, and warehouse; the delivery or invoice date defaults to today.
- Only open-quantity lines are copied; fully delivered or closed lines are excluded.

---

**US-SAL-033**
As a sales representative, I want to duplicate a sales order so that I can re-use the customer, lines, and pricing as a starting point for a repeat order.

**Acceptance criteria:**
- "Duplicate" creates a new Draft order with today's date, blank customer reference, and zero delivered quantities.
- Prices are carried over but marked with the original price source; the user can reprice before confirming.
- The duplicate does not commit stock until it is confirmed.

---

**US-SAL-034**
As a sales manager, I want to close or cancel a sales order so that committed stock is released and the order no longer appears in the open backlog.

**Acceptance criteria:**
- "Close" is available on any Open order; it closes all open lines and releases their committed stock regardless of delivered quantity.
- "Cancel" is available on Open orders with no deliveries; it voids the order and releases all committed stock.
- Closed and Cancelled orders are read-only; only remarks and attachments can be changed.
- The close date is recorded on the order.

---

## 5. Sales Order Approval Workflow

**US-SAL-040**
As a sales manager, I want orders above a value threshold or with manually overridden prices to require approval before fulfillment begins so that no unauthorized commitment leaves the company.

**Acceptance criteria:**
- I can configure an approval threshold in Sales Settings (e.g. orders above PHP 500,000 require approval).
- Orders with a manually priced line or a total above the threshold are saved as "Pending Approval" and cannot be copied to a delivery or invoice until approved.
- The approver sees the order in an "Awaiting approval" queue with the reason flagged (over threshold, manual price, over credit limit).
- Approving the order moves it to Open and notifies the sales representative.
- Rejecting returns it to Draft with a mandatory rejection comment visible on the order.

---

**US-SAL-041**
As a sales representative, I want to see the approval status of my orders so that I know which are waiting and which are ready to fulfil.

**Acceptance criteria:**
- The sales order list shows an Approval Status column: Approved, Pending, Rejected.
- Pending and Rejected orders are grouped at the top of the list by default.
- A rejected order shows the rejection comment in the header; I can edit and resubmit it for approval.
- Approved orders that are subsequently edited (price or qty change) revert to Pending Approval automatically.

---

## 6. Deliveries

**US-SAL-050**
As a warehouse staff member, I want to create a delivery note from a sales order so that the correct items are picked, packed, and dispatched to the customer.

**Acceptance criteria:**
- Copying from a sales order fills customer, ship-to address, and all open-quantity lines automatically.
- Each line shows the available stock in the selected warehouse; shipping more than available is blocked on posting.
- Serial-number-managed items must ship in whole inventory units.
- Posting the delivery reduces On Hand stock in the warehouse and updates the sales order's delivered quantity per line.
- Status lifecycle: Draft → Open → Closed / Cancelled.

---

**US-SAL-051**
As a warehouse manager, I want to cancel a delivery so that the stock movement is reversed and the sales order's open quantities are restored.

**Acceptance criteria:**
- Cancelling a posted delivery reverses the inventory movement (restores On Hand in the warehouse).
- The linked sales order lines have their delivered quantities reduced accordingly; lines that were closed by the delivery are reopened.
- Cancellation is blocked if an A/R invoice has already been raised from this delivery.

---

## 7. A/R Invoices

**US-SAL-060**
As a billing clerk, I want to create an A/R invoice from a delivery or sales order so that the customer is billed for exactly what was shipped or ordered.

**Acceptance criteria:**
- I can copy lines from one or more deliveries, one or more sales orders, or enter them manually.
- Lines copied from a delivery carry the delivered quantity and lock the warehouse; lines from an order use the open quantity.
- The invoice posts a journal entry: Dr Accounts Receivable (control account) / Cr Revenue / Cr Output VAT.
- Customer withholding tax (EWT, government VAT) is shown as informational notes on the invoice totals — it is deducted by the customer when paying and does not reduce the invoice total.
- Status lifecycle: Draft → Open → Closed / Cancelled.

---

**US-SAL-061**
As a billing clerk, I want to split an invoice into installments so that the customer's AR balance is spread across multiple due dates.

**Acceptance criteria:**
- I can enter the number of installments (1 or more) on the Accounting tab; the due dates are split evenly from the base due date.
- Each installment appears as a separate line in the customer's AR aging and payment application screen.
- Payments can be applied to individual installments.

---

## 8. BIR Compliance and Tax

**US-SAL-070**
As a tax accountant, I want A/R invoices to distinguish between a BIR Sales Invoice (for goods) and an Official Receipt (for services) so that the company's documents comply with BIR accreditation requirements.

**Acceptance criteria:**
- Item-type A/R invoices are issued as a Sales Invoice; Service-type invoices are issued as an Official Receipt.
- Each document type has its own BIR-accredited serial number series configured in Sales Settings, separate from the internal ERP document number.
- The printed Sales Invoice or Official Receipt shows the BIR Permit to Use (PTU) number, TIN, and accredited serial number as required by BIR regulations.
- The system warns when the last accredited serial number in a series is approaching exhaustion so that a renewal can be filed with the BIR.

---

**US-SAL-071**
As a tax accountant, I want to record BIR Form 2307 (Certificate of Creditable Withholding Tax) received from customers so that I can reconcile the CWT deducted by customers against our EWT payable balance.

**Acceptance criteria:**
- When a customer withholds CWT on an invoice, I can record the 2307 details: BIR form type, period, amount withheld, and date received.
- The recorded 2307 is linked to the invoice and the incoming payment.
- A 2307 reconciliation report shows total CWT per customer per quarter, matched against the amounts deducted in payments, with unreconciled differences flagged.
- The total creditable withholding tax per quarter feeds into the quarterly income tax return computation.

---

**US-SAL-072**
As a tax accountant, I want the sales module to feed output VAT data into the quarterly BIR VAT return (Form 2550Q) so that I can file without manually summing invoices.

**Acceptance criteria:**
- All posted A/R invoices and credit memos contribute their output VAT amounts to a VAT summary, grouped by tax code (VATable 12%, zero-rated, VAT-exempt).
- A VAT return summary report shows gross sales, exempt sales, zero-rated sales, and output VAT for a selected quarter, matching the 2550Q line items.
- The report flags invoices missing a tax code so they can be corrected before filing.
- The summary can be exported to CSV for cross-checking with the BIR e-Filing system.

---

## 9. Returns and Credits

**US-SAL-080**
As a warehouse staff member, I want to create a sales return so that goods coming back from a customer are received into stock and the customer's balance is reduced.

**Acceptance criteria:**
- A sales return can be created from an A/R invoice or a delivery; lines carry the item, quantity, and original price.
- Posting the return increases On Hand stock in the receiving warehouse and creates a journal entry reversing the original delivery posting.
- The return is linked to the original delivery and invoice in the document flow.
- I can return a partial quantity; the remaining quantity stays on the original document.

---

**US-SAL-081**
As a billing clerk, I want to issue an A/R credit memo so that I can reduce a customer's outstanding balance for an over-charge, price correction, or service credit without returning physical goods.

**Acceptance criteria:**
- A credit memo can reference an original A/R invoice; lines default to the invoice lines and prices.
- Posting creates a journal entry: Dr Revenue / Dr Output VAT / Cr Accounts Receivable.
- The credit memo can be applied to open invoices in the Payments Received screen, reducing the amount due.
- A standalone credit memo (not linked to an invoice) is also allowed for write-offs and adjustments.

---

## 10. Down Payments

**US-SAL-090**
As a billing clerk, I want to request a down payment from a customer before shipping so that the deposit is recorded in AR and offset against the final invoice.

**Acceptance criteria:**
- An A/R down payment request is created against a customer with a requested amount and due date.
- Posting creates a journal entry: Dr Accounts Receivable / Cr Customer Down Payments.
- When the final A/R invoice is created, I can draw down the paid deposit to reduce the amount due.
- The down payment clearing account is reconciled at the time of draw-down.
- The document flow shows the chain: Down Payment Request → Invoice.

---

## 11. Document Printing and PDF Export

**US-SAL-100**
As a sales representative, I want to print or export a sales order confirmation as a PDF so that I can send the customer a formal acknowledgment of their order.

**Acceptance criteria:**
- A "Print / Export PDF" action on any Open or Closed sales order generates a formatted order confirmation with company letterhead, customer details, line items, totals, and payment terms.
- The PDF shows the ship-to address, requested delivery date, and the customer's reference number.
- Draft orders can be printed as a proforma for customer review before confirmation.

---

**US-SAL-101**
As a warehouse staff member, I want to print a delivery note and picking list so that the warehouse can pick, pack, and dispatch the correct items for each shipment.

**Acceptance criteria:**
- A "Print Delivery Note" action generates a PDF showing the customer's ship-to address, all line items with quantity and UoM, and a signature block for proof of delivery.
- A "Print Picking List" action generates a warehouse-facing document showing item codes, descriptions, bin locations, and quantities to pick, grouped by warehouse.
- Both documents show the sales order reference, delivery number, and delivery date.
- Printed documents are stamped with the document number and date of printing.

---

**US-SAL-102**
As a billing clerk, I want to print an Official Receipt or Sales Invoice as a BIR-compliant PDF so that the customer receives a valid tax document and the company fulfils its BIR issuance obligations.

**Acceptance criteria:**
- A "Print Official Receipt / Sales Invoice" action generates a PDF in the BIR-prescribed format: company name, TIN, address, PTU number, accredited serial number, customer TIN, itemized lines with VAT breakdown, and total amount due.
- Zero-rated and VAT-exempt lines are labelled accordingly on the printed document.
- The printout is locked to the posted invoice; it cannot be regenerated with different figures after the invoice is cancelled.
- A reprint is allowed for lost copies and is watermarked "REPRINT" with the reprint date and user.

---

## 12. Payments Received

**US-SAL-110**
As a cashier, I want to record a payment received from a customer and apply it to their open invoices so that the customer's balance is updated and the AR account is cleared.

**Acceptance criteria:**
- I can select a customer and see all their open A/R invoices with balances due.
- I can apply the payment to one or more invoices; partial application is allowed.
- Payment means: cash, check (with check date, number, bank), bank transfer (with reference), e-wallet/InstaPay.
- Posting creates a journal entry: Dr Cash/Bank / Cr Accounts Receivable.
- The applied invoices have their balance reduced; fully paid invoices are marked Closed.

---

**US-SAL-111**
As a cashier, I want to handle payment differences (underpayment or overpayment) so that the AR account is fully cleared even when the customer doesn't pay to the cent.

**Acceptance criteria:**
- A payment difference is shown when the total applied does not equal the payment amount.
- I can write off small differences (within a configurable tolerance) to a write-off account.
- I can leave an underpayment as a short-payment, keeping the residual balance on the invoice.
- An overpayment can be left as a credit on the customer account for application to a future invoice.

---

## 13. Early Payment Discounts

**US-SAL-120**
As a billing clerk, I want to offer an early payment discount on invoices so that customers are incentivized to pay before the net due date.

**Acceptance criteria:**
- I can set a cash discount percentage and a cash discount days window on an invoice (e.g. 2% if paid within 10 days, net 30).
- The cash discount terms print on the invoice and the statement of account.
- When a payment is received within the discount window, the system proposes the discounted amount; accepting it posts the discount to a Sales Discount account.
- If the customer pays the full invoice amount within the discount window, no discount is posted.
- Cash discount days are carried from the payment terms settings and can be overridden per document.

---

## 14. Document Flow

**US-SAL-130**
As a sales representative or accountant, I want to see the full document chain for any sales transaction so that I can trace a payment back to its quotation or an order forward to its invoices without manual searching.

**Acceptance criteria:**
- Every sales document (quotation, sales order, delivery, A/R invoice, credit memo, payment) shows a Document Flow panel listing the linked predecessor and successor documents with their number, date, and status.
- Clicking any document in the flow navigates directly to it.
- A sales order that was partially delivered shows all linked delivery notes; an invoice copied from multiple deliveries shows all of them.
- The flow is read-only and updates automatically as new documents are created in the chain.

---

## 15. Collections and Aging

**US-SAL-140**
As a credit controller, I want to see a customer aging report so that I can identify overdue accounts and prioritize collections.

**Acceptance criteria:**
- The aging report shows each customer's outstanding balance split into buckets: Current, 1–30 days, 31–60 days, 61–90 days, 91+ days.
- Each row links to the customer record and their open invoices.
- I can filter by customer group, sales employee, and territory.
- The report can be exported to CSV or printed as PDF.

---

**US-SAL-141**
As a credit controller, I want to generate a statement of account for a customer so that I can send them a summary of all open transactions and request payment.

**Acceptance criteria:**
- The statement lists all open invoices (with original amount, balance due, and due date) and unapplied credits.
- The total outstanding balance and overdue balance are shown at the bottom.
- The statement is exportable as a formatted PDF with the company's letterhead.
- I can generate statements in bulk for all customers with a balance above a threshold.

---

**US-SAL-142**
As a credit controller, I want to send dunning notices to overdue customers so that I can systematically escalate collection efforts.

**Acceptance criteria:**
- I can configure dunning levels (e.g. Level 1: 7 days overdue — reminder; Level 2: 30 days — formal demand; Level 3: 60 days — final notice).
- Each overdue invoice is assigned a dunning level based on its age; the system shows which invoices are due for a notice.
- I can generate a dunning letter PDF per customer at their current level.
- Sending a dunning notice records the date and level on the invoice; the next level applies after the next interval.

---

## 16. Blanket Agreements

**US-SAL-150**
As a sales manager, I want to create a blanket sales agreement with a customer so that we have a formal record of their committed volume or amount over a period.

**Acceptance criteria:**
- A blanket agreement defines: customer, start and end dates, and either a committed quantity per item or a committed total amount.
- Status lifecycle: Draft → Active → Terminated / Expired.
- Each sales order raised for the customer can be linked to the agreement.
- The agreement shows cumulative ordered quantity/amount vs. the commitment.

---

**US-SAL-151**
As a sales representative, I want the system to warn me when a sales order would exceed the customer's blanket agreement so that I don't over-commit beyond what was contracted.

**Acceptance criteria:**
- When linking a sales order to a blanket agreement, the system checks the remaining commitment.
- If the order would exceed the remaining quantity or amount, a warning is shown before saving.
- The warning is advisory; I can proceed if the customer has approved the overage.
- Orders in excess of the agreement are flagged in the agreement's draw-down detail.

---

## 17. Insights and Reports

**US-SAL-160**
As a sales manager, I want a sales dashboard so that I can see revenue performance, open orders, and delivery status at a glance.

**Acceptance criteria:**
- The dashboard shows: revenue this month vs. last month and vs. target, number of open sales orders, total open order value, and pending deliveries.
- A top-10 customers widget shows revenue ranked by the selected period.
- A top-10 items widget shows units sold ranked by the selected period.
- All widgets are filterable by date range and sales employee.

---

**US-SAL-161**
As a sales manager, I want a sales order backlog report so that I can see which orders are undelivered and how long they have been waiting.

**Acceptance criteria:**
- The backlog lists all Open sales orders with open quantity, showing: order date, delivery date, customer, item, open qty, open amount, and days overdue.
- Orders past their delivery date are highlighted in red.
- I can filter by customer, item group, warehouse, and sales employee.
- The report can be exported to CSV.

---

**US-SAL-162**
As a CFO, I want a gross profit report by customer, item group, and sales employee so that I can evaluate profitability and sales mix.

**Acceptance criteria:**
- The report shows revenue, cost of sales, and gross profit (amount and %) per row.
- I can pivot by customer, item group, item, sales employee, and period.
- Lines manually priced below the GP threshold are highlighted.
- The report can be exported to CSV or PDF.
