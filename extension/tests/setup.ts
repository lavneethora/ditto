/**
 * Test environment shims.
 *
 * jsdom is missing several APIs that every browser Ditto actually runs in has
 * had for years. Polyfilling them here keeps the production code on the real
 * APIs instead of carrying fallbacks that exist only to satisfy the test
 * runner.
 *
 * These are all Tier 1 concerns from PRD section 8. Tier 1 proves recognition
 * and bookkeeping; it cannot prove that a real Workday dropzone accepted a
 * file, and nothing here should be read as claiming otherwise.
 */

/* -------------------------------------------------------- Blob.arrayBuffer */

if (typeof Blob !== "undefined" && typeof Blob.prototype.arrayBuffer !== "function") {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}

/* ------------------------------------------------------------ DataTransfer */

/** Array-backed FileList, which is otherwise not constructible. */
function toFileList(files: File[]): FileList {
  const list: Record<PropertyKey, unknown> = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
    [Symbol.iterator]: function* () {
      yield* files
    }
  }

  files.forEach((file, index) => {
    list[index] = file
  })

  return list as unknown as FileList
}

if (typeof globalThis.DataTransfer === "undefined") {
  class DataTransferShim {
    private readonly _files: File[] = []

    readonly items = {
      add: (file: File) => {
        this._files.push(file)
      },
      clear: () => {
        this._files.length = 0
      },
      get length() {
        return 0
      }
    }

    dropEffect = "none"
    effectAllowed = "all"

    get files(): FileList {
      return toFileList(this._files)
    }
  }

  globalThis.DataTransfer = DataTransferShim as unknown as typeof DataTransfer
}

/* -------------------------------------------------------------- PointerEvent */

/**
 * jsdom has no PointerEvent, and the combobox driver dispatches a full
 * pointer sequence because that is what these widgets actually listen for.
 */
if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventShim extends MouseEvent {
    pointerId: number
    pointerType: string
    isPrimary: boolean

    constructor(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string; isPrimary?: boolean } = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 1
      this.pointerType = init.pointerType ?? "mouse"
      this.isPrimary = init.isPrimary ?? true
    }
  }

  globalThis.PointerEvent = PointerEventShim as unknown as typeof PointerEvent
}

/* ---------------------------------------------------------------- DragEvent */

if (typeof globalThis.DragEvent === "undefined") {
  class DragEventShim extends Event {
    dataTransfer: DataTransfer | null = null

    constructor(type: string, init?: EventInit & { dataTransfer?: DataTransfer }) {
      super(type, init)
      this.dataTransfer = init?.dataTransfer ?? null
    }
  }

  globalThis.DragEvent = DragEventShim as unknown as typeof DragEvent
}

/* ------------------------------------------------- HTMLInputElement.files -- */

/**
 * jsdom does have a `files` setter, but it brand-checks the assigned value
 * against its own FileList implementation, which is not constructible from
 * test code. The shimmed DataTransfer therefore cannot hand it anything it
 * will accept.
 *
 * Replacing the accessor outright sidesteps the brand check. Assignment is
 * recorded per element and the original getter still serves any input that was
 * never assigned to.
 */
if (typeof HTMLInputElement !== "undefined") {
  const original = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files")
  const store = new WeakMap<HTMLInputElement, FileList>()

  Object.defineProperty(HTMLInputElement.prototype, "files", {
    configurable: true,
    get(this: HTMLInputElement) {
      const assigned = store.get(this)
      if (assigned) return assigned
      return original?.get?.call(this) ?? null
    },
    set(this: HTMLInputElement, value: FileList) {
      store.set(this, value)
    }
  })
}

/* ------------------------------------------------------------- CSS.escape -- */

if (typeof globalThis.CSS === "undefined") {
  globalThis.CSS = {} as typeof CSS
}

if (typeof globalThis.CSS.escape !== "function") {
  globalThis.CSS.escape = (value: string) => String(value).replace(/[^\w-]/g, (ch) => `\\${ch}`)
}
