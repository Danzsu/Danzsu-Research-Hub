import { CurrentWeekPage } from "../current-week-page";

export const dynamic = "force-dynamic";

/** AI cégek: the week's company news, the latest day's Top 5 first. */
export default function Companies() {
  return <CurrentWeekPage path="/companies" scope="companies" />;
}
