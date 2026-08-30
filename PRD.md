# Ditto

**fill once, ditto everywhere**

A Chrome extension that autofills job applications on Workday, Greenhouse, Ashby and Lever from one profile you enter once. No account, no server, no limits.

Status: in development. Target: Chrome Web Store.

---

## 1. Why this exists

Jobright's autofill extension does the job and then charges for it: 4 free autofills per day, then you buy credits. During an application season that cap is hit before lunch.

Ditto keeps the part that does the work and removes everything that exists to create the upsell.

| Jobright | Ditto |
| --- | --- |
| Match score, industry, applicant count, "reposted 10 hours ago" | cut |
| Insider Connections | cut |
| Generate Custom Resume, resume tailoring | cut |
| Upload / Generate Cover Letter | cut |
| Credits, "4 Credits Left", "Get Unlimited" | cut, structurally |
| Account and backend | cut, structurally |
| Injected side drawer, one-click autofill, per-field result list, saved profile, resume re-attach | **this is Ditto** |

### Unlimited has to be structural

"Unlimited" is the entire wedge, so it cannot be a promise that a future pricing page quietly revokes. Ditto is local-only by design:

- Profile and resume live in `chrome.storage.local`.
- No account, no sign-in, no user identity.
- No network request anywhere in the fill path.

There is no per-fill cost to recover, so there is never an economic reason to meter. Any future AI feature must be opt-in and keyed with the user's own API key, or it breaks this property.

---

## 2. Scope

### In

- Side drawer injected into the application page.
- One-click autofill of the current page.
- Per-field results the user can audit before submitting.
- A profile editor covering everything the four target ATS ask for.
- Resume storage and re-attachment to file inputs and dropzones.
- Four ATS: Greenhouse, Lever, Ashby, Workday.

### Out

Match scoring, job intel, resume generation or tailoring, cover letters of any kind, credits, accounts, backends, and AI-written answers.

### Non-negotiables

1. **Ditto never submits.** No code path may click a submit control. Enforced by a blocklist in the fill layer, not by convention.
2. **Ditto never touches credentials.** No sign-in, no account creation, no password fields. Workday requires an account; creating it stays the user's job.
3. **Ditto never advances a page on its own.** Navigation happens only from a click the user made.

---

## 3. The drawer

A right-side panel injected into the page DOM by a content script, collapsible to a tab. Mounted inside a **shadow root**, because Workday and Greenhouse both ship global CSS aggressive enough to eat an unisolated panel.

1. **Header.** Ditto wordmark, tagline, settings, collapse chevron.
2. **Detection.** "Greenhouse detected. 30 fields found, 17 Ditto recognises." On an unsupported page: "No application form found on this page", and nothing else renders.
3. **Autofill this page.** Primary button. No credit counter, ever.
4. **Safety line.** "Ditto never submits. Review everything before you send it."
5. **Progress.** "9/11 required filled" with a bar and percentage. Percentage is required-filled over required-total.
6. **Results**, grouped and counted:
   - **NEEDS YOU**: recognised, but Ditto will not answer for you (open text with no matching saved answer), or it tried and failed.
   - **FILLED**: verified by reading the value back out of the DOM, showing what was written.
   - **SKIPPED**: recognised and deliberately left alone (a voluntary question left unanswered, or no data on file).
7. **Continue to the next page.** For multi-step forms. Clicks the site's own next control and rescans. Pressed by the user, never automatic.
8. **Your Autofill Information** opens the profile modal.
9. **Upload Resume** shows the stored filename.

---

## 4. The profile modal

Centered modal. Left section nav with a dot marking incomplete sections, right pane form, Update button disabled until dirty.

| Section | Fields |
| --- | --- |
| Personal | first / middle / last name, preferred names, email, phone type, phone with country code, address lines 1 and 2, country, state, city, county, postal code, LinkedIn / GitHub / website URLs |
| Education | repeatable: school, degree, major, GPA, start, end, currently studying |
| Work Experience | repeatable: company, title, location, start, end, currently working, summary, bulleted job description |
| Skills | chips with removal, plus an add input |
| Preferences | relocation (yes/no), how did you hear about us, desired salary |
| Equal Employment | US work authorization, sponsorship requirement, disability, veteran, gender, race, Hispanic/Latino, LGBTQ+, sexual orientation, pronouns. Each supports "decline to state" as a real answer; leaving one unanswered makes Ditto skip it |
| Answers | reusable saved snippets keyed by question type ("why this company", "additional information") |

Six sections, matching Jobright's minus the two that do not apply. Its
"Sign-up Information" is meaningless without an account, and its "Preference"
section serves job matching, which Ditto does not do. Links live inside
Personal, where Jobright puts them and where a form asks for them.

Preferences was cut and then restored, at three fields rather than the
original five. The test applied to both it and Answers is the same: keep only
what has the same answer on every application. That excludes an earliest start
date, which lives in Answers as free text because that is how forms ask it;
storing a date here as well would be two sources of truth for one question.

**Learn from corrections.** A toggle, on by default: when the user fixes a value directly in an application form, Ditto writes the correction back to the profile.

---

## 5. Design invariants

Three properties that must hold structurally, because each one corresponds to an observed failure and none of them survives as a rule someone is supposed to remember.

### 5.1 `filled` is unreachable without a DOM read-back

Observed: a Workday Resume/CV dropzone sitting visibly empty, with an empty `Alert:` beneath it, while the panel reported "3/3 required fields filled, 100%" with a green check on Resume/CV. The write succeeded. The attach did not.

