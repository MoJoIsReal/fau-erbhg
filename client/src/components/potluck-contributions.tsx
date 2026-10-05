import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";

type FoodList = { foodContributions: string[] };

/** "Kake", "kake " and "Pastasalat" → Kake ×2, Pastasalat, in signup order. */
function groupDishes(dishes: string[]) {
  const groups = new Map<string, { label: string; count: number }>();
  for (const dish of dishes) {
    const label = dish.trim().replace(/\s+/g, " ");
    if (!label) continue;
    const key = label.toLocaleLowerCase("nb");
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { label, count: 1 });
  }
  return [...groups.values()];
}

/**
 * What everyone has said they bring to a potluck, so the next person can pick
 * something else. Dishes only: the API never says who brings what.
 */
export default function PotluckContributions({ eventId }: { eventId: number }) {
  const { t } = useLanguage();
  const headingId = useId();
  const query = useQuery<FoodList>({
    queryKey: [`/api/registrations?eventId=${eventId}&food=1`],
    // Read fresh each time it is shown: someone deciding what to bring wants
    // the list as it is now, not as it was five minutes ago.
    staleTime: 0,
  });

  const dishes = query.data ? groupDishes(query.data.foodContributions) : [];

  return (
    <div className="space-y-2">
      <p id={headingId} className="text-micro font-semibold uppercase tracking-[0.14em] text-subtle">
        {t.events.potluckHeading}
      </p>
      {query.isError ? (
        <p className="flex flex-wrap items-center gap-x-2 text-small text-subtle" role="status">
          {t.dataState.unavailable}
          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            className="min-h-[44px] font-semibold text-brand hover:underline"
          >
            {t.dataState.retry}
          </button>
        </p>
      ) : query.isPending ? (
        <p className="text-small text-subtle" role="status">{t.dataState.loading}</p>
      ) : dishes.length === 0 ? (
        <p className="text-small text-subtle">{t.events.potluckNoneYet}</p>
      ) : (
        <ul aria-labelledby={headingId} className="flex flex-wrap gap-2">
          {dishes.map(({ label, count }) => (
            <li
              key={label.toLocaleLowerCase("nb")}
              className="rounded-pill border border-hairline bg-surface px-3 py-1 text-small text-copy"
            >
              {label}
              {count > 1 && <span className="ml-1 tabular-nums text-subtle">×{count}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
