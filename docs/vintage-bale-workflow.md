# Vintage bale operations

## Daily workflow

1. Add a supplier in **Suppliers**.
2. In **Bales & stock**, choose **Buy a bale**. Enter supplier, branch, purchase date, cost paid and payment method. A bale ID is assigned automatically.
3. Move the bale to **Laundry**. Every garment goes through laundry and is intended for resale.
4. When washing finishes, record its cost and mark the bale **Ready**.
5. Add price groups (for example 5,000, 7,000 and 10,000 MMK), print as many labels as needed and attach them yourself.
6. In **POS**, select the branch, scan once per garment or change quantity, collect cash/MMQR or make a credit sale to a saved customer, and print the receipt. Sales start directly without shifts or registers.

There is one inventory record per bale, never one per garment. Each reusable barcode identifies the bale and price. Printing copies never changes stock. Existing printed prices stay fixed; create another price group for a different price.

## Saved customers and credit sales

In the checkout modal, search **Saved customer** by name, phone or email. Select **Credit** to leave the sale unpaid, or record an optional cash/MMQR deposit. The remaining amount must fit the customer's available credit. Credit must be active for the customer, and the cashier needs `credit.manage` permission. Repayment terms determine the due date on the receipt.

Use **Add new customer** to save a name, optional phone and address without leaving checkout. The new customer is selected automatically and checkout values are retained. Customers are credit records, with no email, password or customer login. Cashiers with `credit.manage` can set a credit limit and repayment terms when creating the record; a positive limit enables credit sales. Without that permission, only contact details can be created. Existing debt and repayment history stays attached to the same customer.

Cashiers with `pos.discount` can enter a **Discount amount** up to the subtotal. It reduces the checkout total, cash payment required and any credit balance. Receipts show the discount, while printed label prices stay unchanged. Refunds use the discounted amount actually sold.

Credit sales reduce bale stock immediately and appear in bale revenue. Only money collected now goes into the cash ledger; a cash deposit also increases the POS drawer total. Record later repayments against the customer record. Those credit collections stay outside the POS drawer. Interrupted checkouts retain the customer and payment details so retrying the same sale does not add a second debt.

## Garment counts

The total garment count is optional and may be entered when laundry finishes. If counted, every price group draws from the same bale quantity. Overselling is rejected and the final sale finishes the bale automatically. Stock is not allocated to individual price groups.

For an uncounted bale, the system tracks pieces sold and revenue without inventing a remaining quantity. Choose **Finish bale** once everything is sold. Returned garments reopen a finished bale.

## Finance and returns

Purchase and laundry expenses are recorded automatically once. Do not enter them again manually. Use Finance for rent, salaries, utilities and other shop expenses.

The cash ledger shows approved collections, payments and net cash movement across cash and bank/MMQR. Date and branch filters apply to this ledger. Pending cancellation refunds are shown separately until payment is recorded.

Bale results use lifetime net garment revenue minus the full purchase and laundry costs. They are provisional while selling and final before overhead when finished. This is separate from cash movement and excludes shop overhead. Uncounted bales do not use estimated garment costs or artificial stock valuations.

Use a bale's sale history to return garments and record the actual cash or MMQR refund. Returns restore shared stock and reduce net sales. Cancelling a receipt records its remaining refund obligation in Finance; choose **Record refund paid** after paying it. Earlier partial returns are deducted from that obligation.

Sales, collections and refunds are recorded against their branch, cashier and payment method. Historical register and shift references remain attached to earlier records.

In checkout, tick **Online sale** and select or add a customer. Online sales begin as **Not delivered**; Orders shows an **Online** label and a single **Mark delivered** action. **Mark not delivered** corrects mistakes. In-store sales complete immediately, and cancelled sales show Cancelled. Payment status and outstanding credit are independent of delivery. The migration replaces the retired processing/shipped workflow while preserving historical delivery information and financial totals.

## Access and historical records

Branch assignments restrict bales, stock, POS, finance and exports. `inventory.receive` manages suppliers, purchases and laundry; `catalog.manage` creates price groups; `pos.access` sells and prints receipts; `orders.returns` processes garment refunds; `manage_finance` manages expenses and pending refunds. Bale read access is also needed to open its return screen.

The legacy `/admin/products` catalog, editor, import/export and product barcode routes have been removed. Bale purchases and reusable price labels replace those screens. Historical products, orders, movements and accounting records are retained. New operations start in Bales & stock. Legacy stock receipts, adjustments and transfers cannot modify bale stock. Correct completed bale sales using returns and a new sale so receipt history stays intact.

## Setup and verification

Run `php artisan migrate` and `npm run build`. The customer-record migration allows customer records without login credentials while preserving staff authentication and existing financial links. The migration adds the bale workflow without converting or erasing existing product records.

Run `php artisan test --compact --filter=VintageBaleWorkflowTest` for integration checks. The real browser scenario uses `scripts/prepare-bale-browser-test.php` and `scripts/verify-bale-workflow.cjs`, a separate `music_store_testing` database and loopback port 8127. Preparation refuses production databases. Screenshots and a sample label PDF are saved in `artifacts/bale-workflow/`.
