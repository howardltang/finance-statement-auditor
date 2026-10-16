import { useSpendingByMonth } from "../lib/analytics";
import { SpendingChart } from "../components/SpendingChart";
import { OutliersList } from "../components/OutliersList";
import { AskBox } from "../components/AskBox";

export default function InsightsPage() {
  const { data, isPending, isError } = useSpendingByMonth();

  return (
    <>
      <div className="page-header">
        <h1>Insights</h1>
        <p>Trends, anomalies, and answers — all grounded in your verified transactions.</p>
      </div>

      <div className="section">
        <div className="section-header">
          <h2>Spending over time</h2>
        </div>
        <div className="card">
          {isPending && <p className="hint">Loading…</p>}
          {isError && <p className="error-text">Couldn't load spending trends.</p>}
          {data && <SpendingChart series={data.series} />}
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <h2>Unusual transactions</h2>
        </div>
        <OutliersList />
      </div>

      <div className="section">
        <div className="section-header">
          <h2>Ask about your spending</h2>
          <p>Try "why was March so expensive?" or "how much do I spend on subscriptions?"</p>
        </div>
        <AskBox />
      </div>
    </>
  );
}
