# Ditto

**fill once, ditto everywhere**

A Chrome extension that autofills job applications on Greenhouse, Lever, Ashby and Workday from
one profile you enter once. No account, no server, no limits, no network request in the fill path.

Status: in development, not yet on the Chrome Web Store.

---

## Why it is local-only

Paid autofill extensions meter the thing that does the work: a handful of free fills a day, then
credits. During an application season that cap is gone before lunch.

Ditto has no per-fill cost to recover, because there is nothing to recover. The profile and resume
live in `chrome.storage.local`, there is no account and no identity, and nothing leaves the
machine. "Unlimited" is not a promise a future pricing page can revoke; it is a property of the
architecture.

The label recognition model added later does not change this. It ships inside the extension and
runs on the user's own machine.

## What it will not do

These are enforced in code, not left to remember. See `src/core/blocklist.ts` and the tests
beside it.

- **Never submits an application.** No path may click a submit control. Enforced at scan time, at
  every fill, and by a guard around every click and keypress.
- **Never touches credentials.** No sign-in, no account creation, no password fields. Workday
  account creation stays the user's job.
- **Never advances a page on its own.** Navigation only ever comes from a user click.
- **Never fills a bot trap.** Workday ships a hidden input labelled "for robots only" and an
  invisible overlay on its submit control. Filling either fails the application before a person
  reads it, and the applicant is never told why.
- **Never gives consent.** Marketing opt-ins, data-processing consent and "may we run AI over your
  application" are the user's to answer. Accepting terms required to apply is not the same thing
  and is handled separately.
- **Never reports a fill it cannot see.** A field becomes `filled` only after the value is read
  back out of the DOM. Everything else is `needs_you`, `skipped` or `error`, and those three stay
  distinct.

## How a field gets an answer

Five layers, each tried only when everything above it found nothing, so a later layer can add
recognition and never change an answer an earlier one already got right.

| | |
| --- | --- |
| 1. What you taught it | A question you mapped to a field yourself. Outranks everything, because it is the only source that is not an inference. |
| 2. The site's own identifier | `autocomplete`, `data-automation-id`, and adapter-declared keys. Exact rather than inferred. |
| 3. Rules | ~200 weighted patterns over the label, with disqualifiers and section awareness. |
| 4. Rewriting | The label singularised, then reworded into the vocabulary the rules use, then both. "Veterans status" is "Veteran Status"; "Alma Mater" is "School". |
| 5. Meaning | A sentence model, on device, for labels nothing above recognised. |

Anything none of them places goes to **Needs You**, where you answer it and can teach it in one
click for next time.

### What the model is not allowed to do

It ships no phrasings for eligibility or equal-employment keys and cannot return one at any
threshold. The measurement that set the threshold is the reason: *"Are you a citizen of any one of
these countries: Cuba, Iran, North Korea, or Syria"* scored **0.542** against "country of
citizenship", higher than several correct matches, because the model reads it as asking *which*
citizenship. It is a yes/no screening question, and getting it backwards is a false statement on a
federal form.

Those questions are answered by rules, or by you teaching them explicitly. What is refused is a
guess.

The threshold, **0.46**, is measured rather than chosen. Twelve labels the rules cannot recognise
scored 0.44 to 0.75; twelve questions no profile can answer topped out at 0.438.

---

## Getting it running

```bash
cd extension
npm install
npm run fetch:model   # 45MB, not in git
npm run build
```

Then load `extension/build/chrome-mv3-prod` at `chrome://extensions` with Developer mode on.

`npm run dev` for a watching build.

### Why the model is not committed

It is 45MB of binaries: 23MB of weights and 21.6MB of ONNX runtime. Git stores every version of a
binary forever and cannot diff them, so committing them would make every clone pay for every
version ever fetched.

`fetch-model.mjs` pins a Hugging Face **revision** rather than a branch and checks every file
against a SHA-256 recorded here. That matters more than it sounds: the vectors in
`src/core/semantic/vectors.json` were built with these exact weights, and a silently changed model
would leave every comparison running between two different embedding spaces, and the tier would
stop recognising anything while continuing to look installed. A checksum mismatch means the vectors need
rebuilding, not that the checksum needs updating.

---

## Layout

```
extension/
  src/core/          scan, label, match, resolve, fill, verify, report
  src/core/semantic/ the on-device model tier
  src/adapters/      greenhouse, lever, ashby, workday. Selectors and quirks only.
  src/ui/            drawer, profile modal, components
  assets/offscreen/  the page the model runs in, deliberately outside the bundler
fixtures/            saved HTML from real postings
```

**Adapters supply selectors and quirks, never fill logic.** When Workday needs new widget
behaviour, that behaviour is generalised into `core/fill/`. This is the difference between four
adapters and four extensions.

### Where the model runs, and why it is awkward

In an offscreen document, loaded from plain files in `assets/`. Both halves of that are forced:

- A content script is subject to the **page's** content security policy for WebAssembly, and
  Workday and Greenhouse both ship strict ones, so the model would fail to instantiate on exactly
  the sites Ditto exists for. The service worker is stopped after thirty seconds idle, and
  reloading 23MB per autofill is not worth paying.
- Parcel cannot parse the import attributes transformers.js ships with, so the page cannot go
  through the bundler at all.

---

## Testing

```bash
npm test                 # 610 tests
npm run score            # recognition over saved fixtures
npm run typecheck
```

Two tiers, because they catch different things.

**`npm test`** runs the scanner, matcher, resolver, fill and verify against jsdom. Fixtures are
copied verbatim from live postings, including the parts that look like mistakes: the only `label`
pointing at Greenhouse's resume input reads "Attach", and Workday labels its veteran question
"Veterans status". Both of those were real bugs that a fixture written from memory would have
missed.

**`npm run score`** reports fields found and fields recognised per fixture. It measures
recognition, which is where breakage lands when an ATS ships a redesign. It cannot measure
filling, because jsdom will not drive a Workday listbox.

Neither can catch a fill that writes correctly and does not stick. That needs a real browser
against a real posting, and it is the only tier that can.

## Where it is

| | |
| --- | --- |
| Greenhouse, Lever, Ashby | filling |
| Workday | through Voluntary Disclosures; Self Identify and Review remain |
| Recognition over fixtures | 86% of 65 fields |
| Tests | 610 across 43 files |
| Store submission | not started |
