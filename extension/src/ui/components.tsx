import { useId, useState, type ReactNode } from "react"

/**
 * Shared UI primitives for the profile modal and the drawer.
 *
 * These are deliberately thin. They own layout, labelling and accessibility
 * wiring, and nothing else. Every one of them is a controlled component, so
 * the profile object stays the single source of truth and there is never a
 * second copy of a value drifting inside a widget.
 */

export function Field({
  label,
  required,
  hint,
  error,
  htmlFor,
  children
}: {
  label: string
  required?: boolean
  hint?: string
  error?: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="ditto-field">
      <label className="ditto-label" htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="ditto-required" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <div className="ditto-hint">{hint}</div>}
      {error && <div className="ditto-field-error">{error}</div>}
    </div>
  )
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  required,
  hint,
  error,
  type = "text",
  autoComplete = "off"
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  hint?: string
  error?: string
  type?: string
  autoComplete?: string
}) {
  const id = useId()

  return (
    <Field label={label} required={required} hint={hint} error={error} htmlFor={id}>
      <input
        id={id}
        className="ditto-input"
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  hint,
  rows = 4
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
  rows?: number
}) {
  const id = useId()

  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <textarea
        id={id}
        className="ditto-textarea"
        value={value}
        rows={rows}
        placeholder={placeholder}
        // The stylesheet sets a min-height for the default size, which would
        // otherwise override `rows` entirely and make every textarea the same
        // height no matter what was asked for.
        style={{ minHeight: rows * 21 + 20 }}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  required,
  hint
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  required?: boolean
  hint?: string
}) {
  const id = useId()

  return (
    <Field label={label} required={required} hint={hint} htmlFor={id}>
      <select
        id={id}
        className="ditto-select"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

/**
 * Month input. Every ATS asks for education and work dates at month
 * precision, so a native month picker is both the right granularity and the
 * only widget that stores an unambiguous value.
 */
export function MonthInput({
  label,
  value,
  onChange,
  disabled,
  hint
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  hint?: string
}) {
  const id = useId()

  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <input
        id={id}
        className="ditto-input"
        type="month"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

export function Checkbox({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="ditto-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

/**
 * Segmented choice, used for every equal-employment question.
 *
 * `null` is a first-class value and means "not answered", which is distinct
 * from an explicit "Decline to state". Conflating the two would either hide
 * an unanswered required question or invent a refusal the user never gave.
 */
export function Segmented<T extends string | boolean>({
  label,
  value,
  options,
  onChange,
  required,
  hint
}: {
  label: string
  value: T | null
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  required?: boolean
  hint?: string
}) {
  return (
    <Field label={label} required={required} hint={hint}>
      <div className="ditto-segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            className="ditto-segment"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    </Field>
  )
}

/** Tag list with inline add. Backs skills and preferred locations. */
export function Chips({
  label,
  values,
  onChange,
  placeholder = "Type and press Enter",
  hint
}: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  hint?: string
}) {
  const [draft, setDraft] = useState("")

  const commit = () => {
    const trimmed = draft.trim()
    // Case-insensitive dedupe: "Python" and "python" are one skill, and a form
    // that receives both looks like a copy-paste error to a recruiter.
    const exists = values.some((v) => v.toLowerCase() === trimmed.toLowerCase())

    if (trimmed && !exists) {
      onChange([...values, trimmed])
    }
    setDraft("")
  }

  return (
    <Field label={label} hint={hint}>
      <div className="ditto-chips ditto-input" style={{ minHeight: 44, padding: 7 }}>
        {values.map((value, index) => (
          <span className="ditto-chip" key={`${value}-${index}`}>
            {value}
            <button
              type="button"
              aria-label={`Remove ${value}`}
              onClick={() => onChange(values.filter((_, i) => i !== index))}>
              &times;
            </button>
          </span>
        ))}
        <input
          className="ditto-chip-input"
          value={draft}
          placeholder={values.length === 0 ? placeholder : "Add another"}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault()
              commit()
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1))
            }
          }}
        />
      </div>
    </Field>
  )
}

export function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      className="ditto-toggle"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  )
}

export function Card({
  title,
  action,
  children
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="ditto-card">
      {(title || action) && (
        <div className="ditto-card-head">
          <div className="ditto-card-title">{title}</div>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

export function Banner({
  title,
  text,
  action
}: {
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <div className="ditto-banner">
      <div className="ditto-banner-body">
        <div className="ditto-banner-title">{title}</div>
        <div className="ditto-banner-text">{text}</div>
      </div>
      {action}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="ditto-empty">{children}</div>
}

export const YES_NO = [
  { value: true, label: "Yes" },
  { value: false, label: "No" }
] as const

export const YES_NO_DECLINE = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "decline", label: "Decline to state" }
] as const
