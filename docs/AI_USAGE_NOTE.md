# AI usage note

## Tools and how I used them

I used AI tools to speed up implementation and testing. Claude (Anthropic), in Cowork mode, was the main coding assistant. I also used ChatGPT briefly to think through the assignment and structure my instructions.

My role was to understand the fulfillment problem, define the focus and scope, review the proposed implementation, and direct the iterations. The main question I wanted the dashboard to answer was "what needs attention right now?" I also decided the app should stay simple for warehouse staff and focus on six things: order visibility, priority orders, inventory blockages, packing verification, staging/pickup, and exception tracking.

Claude implemented the React + TypeScript application, generated the sample data, built the workflow details, and ran the unit and browser tests. I reviewed the app after each iteration and asked for changes where needed.

## Where I changed an AI suggestion

**1. Timing assumptions.** Claude added a 15-minute safety margin, a 2-hour "no progress" threshold and fixed step durations so the prototype could show which orders are at risk. At first the README just listed these as rules. When a review pass flagged them, I noticed the brief doesn't give any real timing data. So I kept the values for the demo, but had them documented as illustrative prototype assumptions instead of something that looks like a Karmic Seed requirement or a measured fact.

**2. How the AI's role was described.** The first draft of this note said the AI "planned the data model and rules". I changed that because it overstated the AI's role. My instructions defined the problems and the scope, and Claude handled the implementation details.

## Review and testing fixes

Review and testing rounds also led to several fixes. These weren't disagreements, just things that needed correcting:

- over-count scans at packing are now blocked instead of logged as exceptions
- an order can no longer show "Blocked" and "On track" at the same time
- misleading dashboard wording about priority orders was corrected
- duplicate order details were removed
- a filter bug was fixed
- two layout/button issues were fixed

AI helped speed up the implementation and testing, but I reviewed the output and made the final decisions about the scope and the submission.
