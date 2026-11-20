# Home Board

A prototype household board: staff schedules and attendance, a repository of the day's delivery OTPs, tasks, and a TRMNL-style wall display. (The grocery "To order" list was removed on 20 Nov 2026, to be rebuilt; its saved items are kept on the server.) Messages are typed or pasted in English and read into updates.

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

The Fridge tab is a picture board of what is in the fridge: eggs (18), Baby's milk (8), Baby's yoghurt (8), butter, bread, paneer, bananas and Amul cheese tins. Every slot starts greyed out; tap to show what is in the fridge (butter, bread and cheese in quarters, paneer in halves). It also shows as a card on the Phone tab, and as the "फ्रिज" card on the staff screen (`staff.html`), where staff can tap to change it. The pictures and logic are in `fridge.js`, shared by both pages.

The fridge is saved in a `fridge` collection (one row per shelf, `{id, v: [slot amounts]}`). The Worker needs the small update in `worker/` (run `python3 worker/patch-fridge.py worker.js`, then deploy): it adds the table, lets the staff key read it, and lets the staff key save fridge rows only (`POST /api/staff/fridge`). Until then the fridge is kept on the phone that made the change and everything else keeps syncing.

## Tasks

The Tasks tab holds jobs like getting ready for Jeet's session. Each task has a name (English and Hindi), an icon, the person who does it, a rule for when it appears, optional instructions, and steps. Each step can have an icon, Hindi text and a photo.

- **When:** whenever another person comes (for example, whenever Jeet comes), on chosen weekdays, or on one date. It can skip public holidays. A task only appears on days its person is working.
- **Where it shows:** under its person on the Phone tab and on the staff screen (`staff.html`, in Hindi). Tapping it opens a single full-screen checklist with photos.
- **People and Tasks:** each person's tasks are listed under them, with "+ Add a task".
- **Admin:** sharing (server address and passphrase) and "Start again" now live here.
- **Ticks** are shared between phones through the server (one row per ticked step per day). Staff can tick only yesterday, today and tomorrow.
- **Photos** are shrunk on the phone (longest side 1280 px, JPEG) and saved in the server's `photos` table. Adding one needs the family board connected.
- `tasks.js` has the shared logic: rules, the checklist view, photo loading and upload. The first task is made from the old Jeet checklist; its large-toys picture is `jeet-toys.jpg`.

Until the server is updated, tasks stay on the phone that made them and the staff screen shows the built-in Jeet task with ticks kept on the phone.
