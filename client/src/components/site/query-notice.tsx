import { Button } from '@/components/ui/button';
import { InfoBanner } from './banners';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiErrorRequestId } from '@/lib/queryClient';

type ReadState = {
  isError: boolean;
  isPending: boolean;
  isFetching: boolean;
  refetch: () => unknown;
  error?: unknown;
};

/** Keep cached/partial results visible while explaining a failed refresh. */
export function QueryNotice({ queries }: { queries: ReadState[] }) {
  const { t } = useLanguage();
  if (queries.some(query => query.isError)) {
    // The id a parent can quote when telling FAU something is broken; it is
    // the one our log lines and Vercel's carry for that request.
    const requestId = queries.map(query => apiErrorRequestId(query.error)).find(Boolean);
    return <InfoBanner tone="alert" role="status" title={t.dataState.unavailable}
      action={<Button variant="outline" disabled={queries.some(query => query.isFetching)}
        onClick={() => { queries.filter(query => query.isError).forEach(query => { void query.refetch(); }); }}>
        {t.dataState.retry}
      </Button>}>
      {t.dataState.staleHint}
      {requestId && <span className="mt-1 block text-small">{t.dataState.errorId}: <span className="select-all break-all">{requestId}</span></span>}
    </InfoBanner>;
  }
  if (queries.some(query => query.isPending)) {
    return <p className="py-4 text-copy" role="status">{t.dataState.loading}</p>;
  }
  return null;
}
