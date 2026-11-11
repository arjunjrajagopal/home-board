# Home Board

A prototype household board: staff schedules and attendance, a repository of the day's delivery OTPs, a grocery list, and a TRMNL-style wall display. Messages are typed or pasted in English and read into updates.

Single file, no build step. Open `index.html`, or visit the GitHub Pages site.

With a server connected (People, then Shared board), the board is kept in tables on the Home Board Cloudflare Worker (see `home-board-api`), saved one change at a time. Without one, it stays in this browser only. Nothing is connected to WhatsApp yet.

People and their schedules are edited on the People screen. A schedule change applies from a chosen date, so past days keep the schedule they had.

`staff.html` is the read-only Hindi screen for house staff. It is opened once from a link of the form `staff.html#api=<server address>&k=<staff key>`.

Add `?today=YYYY-MM-DD` to the address to pretend it is another day.
