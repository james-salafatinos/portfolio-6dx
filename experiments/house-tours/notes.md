# House Tours

## Idea
A pocket notebook for walking open houses. Stops stay in itinerary order. Ratings, notes, and photos stay in this browser — nothing is uploaded.

## Controls / behavior
Open https://vec3.me/x/house-tours (locally, `/x/house-tours`).

- Home is `#/`. The first visit with an empty `house-tours-v1` localStorage key seeds three Chicago-area stops so the page is usable immediately.
- Each card shows the address, open-house time, asking price, and a thumbnail (or a placeholder). **Open Notes** goes to `#/note/:id`.
- Add, edit, or remove a stop from home. Removing a stop deletes its notes. That is the whole address book — not a CRM.
- The note page is large tap targets and textareas: overall impression, pros, cons, must-fix issues, neighborhood/lot, kitchen, bedrooms/bathrooms, basement, and commute/location. Notes autosave on change.
- Rate House, Location, Yard, Layout, Condition, and Value from 1 to 5 with big buttons. Pick one of Love it / Maybe / No. Answer whether you would make an offer (Yes / No / Unsure).
- Camera uses a file input with `capture`. Library is a second photo input. Images are resized to JPEG before they are stored. Hard cap: 8 photos total. A photo is skipped if the saved document would pass about 2MB. Photos never leave the device.
- After a stop has notes, its card shows Love it / Maybe / No (when set) and a short score line (House and Value, plus any other scores you set).
- Home ends with a horizontal comparison of every stop: address, status, the 1–5 scores, and would-offer. Swipe sideways on a phone; five stops stay comparable.

Clearing site data for this origin clears the tour. The page leaves about 72px at the top so the title sits below the site back link and notes button.
