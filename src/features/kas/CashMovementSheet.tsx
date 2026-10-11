import { useState } from 'react';
import { useSession, useSignedInUser } from '../../app/session-context';
import { db } from '../../db/db';
import type { CashMovementType } from '../../db/schema';
import { MAX_CASH_REASON_LENGTH, addCashMovement } from '../../db/shift';
import type { Rupiah } from '../../domain/money';
import { CASH_MOVEMENT_LABELS } from '../../domain/shift';
import { nowIso } from '../../domain/time';
import { errorMessage } from '../../ui/errors';
import { Button, ErrorText, Field, MoneyInput, Sheet, inputClass } from '../../ui/kit';

const EXAMPLES: Record<CashMovementType, string> = {
  out: 'Misalnya: beli es batu',
  in: 'Misalnya: tambah uang kecil',
};

/** Records cash taken out of (or put into) the drawer that is not a sale. */
export function CashMovementSheet({
  type,
  onClose,
}: {
  type: CashMovementType;
  onClose: () => void;
}) {
  const { store, device } = useSession();
  const user = useSignedInUser();
  const [amount, setAmount] = useState<Rupiah | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = CASH_MOVEMENT_LABELS[type];

  const save = async () => {
    if (!amount) return;
    setBusy(true);
    setError(null);
    try {
      await addCashMovement(db, {
        storeId: store.id,
        deviceId: device.id,
        userId: user.id,
        type,
        amount,
        reason,
        now: nowIso(),
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          className="w-full"
          disabled={!amount || !reason.trim() || busy}
          onClick={save}
        >
          {busy ? 'Menyimpan…' : `Simpan ${title.toLowerCase()}`}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-slate-600">
          {type === 'out'
            ? 'Uang tunai yang diambil dari laci, bukan untuk kembalian.'
            : 'Uang tunai yang ditambahkan ke laci, bukan dari penjualan.'}
        </p>
        <Field label="Jumlah">
          <MoneyInput value={amount} onChange={setAmount} aria-label="Jumlah" autoFocus />
        </Field>
        <Field label="Alasan">
          <input
            className={inputClass}
            value={reason}
            maxLength={MAX_CASH_REASON_LENGTH}
            placeholder={EXAMPLES[type]}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <ErrorText>{error}</ErrorText>
      </div>
    </Sheet>
  );
}
