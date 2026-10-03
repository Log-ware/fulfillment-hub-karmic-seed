# Fulfillment Hub

A simple internal tool for XYZ's fulfillment team. It replaces the order spreadsheet and shared folder with one screen that answers a single question:

> **What needs attention right now?**

Built for the Karmic Seed Operations Analyst take-home. It runs locally with sample data. No real store, courier or inventory system is connected.

---

## The problem as I understood it

XYZ ships 200–300 orders a day through six steps: **order received → processed (office creates label) → picking → packing → staging → courier pickup**. Stock is split between a Main warehouse (the only one that ships) and a nearby Secondary warehouse.

The seven pain points in the brief come from **one root cause**: the spreadsheet only knows what someone last typed into it. Nobody sees a delay until a customer complains. Nobody connects "shelf A-02 is empty" to "this priority order will miss the 15:30 truck". When problems get fixed, nothing is written down.

So the app doesn't try to be a WMS. It **reads the order, stock and pickup data and works out what's wrong**, then gives each problem a clear next step with one obvious button.

## What I chose to solve (and why)

Three practical questions shaped the scope:

- Does this problem risk a missed or wrong shipment?
- Can a small team (1–2 people in the office, 2–3 in the warehouse) act on it directly?
- Can it be made visible and actionable on one screen?

All seven problems in the brief pass these questions, so each one gets a simple, direct response:

| Brief's problem | What the app does | Why it's in scope |
|---|---|---|
| Can't see order status at a glance; delays go unnoticed | **Dashboard "Needs attention"** list, worked out from deadlines, stage, stock and pickups. It flags late orders, orders at risk of missing their pickup, and orders with **no progress for 2h+** | This is the core problem. If people can see the problem, the team can usually fix it |
| Priority orders get mixed in and miss deadlines | Priority orders are marked in yellow everywhere and sorted first. Risk is **calculated** (time left vs. typical work left), not a manual flag | Missed same-day orders cost money and marketplace ratings |
| Stock in the sheet isn't actually there | Stock is **reserved per order** from Main only. Orders that can't be reserved are **Blocked**, with a **Secondary → Main transfer** (request → arrived). Pickers can report **"Not on shelf?"**, which corrects the count and logs an exception | The two-warehouse split is a hidden cause of "can't pack it" |
| Wrong product/variant shipped | **Packing station**: scan or type each SKU. Wrong item or wrong quantity is rejected. "Mark as packed" stays locked until everything matches **and** a label exists | A wrong item means a return, a reship and an unhappy customer, and it's cheap to catch at the bench |
| Boxes misplaced; courier misses pickup | **Staging & Pickup**: one lane per courier pickup. Shows boxes packed but not in a lane, plus missing boxes. Handover means counting the boxes in the lane. Missed pickups → **relabel and move to another pickup** | The last step is where finished work gets lost |
| Problems handled informally and forgotten | **Exceptions**: every exception has an owner and stays open until someone writes down the fix. Some are **logged automatically** (wrong item scanned, shelf count wrong, box not in lane). Some close themselves when the fixing action happens (label created, box found, pickup rebooked) | Writing down problems and fixes stops the same mistakes from repeating |

