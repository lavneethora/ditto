import { describe, expect, it } from "vitest"

import { pickText } from "~core/fill/options"
import type { FieldOption } from "~core/types"

/**
 * Choosing the right entry out of a skills taxonomy.
 *
 * Every case here was reported from a live Workday skills box. The list holds
 * the thing you asked for alongside several things that merely start the same
 * way, and taking the first option that starts with the right characters
 * picks the wrong one more often than not.
 */

const options = (...labels: string[]): FieldOption[] =>
  labels.map((label) => ({ label, value: label }))

describe("a name and the things that only look like it", () => {
  it("takes the language C, not C design", () => {
    const list = options("C design", "C (Programming Language)", "C Sharp")

    expect(pickText(list, "C")?.label).toBe("C (Programming Language)")
  })

  it("takes the language C++, not its standard library", () => {
    // No parentheses on this one, so the qualifier has to be recognised as a
    // qualifier rather than as punctuation.
    const list = options("C++ STL", "C++ Programming Language", "C++ Builder")

    expect(pickText(list, "C++")?.label).toBe("C++ Programming Language")
  })

  it("prefers the exact entry over a qualified one", () => {
    const list = options("MATLAB Programming", "MATLAB", "MATLAB Simulink")

    expect(pickText(list, "MATLAB")?.label).toBe("MATLAB")
  })

  it("does not care what order the list is in", () => {
    const forward = options("C design", "C (Programming Language)")
    const backward = options("C (Programming Language)", "C design")

    expect(pickText(forward, "C")?.label).toBe(pickText(backward, "C")?.label)
  })
})

describe("names that share letters and nothing else", () => {
  it("never answers FastAPI with FASTA", () => {
    // "fasta" is a substring of "fastapi", and reverse containment used to
    // accept any substring at all. A genomics format went into a skills list.
    expect(pickText(options("FASTA", "FASTQ"), "FastAPI")).toBeNull()
  })

  it("still answers a value with its shorter whole-word form", () => {
    // The case reverse containment exists for: a word boundary, not any
    // shared prefix.
    expect(pickText(options("United States"), "United States of America")?.label).toBe(
      "United States"
    )
  })

  it("does not take a longer name that merely begins the same", () => {
    expect(pickText(options("Java Persistence API"), "Java")?.label).not.toBe(
      "Java Persistence API"
    )
  })
})

describe("what the qualifier rule does not do", () => {
  it("does not invent a match out of a shared qualifier", () => {
    // "Programming" alone must not answer "Rust".
    expect(pickText(options("Programming", "Software Development"), "Rust")).toBeNull()
  })

  it("keeps picking plain values plainly", () => {
    expect(pickText(options("Python", "Ruby", "Go"), "Ruby")?.label).toBe("Ruby")
  })
})

describe("a name and a different thing built on it", () => {
  /**
   * All reported live, and all caused by my own qualifier list: it included
   * "framework" and "library", which do not say WHICH Python, they name a
   * different skill. Having them in there ranked "Python Frameworks" above
   * "Python (Programming Language)", because the tail was shorter.
   */

  it("takes the language Python, not Python frameworks", () => {
    const list = options("Python Frameworks", "Python (Programming Language)", "Python Numpy")

    expect(pickText(list, "Python")?.label).toBe("Python (Programming Language)")
  })

  it("takes the language Java, not Java frameworks", () => {
    const list = options("Java Frameworks", "Java (Programming Language)")

    expect(pickText(list, "Java")?.label).toBe("Java (Programming Language)")
  })

  it("takes React.js, not the ReAct framework", () => {
    // Different capitalisation, different thing, and canonicalising makes them
    // look identical up to the space.
    const list = options("ReAct Framework", "React.js")

    expect(pickText(list, "React")?.label).toBe("React.js")
  })
})

describe("a name written out in full", () => {
  it("takes SQL under its full name, not SQL*Net", () => {
    // A taxonomy writes an abbreviation as "Full Name (ABBR)". SQL*Net starts
    // with SQL and is an unrelated product.
    const list = options("SQL*Net", "Structured Query Language (SQL)", "SQL Server")

    expect(pickText(list, "SQL")?.label).toBe("Structured Query Language (SQL)")
  })

  it("still prefers the plain entry when there is one", () => {
    const list = options("Structured Query Language (SQL)", "SQL")

    expect(pickText(list, "SQL")?.label).toBe("SQL")
  })

  it("prefers the qualified language over the spelled-out form", () => {
    const list = options("Structured Query Language (SQL)", "SQL (Programming Language)")

    expect(pickText(list, "SQL")?.label).toBe("SQL (Programming Language)")
  })
})
