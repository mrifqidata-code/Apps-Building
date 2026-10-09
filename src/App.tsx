import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { RequireOwner, RequireUser } from './app/guards';
import { Layout } from './app/Layout';
import { SessionProvider } from './app/session';
import { bootstrap } from './db/bootstrap';
import { LoginPage } from './features/auth/LoginPage';
import { PaymentPage } from './features/bayar/PaymentPage';
import { CartProvider } from './features/kasir/CartProvider';
import { KasirPage } from './features/kasir/KasirPage';
import { SettingsPage } from './features/pengaturan/SettingsPage';
import { ProductEditPage } from './features/produk/ProductEditPage';
import { ProductListPage } from './features/produk/ProductListPage';
import { HistoryPage } from './features/riwayat/HistoryPage';
import { ReceiptPage } from './features/struk/ReceiptPage';
import { UpdatePrompt } from './pwa/UpdatePrompt';

export function App() {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bootstrap()
      .then(setStoreId)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <main className="p-6">
        <h1 className="text-lg font-bold">Aplikasi gagal dimuat</h1>
        <p className="mt-2 text-slate-600">{error}</p>
      </main>
    );
  }
  if (!storeId) return <main className="p-6 text-slate-500">Memuat…</main>;

  return (
    <BrowserRouter>
      <SessionProvider storeId={storeId}>
        <CartProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/masuk" element={<LoginPage />} />
              <Route
                path="/"
                element={
                  <RequireUser>
                    <KasirPage />
                  </RequireUser>
                }
              />
              <Route
                path="/bayar"
                element={
                  <RequireUser>
                    <PaymentPage />
                  </RequireUser>
                }
              />
              <Route
                path="/struk/:id"
                element={
                  <RequireUser>
                    <ReceiptPage />
                  </RequireUser>
                }
              />
              <Route
                path="/riwayat"
                element={
                  <RequireUser>
                    <HistoryPage />
                  </RequireUser>
                }
              />
              <Route
                path="/produk"
                element={
                  <RequireUser>
                    <RequireOwner>
                      <ProductListPage />
                    </RequireOwner>
                  </RequireUser>
                }
              />
              <Route
                path="/produk/baru"
                element={
                  <RequireUser>
                    <RequireOwner>
                      <ProductEditPage />
                    </RequireOwner>
                  </RequireUser>
                }
              />
              <Route
                path="/produk/:id"
                element={
                  <RequireUser>
                    <RequireOwner>
                      <ProductEditPage />
                    </RequireOwner>
                  </RequireUser>
                }
              />
              <Route
                path="/pengaturan"
                element={
                  <RequireUser>
                    <RequireOwner>
                      <SettingsPage />
                    </RequireOwner>
                  </RequireUser>
                }
              />
              <Route
                path="*"
                element={
                  <RequireUser>
                    <KasirPage />
                  </RequireUser>
                }
              />
            </Route>
          </Routes>
        </CartProvider>
      </SessionProvider>
      <UpdatePrompt />
    </BrowserRouter>
  );
}
