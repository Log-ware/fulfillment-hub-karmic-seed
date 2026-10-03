# AI usage note

## Tools and how I used them

I used two AI tools, for different jobs.

- **ChatGPT** helped me understand the assignment and think through the product approach. It also helped me structure the instructions I gave Claude, and review the resulting application and documentation.
- **Claude (Anthropic)**, in Cowork mode, was the coding agent. It read the assignment PDF, built the React + TypeScript application, generated the sample data, and implemented the detailed workflow logic. It also ran the unit and browser tests and made the code and UI fixes that came out of each review.

My instructions to Claude set the problems to focus on and the scope. That included the question the home screen must answer ("what needs attention right now?"), plain language for a warehouse team that isn't comfortable with technology, and what to leave out (logins, a backend, real courier APIs, unnecessary charts). Claude proposed the implementation details within that scope. I reviewed the output after each round and directed the next one, including asking it to stop adding features once the core workflow worked.

## Where I changed an AI suggestion

**1. How the timing assumptions were presented.** To calculate whether an order is "at risk", Claude chose specific values. These were a 15-minute safety margin, a 2-hour "no progress" alert, and fixed durations for each step. The README presented them as rules, and one line called them my operational decisions. I had no real XYZ timing data, and the brief doesn't provide any. So I decided they had to be documented explicitly as illustrative prototype assumptions, not as Karmic Seed requirements or measured facts. I kept the timing logic itself for the demo, because a prototype needs some rule to show risk. What I changed is how those values are described.

**2. How the AI's role was described.** Claude's first draft of this note said the AI "planned the data model and rules". That overstated its role. The problems to focus on and the scope boundaries came from my brief; Claude proposed the implementation details within them. I had the note rewritten to keep that distinction clear.

## Changed during review passes (not disagreements)

These came out of review and testing rounds, not from me overruling a specific suggestion:

- **Over-count scans:** these are now blocked at the packing bench instead of being logged as exceptions, since an over-count doesn't mean anything is wrong on the shelf.
- **"Blocked" next to "On track":** an order could show both. The "On track" tag is now hidden on blocked or held orders.
- **Dashboard wording:** the priority tile could say all priority orders were "on track" while one still had no label. It now shows how many are at risk or due soon.
- **Repeated information:** duplicate details on the order page were removed.

Testing also caught bugs, which were fixed:

- Two quick filter changes on the Orders page could undo each other.
- The items table overlapped a button.
- A button was clipped at laptop width.
