const time = (date: string) => Date.parse(`${date}T00:00:00Z`);

/**
 * The planned start a production order accepted from a Make proposal takes (#320 Q1): its need date, the order's
 * finish, less the pair's lead time. A proposal's timing spans exactly the lead time, from its planned start to its
 * planned finish, even when it is late (then it starts today), so the lead time is read from there.
 */
export function orderStart(needDate: string, plannedStart: string, plannedFinish: string): string {
  return new Date(time(needDate) - (time(plannedFinish) - time(plannedStart))).toISOString().slice(0, 10);
}
