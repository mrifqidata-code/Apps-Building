import { useState } from 'react';
import { variantGroupsOf, variantSelectionError, type CatalogIndex } from '../../db/cart';
import type { Product } from '../../db/schema';
import { formatRupiah } from '../../domain/money';
import { Button, ErrorText, Sheet } from '../../ui/kit';

/** Asks for size/toppings before adding a product that has variants. */
export function VariantSheet({
  product,
  index,
  onAdd,
  onClose,
}: {
  product: Product;
  index: CatalogIndex;
  onAdd: (variantIds: string[]) => void;
  onClose: () => void;
}) {
  const groups = variantGroupsOf(product.id, index);
  // Preselect the first option of required single-choice groups (usually "Reguler").
  const [chosen, setChosen] = useState<string[]>(() =>
    groups
      .filter(({ group }) => group.mode === 'single' && group.required)
      .map(({ options }) => options[0]!.id),
  );
  const [error, setError] = useState<string | null>(null);

  const price =
    product.price +
    groups
      .flatMap(({ options }) => options)
      .filter((o) => chosen.includes(o.id))
      .reduce((sum, o) => sum + o.priceDelta, 0);

  const toggle = (groupId: string, optionId: string, single: boolean) => {
    setError(null);
    setChosen((current) => {
      if (single) {
        const siblings = groups.find(({ group }) => group.id === groupId)!.options.map((o) => o.id);
        return [...current.filter((id) => !siblings.includes(id)), optionId];
      }
      return current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
    });
  };

  return (
    <Sheet
      title={product.name}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          className="w-full"
          onClick={() => {
            const problem = variantSelectionError(product.id, chosen, index);
            if (problem) setError(problem);
            else onAdd(chosen);
          }}
        >
          Tambah · {formatRupiah(price)}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {groups.map(({ group, options }) => (
          <fieldset key={group.id} className="flex flex-col gap-2">
            <legend className="mb-2 font-semibold">
              {group.name}{' '}
              <span className="text-sm font-normal text-slate-500">
                {group.mode === 'single' ? 'pilih satu' : 'boleh lebih dari satu'}
                {group.required ? ', wajib' : ''}
              </span>
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {options.map((option) => {
                const selected = chosen.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggle(group.id, option.id, group.mode === 'single')}
                    className={`flex min-h-14 flex-col items-start justify-center rounded-xl px-3 text-left ${
                      selected
                        ? 'bg-teal-50 ring-2 ring-teal-700'
                        : 'bg-white ring-1 ring-slate-300'
                    }`}
                  >
                    <span className="font-semibold">{option.name}</span>
                    {option.priceDelta !== 0 && (
                      <span className="text-sm text-slate-600">
                        {option.priceDelta > 0 ? '+' : ''}
                        {formatRupiah(option.priceDelta)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
        <ErrorText>{error}</ErrorText>
      </div>
    </Sheet>
  );
}