Therefore `FillResult.status` becomes `filled` in exactly one place, `core/verify.ts`, and only after reading the value back out of the DOM. Every fill function returns "attempted"; verification is what promotes it.

A green check that can lie is worse than no panel at all, because the user submits on the strength of it.

### 5.2 Sponsorship patterns carry an explicit `invert` flag

Real forms ask, adjacently:

- "Are you authorized to work in the US?"
- "Will you now or in the future require sponsorship for employment visa status?"
- "Can you work without sponsorship?"

The same stored fact produces opposite correct answers depending on phrasing. A flip is a false legal statement on a job application, not a cosmetic bug.

Therefore: store `authorizedUS` and `requiresSponsorship` as two separate booleans, and require every matcher pattern touching them to declare `invert: true | false` explicitly. Omitting the flag is a type error, not a default. Tested against a list of real phrasings in both polarities.

### 5.3 Skipped, needs-you and error are three distinct states

Collapsing them makes the progress bar lie in the expensive direction: a field Ditto silently failed on looks identical to one the user chose to skip.

`FillResult.status` is `filled | needs_you | skipped | error`. Only `filled` counts toward the bar.

There is deliberately no standing "never fill this" opt-out for the voluntary
questions. It was tried and removed: it duplicated what leaving a question
unanswered already does, and worse, these questions are required on some forms
and optional on others, so a standing refusal would silently leave a required
field blank on a form the user believed was ready to send.

---

## 6. Architecture

Plasmo, React 19, TypeScript, Zod. Same toolchain as RaiderRating. Solid white ground with neutral greys, black text at varying opacity, and the logo's blue (`#1830F0`) for the primary action and selection states. Green is reserved for one thing only: a verified fill.

```
extension/src/
  core/          ATS-agnostic. Knows nothing about any specific site.
    types.ts     Profile, FieldSpec, FillResult, Adapter
    scan.ts      DOM walk to FieldSpec[]
    label.ts     resolve the human label for a control
    match.ts     FieldSpec to profile key, with invert flags
    verify.ts    read-back. The only place status becomes `filled`.
    report.ts    bucket and count for the drawer
    fill/        text, select, combobox, radio, checkbox, date, multiselect, file
  adapters/      greenhouse, lever, ashby, workday/. Selectors and quirks only.
  profile/       schema (Zod), store (chrome.storage.local), resume
  ui/            drawer/, modal/, tokens.css
  contents/      mount.tsx
```

Three things that are easy to get wrong and expensive to fix later:

**Adapters supply selectors and quirks, never fill logic.** If Workday needs new widget behaviour, that behaviour is generalised into `core/fill/`. This is the difference between four adapters and four extensions.

**Iframes.** Greenhouse embeds into company career sites through `#grnhse_iframe`, so the content script needs `all_frames: true`. But the drawer must mount exactly once, in the top frame, while the engine runs in whichever frame holds the form. Frames coordinate through the background service worker. Getting this wrong yields either a drawer crushed inside a 600px iframe, or no drawer at all on embedded boards.

**React-managed inputs.** Assigning `.value` on a React input does nothing lasting; the synthetic layer overwrites it on the next render. All four targets are React. Every text write goes through the native property setter followed by a bubbling `input` event, implemented once in `core/fill/text.ts`.

### Permissions

`storage` only, plus host permissions for the four ATS domains. No `all_urls`, no `scripting`, no network permissions. Single purpose: autofill job applications. The data-use disclosure is trivial because nothing leaves the device.

---

## 7. Milestones

Each ends shippable. Greenhouse must score 90%+ before Lever starts, so that engine bugs do not get copied into four adapters.

| # | Milestone | Done when |
| --- | --- | --- |
| M0 | Scaffold and profile | A complete profile survives a browser restart |
| M1 | Engine and Greenhouse | A real posting fills 90%+ of required fields, resume genuinely attaches, nothing reports `filled` that is not visibly filled |
| M2 | Lever | 90%+ live, with no new code in `core/fill/` |
| M3 | Ashby | 90%+ live, any new widget handling landed in `core/`, not the adapter |
| M4 | Workday | All seven wizard steps fill, resume attached and verified |
| M5 | Store | Icons, screenshots, listing, privacy policy, packaging |

Workday is the capstone and is roughly the other three combined: `data-automation-id` hooks, listboxes rendered into body portals, dates split into separate MM / DD / YYYY spinbuttons, a phone country-code widget, repeatable add buttons, and a seven-step wizard.

---

## 8. Testing

Two tiers, because neither is honest alone.

**Tier 1, `npm run score`.** jsdom, fast, CI-friendly. Runs scan, label and match over saved HTML in `fixtures/` and reports fields found, fields recognised, and fields mapped to the correct profile key against a checked-in expectation file. This measures recognition, which is where breakage lands when an ATS ships a redesign. It cannot measure filling, because jsdom will not drive a Workday listbox.

**Tier 2, live browser.** Real fill plus read-back against real postings. Required for Ashby and Workday, and the only tier that can catch invariant 5.1.

Required tests:

- `match.test.ts`: every sponsorship and work-authorization phrasing, both polarities. Guards 5.2.
- `verify.test.ts`: a write into a detached or rejected control resolves to `error`, never `filled`. Guards 5.1.
- `report.test.ts`: the three non-filled states stay distinct, and only `filled` counts. Guards 5.3.
- `file.test.ts`: resume round-trips through storage to a `File` on an input, with matching name and size.
- `blocklist.test.ts`: no adapter selector can resolve to a submit control.
