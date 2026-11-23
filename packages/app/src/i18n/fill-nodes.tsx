import { Fragment, type ReactNode } from "react";

/** `template` with each `{name}` replaced by a node, so a filled label can hold marked text (a link, code). */
export function fillNodes(template: string, values: Record<string, ReactNode>): ReactNode[] {
  return template.split(/\{(\w+)\}/).map((part, index) => (index % 2 === 1 ? <Fragment key={index}>{values[part]}</Fragment> : part));
}
