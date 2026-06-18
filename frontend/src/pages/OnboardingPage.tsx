import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { Card } from '../components/common/Card';
import { KycForm } from '../components/kyc/KycForm';
import { DocumentUploadMock } from '../components/kyc/DocumentUploadMock';
import { IssuanceLoadingState } from '../components/kyc/IssuanceLoadingState';
import { Button } from '../components/common/Button';
import { useKycSubmission } from '../hooks/useKycSubmission';
import type { KycSubmitPayload } from '../types/api.types';

type OnboardingStep = 'form' | 'document' | 'issuing' | 'complete';

export default function OnboardingPage() {
  const [step, setStep] = useState<OnboardingStep>('form');
  const [formData, setFormData] = useState<KycSubmitPayload | null>(null);
  const { stage, error, submit } = useKycSubmission();
  const navigate = useNavigate();

  async function handleFormSubmit(data: KycSubmitPayload) {
    setFormData(data);
    setStep('document');
  }

  async function handleDocumentUploaded() {
    if (!formData) return;
    setStep('issuing');
    await submit(formData);
    setStep('complete');
  }

  if (stage === 'submitting_kyc' || stage === 'issuing_attestation') {
    return (
      <PageContainer narrow>
        <IssuanceLoadingState stage={stage} />
      </PageContainer>
    );
  }

  if (step === 'complete') {
    return (
      <PageContainer narrow>
        <Card className="text-center">
          <div className="py-6 space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-gray-900">Your compliance pass is ready</h2>
            <p className="text-gray-600 max-w-sm mx-auto">
              Your details were checked once, by our issuer, and never touch the blockchain. Only a
              cryptographic commitment was recorded.
            </p>
            <div className="flex flex-col gap-2 items-center">
              <Button onClick={() => navigate('/payment')} size="lg">
                Send a payment
              </Button>
              <Button variant="ghost" onClick={() => navigate('/dashboard')}>
                View dashboard
              </Button>
            </div>
          </div>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer narrow>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Get Your Pass</h1>
          <p className="mt-1 text-sm text-gray-500">
            Step {step === 'form' ? '1' : '2'} of 2 —{' '}
            {step === 'form' ? 'Identity details' : 'Document verification'}
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Card>
          {step === 'form' && (
            <KycForm onSubmit={handleFormSubmit} />
          )}
          {step === 'document' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Upload a government-issued document. In this demo, any file triggers auto-approval.
              </p>
              <DocumentUploadMock onUploaded={handleDocumentUploaded} />
            </div>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
