# ContactSort

**Tinder for your address book.** Load a `.vcf` export of your contacts, drag each card into a list, and export a
file that remembers everything, so you can stop halfway and pick up tomorrow.

- **Swipe into any number of lists.** When you start dragging, a pie wheel opens around the card with one equal
  slice per list. Drop the card in a slice and it goes to that list.
- **File-based and idempotent.** The export is a normal vCard file with one extra line per sorted contact
  (`X-CUSTOM-LISTS`). Load it again and sorted contacts stay out of the stack. Export again without changes and you
  get the same bytes.
- **100% local.** It runs in the browser with no server, no uploads and no analytics. The production build ships
  with a Content-Security-Policy that blocks all network requests.

## Running it

### Option A: a single HTML file (easiest for a client)

```bash
npm install
npm run build
```

This produces **`dist/index.html`**, a single self-contained file (about 300 KB). Rename it to something like
`ContactSort.html` and send it over. Double-clicking it opens the app in the browser, with no Node, no install and
no internet needed.

### Option B: dev server on localhost

```bash
npm install
npm run dev        # opens http://localhost:5173
```

Requires Node 22.12 or newer.

## How to use it

1. **Export the contacts.** On iPhone: Contacts → Lists (top left) → touch and hold **All Contacts** → **Export** →
   Save to Files. On Mac or iCloud.com: select all contacts → Export vCard.
2. **Drop the `.vcf`** onto the page, or try the built-in sample contacts first.
3. **Create lists** with the folder button at the bottom. List order sets each slice's position on the wheel and its
   number key.
4. **Sort.** Drag a card into a slice. Dropping it short of the dashed ring snaps it back. Tap a card to see all its
   details.

   | Key               | Action                                   |
   | ----------------- | ---------------------------------------- |
   | `1`–`9`, `0`      | send the top card to list 1–10           |
   | `←` `↑` `→` `↓`   | send toward that side of the wheel       |
   | `Space`           | skip for now (card goes to the back)     |
   | `Z` / `Backspace` | undo                                     |
   | `L`               | open/close lists                         |

5. **Export** whenever you like. The Export menu has two modes (the choice is remembered):

   | Mode               | You get                                                                                           | To continue tomorrow                                              |
   | ------------------ | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
   | **Progress file**  | One `.vcf` with every contact. Each sorted contact carries an `X-CUSTOM-LISTS` line (see below).   | Drop that one file back in.                                       |
   | **Separate lists** | One plain `.vcf` per list, named after it: 5 lists → 5 files. Cards are exactly as imported, with nothing added. | Drop the list files back in **together with the original export**. |

   In *Separate lists* mode, Chrome and Edge ask for a folder once and write every file into it. Other browsers
   download the files one by one, and there's also a one-`.zip` option. Empty lists get no file, and unsorted
   contacts aren't exported. A contact filed in two lists appears in both files.

   The browser also autosaves (IndexedDB, this computer only), so an accidental refresh doesn't lose anything. The
   exported files are still the real save.

### Bringing existing lists in

A single iPhone export has no list information (see below). If lists already exist on the phone, export **All
Contacts** and each list separately (touch and hold the list → Export), then drop all the files in at once. The
import dialog lets each file become a list. The "all contacts" file is detected and left without a list. Contacts
that appear in several files are merged, not duplicated.

### Getting the lists back into a contacts app

vCard has no standard way to carry Apple's lists, so use **Export → Separate lists**. It gives one plain `.vcf`
per list. Then, per file:

- **Google Contacts:** Import → choose the file → *Import and add to label*.
- **Mac Contacts:** create the list in the sidebar and drag that list's `.vcf` onto it. If you're asked about
  duplicates, update the existing cards instead of adding copies. iCloud syncs the list to the iPhone.

Keep the original export as a backup and try a small list first.

## File format

*Separate lists* files are plain vCards: each card is byte for byte what was imported, and any ContactSort lines
are stripped. The rest of this section is about the *Progress file*.

The progress export is the original vCard, byte for byte, with at most three kinds of added lines:

```
BEGIN:VCARD
VERSION:3.0
PRODID:-//Apple Inc.//iPhone OS 18.0//EN
N:Doe;John;;;
FN:John Doe
TEL;type=CELL;type=VOICE;type=pref:+1 555 019 2834
UID:8a4b2c1d-ef6a-5b21-9876-543210abcdef          ← only if the card had no UID
X-CUSTOM-LISTS:Work;Clients                         ← only if the contact is sorted
X-CONTACTSORT-LISTS:Family;Friends;Work;Clients     ← first card only: all lists, in wheel order
END:VCARD
```

| Line                  | Meaning                                                                                                                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UID`                 | Stable identity. Kept if the card already has one. Otherwise it's a deterministic UUID (v5-style SHA-1) of the name plus the last 9 digits of the first phone number (falling back to email or company), so a fresh UID-less Apple export months later maps to the same contacts. |
| `X-CUSTOM-LISTS`      | The contact's lists, separated by `;` (`,` is also accepted on read, and `\;` / `\,` escape them). No line means unsorted. A list called `Unsorted` is treated as unsorted.                                                                     |
| `X-CONTACTSORT-LISTS` | Every list, including empty ones, in wheel order, so slice positions and number keys stay put between sessions.                                                                                                                              |

Everything else (photos, Apple `item1.X-ABLabel` groups, folding, vCard 2.1 quoted-printable) passes through
untouched. Apple and Google ignore unknown `X-` properties, so the file stays importable anywhere.

### Using the file with a local LLM

This format is the "augmented vCard 3.0" from the planning notes, so a local script or LLM can work on the same
file:

- **Read:** a contact's current lists are in `X-CUSTOM-LISTS`, and the lists that exist are in `X-CONTACTSORT-LISTS`.
- **Write:** rewrite only the `X-CUSTOM-LISTS` line of each card and leave `UID` alone. Loading the result into
  ContactSort shows what the model sorted and queues what it left unsorted, for a human pass.

## Development

```bash
npm test           # vitest: parser, serializer round-trips, sessions, wheel geometry, zip
npm run typecheck
npm run build      # typecheck + single-file build
```

```
src/
  lib/vcard.ts       vCard parse (folding, QP, Apple groups, photos) + byte-preserving export
  lib/session.ts     session model, import/merge, reducer, exports (.vcf / .zip)
  lib/wheel.ts       pie-wheel geometry (slice ↔ angle, label placement)
  lib/storage.ts     IndexedDB autosave
  lib/zip.ts, sha1.ts   tiny dependency-free helpers
  components/        CardStack (drag physics), WheelOverlay, ListsDrawer, Landing, Dialogs
```

The only runtime dependency is React.
