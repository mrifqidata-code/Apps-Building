import { PrinterSection } from './PrinterSection';
import { QrisSection } from './QrisSection';
import { StoreSection } from './StoreSection';
import { DiscountLimitSection, TaxSection } from './TaxSection';
import { UsersSection } from './UsersSection';

export function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <h1 className="text-xl font-bold">Pengaturan</h1>
      <StoreSection />
      <PrinterSection />
      <TaxSection />
      <DiscountLimitSection />
      <QrisSection />
      <UsersSection />
    </main>
  );
}
