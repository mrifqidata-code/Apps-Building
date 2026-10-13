import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useSession, useSignedInUser } from '../../app/session-context';
import { checkPin, pinCheckMessage } from '../../db/auth';
import { MAX_CANCEL_REASON_LENGTH, cancelSale, planCancel, type CancelPlan } from '../../db/cancel';
import { db } from '../../db/db';
import type { Transaction, User } from '../../db/schema';
import { formatRupiah } from '../../domain/money';
import { PAYMENT_LABELS } from '../../domain/receipt-text';
import { formatJakartaDateTime, nowIso } from '../../domain/time';
import { errorMessage } from '../../ui/errors';
import { Button, ErrorText, Sheet, inputClass } from '../../ui/kit';
import { PinPad } from '../../ui/PinPad';

const REASONS = ['Salah input', 'Pelanggan batal', 'Barang dikembalikan'];

/** Who cancelled a sale and why, or the button to cancel it (owner, or owner PIN on this phone). */
export function CancelSection({ transactionId }: { transactionId: string }) {
  const { device } = useSession();
  const data = useLiveQuery(async () => {
    const transaction = await db.transactions.get(transactionId);
    if (!transaction) return null;
    const [plan, voidedBy] = await Promise.all([
      transaction.status === 'paid' ? planCancel(db, transaction, device.id) : null,
      transaction.voidedBy ? db.users.get(transaction.voidedBy) : undefined,
    ]);
    return { transaction, plan, voidedByName: voidedBy?.name ?? null };
  }, [transactionId, device.id]);
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const { transaction, plan, voidedByName } = data;

  if (transaction.status !== 'paid') {
    return (
      <section
        aria-label="Pembatalan"
        className="flex flex-col gap-1 rounded-2xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200"
      >
        <p className="text-base font-semibold">
          {transaction.status === 'void' ? 'Transaksi di-void' : 'Transaksi direfund'}
        </p>
        <p>Alasan: {transaction.voidReason}</p>
        <p>
          Oleh {voidedByName ?? '-'}
          {transaction.voidedAt ? `, ${formatJakartaDateTime(transaction.voidedAt)}` : ''}
        </p>
      </section>
    );
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Batalkan transaksi
      </Button>
      {open && plan && (
        <CancelSheet transaction={transaction} plan={plan} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function CancelSheet({
  transaction,
  plan,
  onClose,
}: {
  transaction: Transaction;
  plan: CancelPlan;
  onClose: () => void;
}) {
  const { store, device, isOwner } = useSession();
  const user = useSignedInUser();
  // On a cashier's turn the owner approves with their PIN, without switching users.
  const [approvedBy, setApprovedBy] = useState<User | null>(isOwner ? user : null);
  const title = plan.kind === 'void' ? 'Void transaksi' : 'Refund transaksi';

  return (
    <Sheet title={title} onClose={onClose}>
      {approvedBy ? (
        <CancelForm
          transaction={transaction}
          plan={plan}
          owner={approvedBy}
          deviceId={device.id}
          onDone={onClose}
        />
      ) : (
        <OwnerPin storeId={store.id} onApproved={setApprovedBy} />
      )}
    </Sheet>
  );
}

function OwnerPin({ storeId, onApproved }: { storeId: string; onApproved: (u: User) => void }) {
  const owner = useLiveQuery(
    () =>
      db.users
        .where({ storeId })
        .filter((u) => u.role === 'owner' && u.active && !u.deletedAt)
        .first(),
    [storeId],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (owner === undefined) return null;
  if (!owner?.pinHash) {
    return <ErrorText>PIN pemilik belum ada di HP ini. Minta pemilik masuk sendiri.</ErrorText>;
  }

  const submit = async (pin: string) => {
    setBusy(true);
    setError(null);
    const result = await checkPin(db, owner.id, pin);
    setBusy(false);
    if (result.ok) onApproved(owner);
    else setError(pinCheckMessage(result));
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-center text-slate-600">
        Hanya pemilik yang bisa membatalkan transaksi. Minta {owner.name} memasukkan PIN di HP ini.
      </p>
      <PinPad onSubmit={submit} submitLabel="Setujui" busy={busy} />
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function CancelForm({
  transaction,
  plan,
  owner,
  deviceId,
  onDone,
}: {
  transaction: Transaction;
  plan: CancelPlan;
  owner: User;
  deviceId: string;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = formatRupiah(transaction.total);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await cancelSale(db, {
        transactionId: transaction.id,
        reason,
        restock,
        actor: { userId: owner.id, role: owner.role },
        deviceId,
        now: nowIso(),
      });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 text-slate-700">
        <p>
          <strong>{transaction.receiptNo}</strong> · {total} ·{' '}
          {PAYMENT_LABELS[transaction.paymentMethod]}
        </p>
        {plan.kind === 'void' ? (
          <p>
            Kasir untuk transaksi ini masih buka. Transaksi tidak dihitung lagi
            {transaction.paymentMethod === 'cash' ? `; kembalikan ${total} dari laci.` : '.'}
          </p>
        ) : transaction.paymentMethod !== 'cash' ? (
          <p>
            Kasirnya sudah ditutup. Kembalikan {total} ke pelanggan lewat{' '}
            {PAYMENT_LABELS[transaction.paymentMethod]}, di luar aplikasi.
          </p>
        ) : plan.cashFromDrawer ? (
          <p>
            Kasirnya sudah ditutup. Uang {total} diambil dari laci kasir yang sedang buka dan
            dicatat sebagai kas keluar.
          </p>
        ) : (
          <p>
            Kasirnya sudah ditutup dan tidak ada kasir yang buka di HP ini, jadi uang refund {total}{' '}
            tidak tercatat di laci.
          </p>
        )}
        {plan.stockQty > 0 && plan.kind === 'void' && (
          <p>{plan.stockQty} barang yang stoknya dilacak kembali ke stok.</p>
        )}
      </div>

      {plan.stockQty > 0 && plan.kind === 'refund' && (
        <label className="flex min-h-12 items-center gap-3">
          <input
            type="checkbox"
            className="size-6 accent-brand-700"
            checked={restock}
            onChange={(e) => setRestock(e.target.checked)}
          />
          <span>
            Barang kembali ke stok ({plan.stockQty})
            <span className="block text-sm text-slate-500">
              Matikan kalau barangnya rusak atau sudah dimakan.
            </span>
          </span>
        </label>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-slate-700">Alasan</span>
        <div className="flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={reason === r}
              onClick={() => setReason(r)}
              className={`min-h-12 rounded-full px-4 text-sm font-semibold ${
                reason === r ? 'bg-brand-700 text-white' : 'bg-white ring-1 ring-slate-300'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <input
          className={inputClass}
          aria-label="Alasan pembatalan"
          value={reason}
          maxLength={MAX_CANCEL_REASON_LENGTH}
          placeholder="Atau tulis alasannya"
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      <p className="text-sm text-slate-500">
        Disetujui oleh {owner.name}. Pembatalan tercatat di log audit dan tidak bisa diurungkan.
      </p>
      <ErrorText>{error}</ErrorText>
      <Button variant="danger" disabled={!reason.trim() || busy} onClick={confirm}>
        {busy ? 'Menyimpan…' : plan.kind === 'void' ? 'Ya, void transaksi' : `Ya, refund ${total}`}
      </Button>
    </div>
  );
}
