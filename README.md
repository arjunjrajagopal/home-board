# Home Board

A prototype household board: staff schedules and attendance, a repository of the day's delivery OTPs, a grocery list, and a TRMNL-style wall display. Messages are typed or pasted in English and read into updates.

Single file, no build step. Open `index.html`, or visit the GitHub Pages site.

With a server connected (People, then Shared board), the board is kept in tables on the Home Board Cloudflare Worker (see `home-board-api`), saved one change at a time. Without one, it stays in this browser only. Nothing is connected to WhatsApp yet.

People and their schedules are edited on the People screen. A schedule change applies from a chosen date, so past days keep the schedule they had.

`staff.html` is the read-only Hindi screen for house staff. It is opened once from a link of the form `staff.html#api=<server address>&k=<staff key>`.

Add `?today=YYYY-MM-DD` to the address to pretend it is another day.

## Sabzi (vegetables)

The Sabzi tab is a picture board for vegetables: drag a vegetable from the cart onto the drying cloth; each drag adds half a kilo (or one piece, or a quarter kilo for chilli, garlic and palak). Drag it off the cloth to remove it. Separate Today and Tomorrow pages. Today's list also appears on the Today screen, under the staff attendance, as icon, item and amount.

Family (`index.html`) and staff (`staff.html`, the "सब्ज़ी लिखो" button) can both change it. The cart itself is `sabzi.js`, shared by both pages.

Rows are saved in a `sabzi` collection (one row per vegetable per day, id `date|vegetable`). The Worker needs the small update in `worker/` (run `python3 worker/patch-sabzi.py worker.js`, then deploy): it adds the table, lets the staff key read it, and lets the staff key write Sabzi rows only (`POST /api/staff/sabzi`). Until the Worker is updated, Sabzi is kept on the phone that made the change and everything else keeps syncing.

## Fridge

The Fridge tab is a picture board of what is in the fridge: eggs (18), Maya's milk (8), Maya's yoghurt (8), butter, bread, paneer, bananas and Amul cheese tins. Every slot starts greyed out; tap to show what is in the fridge (butter, bread and cheese in quarters, paneer in halves). It also shows as a card on the Phone tab, and as the "फ्रिज" card on the staff screen (`staff.html`), where staff can tap to change it. The pictures and logic are in `fridge.js`, shared by both pages.

The fridge is saved in a `fridge` collection (one row per shelf, `{id, v: [slot amounts]}`). The Worker needs the small update in `worker/` (run `python3 worker/patch-fridge.py worker.js`, then deploy): it adds the table, lets the staff key read it, and lets the staff key save fridge rows only (`POST /api/staff/fridge`). Until then the fridge is kept on the phone that made the change and everything else keeps syncing.

## Jeet checklist

The Jeet checklist tab (also under More on the phone) is Sangeetha's step-by-step list for getting ready for Jeet's session: prepare baby treat food, bring a glass of warm water, arrange furniture, bring the bowl of small toys, arrange large toys. Each step is a big tap-to-tick card, with a progress bar. A "Jeet checklist" button appears inside Jeet's tile on the Phone tab. On the staff screen (`staff.html`) the same list, in Hindi, opens from a "जीत की तैयारी" button under Jeet's row in "कौन कब आएगा" (shown on days Jeet is coming). The list and its icons are in `jeet.js`, shared by both pages. Ticks are kept on the phone and reset each day. The photo for "Arrange large toys" is `jeet-toys.jpg`; replace that file to change the picture.
