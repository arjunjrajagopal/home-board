# Worker update for Sabzi

`patch-sabzi.py` changes the Home Board Worker (`worker.js`, version 2) so that:

- there is a `sabzi` table (created automatically on the next request, no manual database step)
- `GET /api/staff` also returns Sabzi rows (yesterday onwards)
- `POST /api/staff/sabzi` lets the staff key save and remove Sabzi rows for yesterday, today and the next two days, and nothing else
- the family passphrase already reaches every collection through `/api/v2/ops`, so nothing else changes for the family board

    python3 patch-sabzi.py path/to/worker.js

A copy is kept as `worker.js.before-sabzi`. If any place it needs to change is not found exactly once, it stops and changes nothing. Then deploy `worker.js` the way you deployed it before.
