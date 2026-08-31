import { beforeEach, describe, expect, it } from "vitest"

import { setNativeValue, typeInto, typeSequentially } from "~core/fill/dom"

/**
 * React's value tracker.
 *
 * React caches the last value it knows on the element as `_valueTracker`, and
 * skips its change handler whenever that cache matches what it reads back.
 * Going through the prototype setter is supposed to leave the cache stale so
 * the next `input` event looks like a real edit.
 *
 * Measured on a live Workday page, it does not: the search box's value
 * updated, the widget never re-rendered, and three seconds later the list
 * still showed the unfiltered set. Ditto had typed a query the component never
 * learned about, and the search it was waiting for was never going to run.
 */

/** Stands in for React's tracker, which only reports a change once. */
function trackedInput(): { input: HTMLInputElement; changes: () => number } {
  document.body.replaceChildren()
  document.body.insertAdjacentHTML("afterbegin", `<input id="q" type="text">`)

  const input = document.getElementById("q") as HTMLInputElement
  let cached = ""
  let changes = 0

  Object.defineProperty(input, "_valueTracker", {
    value: {
      getValue: () => cached,
      setValue: (next: string) => {
        cached = next
      }
    },
    configurable: true
  })

  input.addEventListener("input", () => {
    // What React does: ignore the event unless the cache is out of date.
    if (input.value === cached) return

    cached = input.value
    changes += 1
  })

  return { input, changes: () => changes }
}

beforeEach(() => {
  document.body.replaceChildren()
})

describe("making a write visible to React", () => {
  it("reports a change even when the cache already matches", () => {
    const { input, changes } = trackedInput()

    // The cache agreeing with the new value is exactly the case that was
    // silently doing nothing.
    ;(input as unknown as { _valueTracker: { setValue(v: string): void } })._valueTracker.setValue(
      "Texas Tech University"
    )
    setNativeValue(input, "Texas Tech University")
    input.dispatchEvent(new Event("input", { bubbles: true }))

    expect(changes()).toBe(1)
    expect(input.value).toBe("Texas Tech University")
  })

  it("reports a change when clearing a box that already looks empty", () => {
    const { input, changes } = trackedInput()

    setNativeValue(input, "")
    input.dispatchEvent(new Event("input", { bubbles: true }))

    expect(changes()).toBe(1)
  })

  it("reports one change per character typed", async () => {
    const { input, changes } = trackedInput()

    await typeSequentially(input, "Rust", 0)

    // The clear before typing, then one per character.
    expect(changes()).toBe(5)
    expect(input.value).toBe("Rust")
  })

  it("leaves a control with no tracker alone", () => {
    document.body.insertAdjacentHTML("afterbegin", `<input id="plain" type="text">`)
    const plain = document.getElementById("plain") as HTMLInputElement

    expect(() => setNativeValue(plain, "hello")).not.toThrow()
    expect(plain.value).toBe("hello")
  })
})

describe("typing a value out rather than setting it", () => {
  /**
   * Confirmed on a live Ashby form: the value landed in the DOM and in
   * React's own props, and the form still rejected the field as empty on
   * submit. Clicking into it, typing one character and deleting it cleared
   * the error, so what the site records an answer from is the act of typing,
   * not the value that ends up there.
   */

  it("sends a keystroke per character", async () => {
    document.body.replaceChildren()
    document.body.insertAdjacentHTML("afterbegin", `<input id="q" type="text">`)
    const input = document.getElementById("q") as HTMLInputElement

    const keys: string[] = []
    input.addEventListener("keydown", (e) => keys.push((e as KeyboardEvent).key))

    await typeInto(input, "Hora")

    expect(keys).toEqual(["H", "o", "r", "a"])
    expect(input.value).toBe("Hora")
  })

  it("still finishes with change and blur", async () => {
    document.body.replaceChildren()
    document.body.insertAdjacentHTML("afterbegin", `<input id="q" type="text">`)
    const input = document.getElementById("q") as HTMLInputElement

    const seen: string[] = []
    for (const type of ["input", "change", "blur"]) {
      input.addEventListener(type, () => seen.push(type))
    }

    await typeInto(input, "Hi")

    expect(seen.filter((t) => t === "input").length).toBeGreaterThan(1)
    expect(seen).toContain("change")
    expect(seen[seen.length - 1]).toBe("blur")
  })

  it("types into a textarea too", async () => {
    document.body.replaceChildren()
    document.body.insertAdjacentHTML("afterbegin", `<textarea id="t"></textarea>`)
    const area = document.getElementById("t") as HTMLTextAreaElement

    await typeInto(area, "Built the thing")

    expect(area.value).toBe("Built the thing")
  })

  it("is not slow about a long value", async () => {
    document.body.replaceChildren()
    document.body.insertAdjacentHTML("afterbegin", `<textarea id="t"></textarea>`)
    const area = document.getElementById("t") as HTMLTextAreaElement

    // No delay between characters: the events are what matter, and pacing is
    // only needed for a search box that debounces a query.
    const started = Date.now()
    await typeInto(area, "x".repeat(600))

    expect(Date.now() - started).toBeLessThan(2000)
    expect(area.value).toHaveLength(600)
  })
})
