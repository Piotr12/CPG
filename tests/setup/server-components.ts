import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

/**
 * React DOM can't render async server components, so await them first and render the result.
 * Suspense boundaries stay in place, which is fine: everything inside them is already resolved.
 */
export async function resolveServerComponents(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveServerComponents));
  if (!isValidElement<{ children?: ReactNode }>(node)) return node;
  if (typeof node.type === "function" && node.type.constructor.name === "AsyncFunction") {
    return resolveServerComponents(await (node.type as (props: object) => Promise<ReactNode>)(node.props));
  }
  if (node.props.children === undefined) return node;
  const children = await resolveServerComponents(node.props.children);
  return cloneElement(node as ReactElement, {}, ...Children.toArray(children));
}