**What I left out on purpose:** inbound receiving (the brief mentions that deliveries are unloaded, checked and shelved, but doesn't list it as a problem), courier rate comparison, analytics charts, user accounts, returns, and automatic courier/marketplace integrations. Each is real work, but none is behind the failures listed in the brief. Adding them would make the tool harder for a warehouse team that isn't comfortable with technology.

## Screens

1. **Dashboard**: six KPIs (all calculated, all clickable). A ranked **Needs attention** list with a plain-language next step for each item, today's courier pickups, and a count of orders at each stage.
2. **Orders**: searchable (order, customer, SKU, tracking) and filterable by status, priority and issue. Click any order for its detail page: a **Next step** card with one main button, the deadline and courier pickup (lane, label, box) in the header, line items with stock at Main/Secondary, exceptions for the order, and the full timeline.
3. **Packing**: the queue (priority first) plus a scan-and-check station with big text for warehouse use.
4. **Inventory**: stock that is blocking orders, shown as cards with the transfer action. Also today's transfers and the full stock table (Main, Secondary, Reserved, Available, Open demand, Status).
5. **Staging & Pickup**: one card per courier pickup, with lane, box list and handover/rebook actions.
6. **Exceptions**: open/resolved exceptions with owner, filters, log an exception, resolve with a short note on what was done.

## Main workflows

- **Office:** create label (suggests a courier pickup that makes the ship-by time: fastest for priority orders, cheapest for standard) → send to warehouse.
- **Inventory block:** order blocked → request transfer from Secondary → "Stock arrived – put on shelf" → stock is re-reserved and the order is unblocked automatically.
- **Picking:** "All items picked" (refused if stock isn't reserved) or "Not on shelf?" (corrects stock, logs an exception, may block the order).
- **Packing:** scan each item → wrong variant/item rejected and logged → mark packed (deducts stock) → "Box is in Lane A".
- **Pickup:** courier arrives → count boxes in lane → hand over (orders become Shipped). Missed pickup → relabel and move boxes to a later pickup.
- **Exceptions:** log → owner → resolve with what was done.

## Rules (all in `src/logic/derive.ts`)

The numbers below are prototype assumptions (see the next section), kept as named constants at the top of the file so they are easy to change.

- **Statuses**: people move orders through the stored stages (Processing, Picking, Packing, Packed, Staged, Shipped). **Blocked** and **Exception** are *worked out* from stock and open exceptions, so they can't go stale.
- **Stock reservation**: Main stock is reserved for orders not yet packed, in this order: orders further along first, then priority orders, then earliest ship-by. Available = Main − Reserved. Recalculated after every change.
- **Risk**: work left = typical minutes per remaining step (label 20, pick 25, pack 15, stage 5, +30 if stock must come from Secondary). The deadline is the courier pickup time (or ship-by if not booked). **At risk** if spare time < 15 min, or if the order can't be filled at all. **Late** if past ship-by or the pickup was missed. Priority orders within 90 min are **Due soon**.
- **No progress**: order in an active step with no update for 2 hours.

## Sample data

`src/data/seed.ts` describes one realistic day, with the same data every time. The demo clock starts at **14:10**. It includes 36 orders (31 received today, 5 yesterday), 19 SKUs across two warehouses, 4 couriers and 5 pickups, and 5 exceptions. The cases are deliberate: a priority order blocked by stock that sits in Secondary, an order with no stock in either warehouse, a late order from yesterday that nobody processed, a priority order at packing with no label, a missed QuickShip pickup, a missing box, an order with no progress for 2h, a stock-count mismatch, and finished, staged and shipped orders.

The **Demo time** control in the sidebar (+15 min) moves the clock forward so you can watch deadlines approach and pickups get missed. **Reset data** restores the original day. Changes are saved in the browser (localStorage), so a page refresh keeps your progress.

## Run it locally

Requires Node.js 18+.

```bash
npm install
npm run dev        # open http://localhost:5173
```

Other commands:

```bash
npm test           # 12 unit tests on the stock, risk and workflow rules (Vitest)
npm run build      # type-check + production build into dist/
npm run e2e        # browser walkthrough of all workflows (needs the dev server running and Chrome installed;
                   # or set CHROME_PATH=/path/to/chrome)
```

## Technology

React 18 + TypeScript + Vite, React Router (hash routing), plain CSS, IBM Plex fonts bundled locally. All state lives in a single reducer (`src/store.tsx`). Everything shown on screen is calculated from that state in `src/logic/derive.ts`. There is no backend, by design: this is a prototype for testing the workflow, and a shared database would be the first step towards production.

```
src/
  data/seed.ts        sample day (products, stock, couriers, pickups, orders, exceptions)
  logic/derive.ts     stock reservation, status, risk, next action, needs-attention ranking, KPIs
  logic/format.ts     time formatting
  logic/logic.test.ts unit tests
  store.tsx           actions (create label, transfer, pack, stage, collect, log/resolve exception…)
  pages/              Dashboard, Orders, OrderDetail, Packing, Inventory, Pickups, Exceptions
  components/         status pills, modals, transfer / label / exception forms
scripts/              Playwright end-to-end scripts
```

## Use of AI

I used AI tools to speed up implementation and testing. Claude (Anthropic), in Cowork mode, was the main coding assistant. I also used ChatGPT briefly to think through the assignment and structure my instructions.

I defined the focus and scope: a dashboard that answers "what needs attention right now?", kept simple for warehouse staff. Claude implemented the app, generated the sample data, built the workflow details and ran the tests. I reviewed each iteration, asked for changes where needed, and made the final decisions about the scope and the submission. More detail is in `docs/AI_USAGE_NOTE.md`.

## Prototype assumptions

The brief gives no historical timing data, so the prototype uses simple illustrative rules. **None of these values came from Karmic Seed.** With real order history they should be replaced by measured values.

- **Work-time estimates per step**: label 20 min, pick 25, pack 15, stage 5, plus 30 when stock must come from Secondary.
- **"At risk"** when less than **15 minutes** of spare time remains before the courier pickup.
- **"No progress"** when an order in an active step has had no update for **2 hours**.
- **"Due soon"** for priority orders within **90 minutes** of their deadline; **"Low"** stock when 2 or fewer units are available at Main.
- **Two-step stock transfer** (request → stock arrived and put on the shelf at Main). The brief says orders only ship from Main and stock sometimes has to be moved over before it can be picked, so stock that is still on its way is not treated as pickable.
- **Smaller sample day.** The data has about 30 orders rather than the real 200–300 per day, so the five-minute demo stays readable. Every count and rule is calculated from whatever data is loaded; nothing depends on the sample size.
- Each courier has one fixed pickup time today and its own staging lane. Priority means it must ship the same day.
- Labels and tracking numbers are simulated. In real use the office would still create labels in the courier's portal and record the result here.
- Courier prices are shown in ₹ for illustration only.

## Known limitations

- Single browser, no shared database: two people can't use it at the same time yet.
- No barcode scanner was connected or tested. The packing input takes a typed SKU followed by Enter, which is how many USB scanners send codes, but that is untested here.
- Work-time estimates and thresholds are fixed illustrative values (see Prototype assumptions).
- No real store, marketplace or courier system is connected; all data is sample data.
- Desktop-first. It works at phone width, but the packing station is designed for a bench screen or tablet.
- Not deployed. Run it locally with the steps above.
