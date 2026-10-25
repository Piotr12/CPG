import { cn } from "../../lib/utils";

export interface SegmentedControlOption {
  value: string;
  label: string;
  /** Shown, but can't be chosen (a unit the selection has no conversion for). */
  disabled?: boolean;
}

export interface SegmentedControlProps {
  /** The GET parameter the choice is submitted as: the radios' shared `name`. */
  name: string;
  options: SegmentedControlOption[];
  /** The value the page was opened with (the URL's); without one nothing is checked. */
  defaultValue?: string;
  /** The group's accessible name, when no visible label names it through `aria-labelledby`. */
  label?: string;
  /** Disables every option (a filter form with nothing to filter). */
  disabled?: boolean;
  id?: string;
  /** On the group, for the filter form's layout. */
  className?: string;
  "aria-labelledby"?: string;
}

/**
 * A short choice shown whole, as a 32 px segmented control (a time bucket, a unit). The segments are
 * native radio inputs sharing one `name`, so a GET form submits the checked one without JavaScript and
 * the arrow keys move between them, skipping disabled ones. Key it by `defaultValue`, so a navigation
 * to another filter starts afresh.
 */
export function SegmentedControl({ name, options, defaultValue, label, disabled, id, className, ...aria }: SegmentedControlProps) {
  return (
    <div
      id={id}
      role="radiogroup"
      aria-labelledby={aria["aria-labelledby"]}
      aria-label={aria["aria-labelledby"] ? undefined : label}
      className={cn("inline-flex h-8 w-fit items-stretch rounded-md bg-muted p-1", className)}
    >
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "flex cursor-pointer items-center rounded-sm px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors duration-120 select-none",
            "hover:text-foreground has-checked:bg-background has-checked:font-medium has-checked:text-foreground has-checked:shadow-xs",
            "has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background",
            "has-disabled:cursor-not-allowed has-disabled:opacity-50 has-disabled:hover:text-muted-foreground",
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            defaultChecked={option.value === defaultValue}
            disabled={disabled || option.disabled}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
