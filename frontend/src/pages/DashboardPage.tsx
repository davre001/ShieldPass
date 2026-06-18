import { Link } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { PassStatusCard } from '../components/dashboard/PassStatusCard';
import { PaymentHistoryTable } from '../components/dashboard/PaymentHistoryTable';
import { Card } from '../components/common/Card';
import { useComplianceAttestation } from '../hooks/useComplianceAttestation';
import type { PaymentRecord } from '../types/stellar.types';

const MOCK_PAYMENTS: PaymentRecord[] = [];

export default function DashboardPage() {
  const { rootVersion, hasValidAttestation } = useComplianceAttestation();

  return (
    <PageContainer>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          {hasValidAttestation && (
            <Link
              to="/payment"
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Send payment
            </Link>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <PassStatusCard />
          <Card>
            <p className="text-sm text-gray-500">Merkle root version</p>
            <p className="mt-1 font-mono text-sm text-gray-900">{rootVersion ?? '—'}</p>
            <p className="mt-2 text-xs text-gray-400">
              The issuer publishes a new root each time new attestations are added.
            </p>
          </Card>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Payment history</h2>
          <PaymentHistoryTable payments={MOCK_PAYMENTS} />
        </div>
      </div>
    </PageContainer>
  );
}
