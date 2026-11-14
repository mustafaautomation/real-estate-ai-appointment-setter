import { SimulatorPanel } from '@/components/simulator-panel';

export const metadata = { title: 'Simulator' };

export default function SimulatorPage() {
  return (
    <main className="page">
      <div className="section-label">
        <h1>Channel simulator</h1>
        <p>
          Sends a signed Twilio-shaped, email, or Instagram payload into the real webhook route.
        </p>
      </div>
      <SimulatorPanel />
    </main>
  );
}
