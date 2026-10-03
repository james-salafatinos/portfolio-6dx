# House Tours

## Idea
A pocket notebook for walking open houses. Stops stay in itinerary order. Ratings, notes, and photos stay in this browser — nothing is uploaded.

## Controls / behavior
Open https://vec3.me/x/house-tours (locally, `/x/house-tours`).

- Home is `#/`. The first visit with an empty `house-tours-v2` localStorage key seeds five Saturday, October 3, 2026 open houses, in itinerary order: 109 Grove Ave (Glen Ellyn), 250 Knoll St (Wheaton), 841 Bloomingdale Rd (Glen Ellyn), 83 N Park Blvd (Glen Ellyn), and 1525 W Wiesbrook Rd (Wheaton). The older `house-tours-v1` demo key is unused and is not migrated.
- Each card shows the address, the Saturday open-house window, asking price, beds/baths/sqft, a listing thumbnail, and a Zillow link. **Open Notes** goes to `#/note/:id`.
- Add, edit, or remove a stop from home. Removing a stop deletes its notes. That is the whole address book — not a CRM.
- The note page is large tap targets and textareas: overall impression, pros, cons, must-fix issues, neighborhood/lot, kitchen, bedrooms/bathrooms, basement, and commute/location. Notes autosave on change.
- Rate House, Location, Yard, Layout, Condition, and Value from 1 to 5 with big buttons. Pick one of Love it / Maybe / No. Answer whether you would make an offer (Yes / No / Unsure).
- Camera uses a file input with `capture`. Library is a second photo input. Images are resized to JPEG before they are stored. Hard cap: 8 photos total. A photo is skipped if the saved document would pass about 2MB. Photos never leave the device.
- After a stop has notes, its card shows Love it / Maybe / No (when set) and a short score line (House and Value, plus any other scores you set).
- Home ends with a horizontal comparison of every stop: address, status, the 1–5 scores, and would-offer. Swipe sideways on a phone; five stops stay comparable.

Clearing site data for this origin clears the tour. The page leaves about 72px at the top so the title sits below the site back link and notes button.
