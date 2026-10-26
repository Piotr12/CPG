import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowDown, CircleCheck, ClipboardList, Minus, Repeat, Truck, type LucideIcon } from "lucide-react";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { cn } from "@cpg/ui/lib/utils";
import { getMessages } from "../../../i18n/get-messages";
import type { Messages } from "../../../i18n/messages/en";
import { PLANNING_WEEK, type PlanningEvent } from "./planning-week";

export const metadata: Metadata = { title: "The Test dataset's planning week · Help · Caveman Planning Good" };

type Labels = Messages["help"]["planningWeek"];

const EVENT_ICONS: Record<PlanningEvent, LucideIcon> = { planningRun: ClipboardList, receipt: Truck };

/** Complete class strings per answer (Tailwind only generates classes it finds whole in the source). */
const PARTIAL_TONES = {
  yes: { box: "bg-success-surface border-success-edge", icon: "text-success", Icon: CircleCheck },
  no: { box: "bg-neutral-surface border-neutral-edge", icon: "text-neutral-tone", Icon: Minus },
} as const;
const partialTone = (partialReceipt: boolean) => PARTIAL_TONES[partialReceipt ? "yes" : "no"];

/** Public, like `/help`: the Reset Test card links here, so the decision behind the datasets' week is explained once (Q10 of #237). */
export default function TestDatasetHelpPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <PlanningWeekGuide />
      </Suspense>
    </main>
  );
}

async function PlanningWeekGuide() {
  await connection();
  const { locale, messages } = await getMessages();
  const t = messages.help.planningWeek;

  return (
    <div lang={locale} className="flex flex-col gap-8">
      <div className="flex max-w-prose flex-col gap-2">
        <Link href="/help" className="text-sm text-muted-foreground underline underline-offset-4">
          {t.back}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p>{t.intro}</p>
      </div>
      <PlanningCycle t={t} />
      <TodayByDay t={t} />
      <section aria-labelledby="planning-week-why" className="flex max-w-prose flex-col gap-2 border-t border-border pt-4">
        <h2 id="planning-week-why" className="text-lg font-semibold">
          {t.whyHeading}
        </h2>
        {t.why.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </section>
    </div>
  );
}

/** The flowchart: Thursday's run, the receipts, production and the next week's shipments, top to bottom. */
function PlanningCycle({ t }: { t: Labels }) {
  return (
    <section aria-labelledby="planning-week-cycle" className="flex flex-col gap-4 border-t border-border pt-4">
      <h2 id="planning-week-cycle" className="text-lg font-semibold">
        {t.cycleHeading}
      </h2>
      <figure className="flex flex-col gap-3">
        <ol data-planning-cycle className="flex flex-col items-stretch">
          {t.cycle.map((step, i) => (
            <li key={step.title} className="flex flex-col items-center">
              {i > 0 && <ArrowDown aria-hidden className="my-1 size-4 text-muted-foreground" />}
              <div className={cn("flex w-full max-w-md flex-col gap-1 rounded-md border bg-card p-4", i === 0 ? "border-primary" : "border-border")}>
                <p className="text-xs text-muted-foreground">{step.when}</p>
                <p className="font-medium">{step.title}</p>
                <p className="text-sm">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Repeat aria-hidden className="size-4 shrink-0" />
          {t.repeat}
        </p>
        <figcaption className="text-center text-sm text-muted-foreground">{t.cycleCaption}</figcaption>
      </figure>
    </section>
  );
}

/**
 * The week strip and, under it, the same week in words: the strip is the picture, the list carries
 * every fact the strip shows, so the strip is hidden from screen readers.
 */
function TodayByDay({ t }: { t: Labels }) {
  return (
    <section aria-labelledby="planning-week-today" className="flex flex-col gap-4 border-t border-border pt-4">
      <h2 id="planning-week-today" className="text-lg font-semibold">
        {t.todayHeading}
      </h2>
      <p className="max-w-prose">{t.todayIntro}</p>
      <figure className="flex flex-col gap-3">
        <div aria-hidden data-planning-strip className="grid grid-cols-7 gap-1">
          {PLANNING_WEEK.map((day, i) => {
            const tone = partialTone(day.partialReceipt);
            const EventIcon = day.event && EVENT_ICONS[day.event];
            return (
              <div key={t.days[i].short} data-partial={day.partialReceipt} className="flex flex-col items-center gap-1">
                <span className="text-xs font-medium">{t.days[i].short}</span>
                <span className="flex h-8 items-center justify-center">{EventIcon && <EventIcon className="size-4 text-foreground" />}</span>
                <span className={cn("flex h-10 w-full items-center justify-center rounded-md border", tone.box)}>
                  <tone.Icon className={cn("size-4", tone.icon)} />
                </span>
              </div>
            );
          })}
        </div>
        <Legend t={t} />
        <figcaption className="text-sm text-muted-foreground">{t.stripCaption}</figcaption>
      </figure>
      <ul data-planning-days className="flex max-w-prose flex-col gap-2">
        {PLANNING_WEEK.map((day, i) => {
          const tone = partialTone(day.partialReceipt);
          return (
            <li key={t.days[i].name} className="flex flex-col gap-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{t.days[i].name}</span>
                <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 text-sm", tone.box)}>
                  <tone.Icon aria-hidden className={cn("size-4", tone.icon)} />
                  {day.partialReceipt ? t.legend.partial : t.legend.none}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">{t.days[i].note}</p>
            </li>
          );
        })}
      </ul>
      <p className="max-w-prose">{t.everyDay}</p>
    </section>
  );
}

function Legend({ t }: { t: Labels }) {
  const items: { Icon: LucideIcon; className: string; label: string }[] = [
    { Icon: ClipboardList, className: "text-foreground", label: t.legend.planningRun },
    { Icon: Truck, className: "text-foreground", label: t.legend.receipt },
    { Icon: PARTIAL_TONES.yes.Icon, className: PARTIAL_TONES.yes.icon, label: t.legend.partial },
    { Icon: PARTIAL_TONES.no.Icon, className: PARTIAL_TONES.no.icon, label: t.legend.none },
  ];
  return (
    <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      {items.map(({ Icon, className, label }) => (
        <li key={label} className="flex items-center gap-1">
          <Icon className={cn("size-4", className)} />
          {label}
        </li>
      ))}
    </ul>
  );
}
