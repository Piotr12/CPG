/** Fills `{name}` placeholders: `fill("Edit {id}", { id: "00000001" })`. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => values[name] ?? placeholder);
}
