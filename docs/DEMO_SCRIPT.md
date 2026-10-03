# 5-minute walkthrough – one afternoon at XYZ

**Before recording:** `npm run dev`, open http://localhost:5173, click **Reset data** in the sidebar. The demo clock reads **14:10**.

The demo follows one story: **priority order ORD-24817 (Ananya Krishnan, Amazon) has to make the 15:30 Rapid Express pickup.**

---

**0:00–0:40 · The problem (talk over the Dashboard)**
"XYZ runs fulfillment from a spreadsheet and a shared folder. Every problem in the brief has the same cause: the sheet only knows what someone last typed in. So delays, empty shelves and missed pickups stay hidden until it's too late. I didn't build a big system. I built one screen that answers *what needs attention right now*, plus the handful of actions needed to fix what it shows."

**0:40–1:20 · Dashboard**
- Point at the KPIs: "Every number is calculated from the data, and every tile is clickable."
- Point at **Needs attention**: "It's ranked. First a late order from *yesterday* that nobody processed. Then a courier that never turned up. Third, our priority order. The app says it **may miss its pickup**, and it worked that out itself: 80 minutes left, about 75 minutes of work including fetching stock."

**1:20–2:10 · Priority order → inventory block → transfer**
- Click **Open order** on ORD-24817. "Status *Blocked*, risk *At risk*. The Next step box says what to do in plain words: bring 2 × SHOE-RED-42 from Secondary."
- "Main has 0, Secondary has 4, and 2 orders are waiting for it. That's this one and a standard order."
- Click **Request transfer** → "now it's *on the way*. A van isn't a shelf, so it stays blocked until the stock arrives."
- Click **Stock arrived – put on shelf** → status flips to **Picking**, risk to **Due soon**, and the timeline records it.
- (Optional: open **Inventory** to show Main 2 / Secondary 2 and the transfer log.)

**2:10–3:10 · Pick and pack with verification**
- **All items picked – send to packing** → **Open packing station**.
- "Big text, one input, made for a warehouse bench. Type or scan the SKU."
- Type `SOCK-WHT-3P` → green **Correct**.
- Type `SHOE-RED-43` → red **Wrong size or color – do not pack**. "This is the classic mistake: right shoe, wrong size, next shelf. It's blocked here and logged automatically, so someone checks the shelf."
- Type `SHOE-RED-42` → **Mark as packed** unlocks → click it → **Done – box is in Lane A**.

**3:10–3:50 · Staging & pickup**
- Open **Staging & Pickup**. "One card per courier pickup, one lane each. BX-24817 is in Lane A, Rapid Express collects in 1h 20m. When the driver arrives, the team counts the boxes in the lane before handing over."
- Point at the yellow banner: "a packed box that isn't in a lane yet." Point at the QuickShip card: "this courier missed 12:30. One click relabels the boxes and moves them to a later pickup." Point at BX-24760 marked **Missing**: "if a box isn't in its lane at the check, it's flagged before the courier arrives, not after." (Don't click it, so the end-of-demo counts below stay as stated.)

**3:50–4:25 · Exceptions**
- Open **Exceptions**. "The wrong-size scan from a minute ago is here with an owner. **Resolve** asks *what was done*: 'SHOE-RED-43 was in bin A-02, moved back.' That written fix is what stops the problem coming back."
- Back to **Dashboard**: *Blocked by stock* 3 → 1 (the transfer freed both waiting orders), ORD-24817 gone from Needs attention, *Ready for pickup* 7 → 8. *Open exceptions* is back to 4: one was logged at packing and one resolved.

**4:25–5:00 · Why these choices**
- "I focused on the moments where an order is *lost*: hidden delays, stock in the wrong building, wrong item in the box, box not in its lane, problems nobody wrote down."
- "Statuses like *Blocked* and *At risk* are worked out from the data, never typed, so they can't go stale."
- "I left out receiving, charts, accounts and integrations on purpose. With a shared database, this could be trialled on one packing bench next week."
- Optional, only if there's time left (both change the counts above): click **Courier is here – hand over** on the 15:30 card to show the box count, or click **+15 min** a few times to watch the 15:30 pickup approach and turn red.
