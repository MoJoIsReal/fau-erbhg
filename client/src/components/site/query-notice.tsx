import { Button } from '@/components/ui/button';
import { InfoBanner } from './banners';
import { useLanguage } from '@/contexts/LanguageContext';

type ReadState = {
  isError: boolean;
  isPending: boolean;
  isFetching: boolean;
  refetch: () => unknown;
};

/** Keep cached/partial results visible while explaining a failed refresh. */
export function QueryNotice({ queries }: { queries: ReadState[] }) {
  const { t } = useLanguage();
  if (queries.some(query => query.isError)) {
    return <InfoBanner tone="alert" role="status" title={t.dataState.unavailable}
      action={<Button variant="outline" disabled={queries.some(query => query.isFetching)}
        onClick={() => { queries.filter(query => query.isError).forEach(query => { void query.refetch(); }); }}>
        {t.dataState.retry}
      </Button>}>
      {t.dataState.staleHint}
    </InfoBanner>;
  }
  if (queries.some(query => query.isPending)) {
    return <p className="py-4 text-copy" role="status">{t.dataState.loading}</p>;
  }
  return null;
}
