# CLAUDE.md — POS Sederhana untuk UMKM

Panduan kerja untuk Claude Code di repo ini. Perbarui file ini setiap ada keputusan baru.

## Produk

Aplikasi kasir (POS) web untuk UMKM Indonesia: kedai kopi/minuman, makanan rumahan (termasuk frozen food), dan toko kecil.

- Skala: satu toko dengan 1–3 perangkat kasir.
- Perangkat utama: Chrome di HP/tablet Android. Harus tetap bisa dipakai di laptop.
- Peran: pemilik (akses penuh) dan kasir (akses terbatas).
- Skema data sudah multi-toko sejak awal. UI MVP cukup untuk satu toko.

## Stack

- Vite + React + TypeScript (strict) + Tailwind CSS v4, dijadikan PWA lewat `vite-plugin-pwa`. Register type `prompt`: versi baru tidak memuat ulang otomatis di tengah transaksi.
- IndexedDB lewat Dexie (`dexie-react-hooks` untuk query yang otomatis ter-update). IndexedDB adalah sumber data utama di perangkat.
- Mulai M5: Supabase (Postgres, Auth, RLS, Storage).
- Deploy: Cloudflare Workers dengan static assets saja, tanpa kode server (gratis, boleh komersial). Konfigurasinya di `wrangler.jsonc`. Panduan: `docs/deploy-cloudflare.md`.
  - `name` di `wrangler.jsonc` harus sama dengan nama Worker di dasbor Cloudflare (`apps-building`). Workers Builds tetap memakai nama Worker yang terhubung kalau beda (lewat `WRANGLER_CI_OVERRIDE_NAME`), tapi akan membuka PR otomatis untuk menyamakannya.
  - Preview build untuk branch PR baru bisa jalan setelah Worker pernah berhasil di-deploy dari `main`. Sebelum itu, check "Workers Builds" gagal dengan pesan "This Worker does not exist on your account".
  - `wrangler.jsonc` wajib ada. Tanpa file ini, `wrangler deploy` menjalankan autoconfig yang mengubah `package.json` (termasuk skrip `preview` yang dipakai Playwright) dan memasang `@cloudflare/vite-plugin`.
  - Header cache diatur di `public/_headers`: `sw.js` dan manifest `no-cache`, `/assets/*` immutable.
  - Vercel Hobby tidak boleh dipakai untuk komersial.
- Test: Vitest (unit, jsdom + fake-indexeddb) dan Playwright (e2e terhadap build produksi, proyek `hp-android` = Pixel 7 dan `laptop`).
- Node 22 (`.nvmrc`). Package manager: npm.

## Perintah

```bash
npm run dev          # server pengembangan
npm run build        # tsc -b && vite build → dist/
npm run lint         # ESLint
npm run format       # Prettier (tulis); format:check untuk CI
npm run typecheck    # tsc -b
npm test             # Vitest
npm run test:e2e     # Playwright (build + preview di port 4173)
npm run check        # lint + format:check + typecheck + test
```

- `@playwright/test` dikunci di 1.56.1 karena cocok dengan Chromium yang terpasang di container cloud (`/opt/pw-browsers`). Di CI, browser dipasang dengan `npx playwright install --with-deps chromium`.
- TypeScript dikunci di 6.0.x karena `typescript-eslint` belum mendukung TS 7.

## Aturan wajib

- **Uang = bilangan bulat rupiah** (`Rupiah = number`, harus safe integer). Jangan pernah memakai pecahan atau float.
  - Persen disimpan sebagai basis poin (`Bps`, 10000 = 100%).
  - Pembulatan setengah menjauhi nol, lewat `divRound`/`percentOf` di `src/domain/money.ts`.
  - Tampilan selalu lewat `formatRupiah` → `Rp12.000`.
- **Waktu:** simpan sebagai string ISO UTC.
  - Tampilan dan pengelompokan hari memakai WIB (Asia/Jakarta, UTC+7 tetap) lewat `src/domain/time.ts`.
  - Satu hari laporan = 00:00–23:59 WIB.
- **Semua teks UI berbahasa Indonesia.** Nama di kode (variabel, fungsi, tabel) berbahasa Inggris. README, CLAUDE.md, dan panduan berbahasa Indonesia.
- **Kecepatan kasir:** transaksi 3 item dengan bayar tunai harus selesai dalam ≤10 ketukan, dibuktikan dengan test e2e.
  - Target tap minimal 48px (`min-h-12`).
- **Offline-first:** semua fitur kasir jalan tanpa internet. Setiap baris punya ID dari perangkat (UUIDv7, `src/domain/id.ts`), dan ID itu berfungsi sebagai `client_uuid` untuk dedup di server.
- **Nomor struk:** `KODE-YYMMDD-NNNN` (mis. `K1-261008-0007`).
  - Urutan dihitung per perangkat per hari WIB.
  - Ambil nomornya lewat `allocateReceiptNumber` **di dalam transaksi Dexie yang sama** dengan penyimpanan penjualan.
- **Pembayaran:** tidak ada payment gateway dan tidak ada QRIS dinamis di MVP. Jangan pernah menyimpan data kartu atau rekening pelanggan.
- **Data pelanggan:** opsional dan minimal (nama dan nomor WhatsApp, hanya jika pelanggan ingin dikirimi struk). Harus ada cara menghapusnya.
- **Di luar MVP:** integrasi marketplace, akuntansi, resep/bahan baku detail, dan aplikasi mobile native.
- **Dependensi:** jangan menambah dependensi besar tanpa alasan. Jelaskan setiap dependensi baru di deskripsi PR.
- **Tanya pemilik produk dulu** untuk pilihan yang memengaruhi biaya, keamanan, atau data pelanggan.

## Skema data (`src/db/schema.ts`, `src/db/db.ts`)

- Setiap tabel yang disinkron punya `id`, `storeId`, `createdAt`, `updatedAt`, `syncedAt` (null = belum terkirim), dan `deletedAt` (soft delete).
  - Untuk tabel `stores`, `storeId === id`.
- Nama kolom camelCase di perangkat dipetakan 1:1 ke snake_case di Supabase.
- Tabel:
  - `stores`, `users`, `devices`
  - `categories`, `products`, `variantGroups` (single = Ukuran, multi = Tambahan), `productVariants`
  - `customers`, `shifts`, `transactions`, `transactionItems`
  - `stockMovements`, `auditLog`, `images`
  - Khusus lokal (tidak disinkron): `counters` dan `meta` (`storeId` dan `deviceId` aktif).
- Item transaksi menyimpan **snapshot** nama, harga, HPP, dan varian. Transaksi menyimpan snapshot persen pajak dan layanan.
- **Stok** = jumlah `stockMovements.qtyDelta`. Tidak ada kolom stok yang disinkron.
- **Mengubah indeks Dexie:** tambahkan `this.version(n+1)` beserta upgrade. Jangan pernah mengedit versi lama.

## Keputusan yang sudah disetujui (Okt 2026)

1. **Biaya:** Cloudflare Workers dan Supabase Free selama pengembangan. Naik ke Supabase Pro (US$25/bulan) saat toko pertama mulai memakai sungguhan.
2. **Urutan milestone:** M0 → M1 → M2 → **M5** → M3 → M4 → M6.
3. **Pajak:** diatur per toko.
   - Pilihan `pricesIncludeTax` menentukan harga sudah atau belum termasuk pajak.
   - Untuk harga "belum termasuk":
     - Layanan = % × (subtotal − diskon)
     - PB1 = % × (subtotal − diskon + layanan)
   - Pembulatan ke Rp1. Total tunai tidak dibulatkan ke Rp100/500.
4. **Aksi pemilik di HP kasir** (void/refund, ubah harga/HPP, laporan laba) memakai PIN pemilik.
   - Bisa offline, dan setiap aksi tercatat di `auditLog`.
   - PIN terkunci sementara setelah 5 kali salah.
   - Tidak ada yang bisa menghapus transaksi.
5. **Printer:** ESC/POS 58mm lewat Web Bluetooth (BLE) dan Web Serial (Bluetooth Classic, Chrome Android 137+).
   - Fallback: kirim struk ke WhatsApp dan simpan PDF.
   - Tipe printer pemilik akan dikirim sebelum M2. Uji printer fisik dilakukan pemilik.

### Asumsi MVP

- Satu metode bayar per transaksi.
- Refund selalu penuh.
- Stok dihitung per produk, bukan per varian.
- Satu shift per perangkat.
- Kasir boleh diskon sampai `cashierMaxDiscountBps` (default 0).

### Aturan sinkron (rinciannya ditulis di `docs/sinkron.md` saat M5)

- Transaksi, item, mutasi stok, dan log audit hanya bisa ditambah. Upsert-nya idempoten berdasarkan `id`.
- Status transaksi hanya bisa maju: `paid → void/refunded`.
- Data master memakai last-write-wins per baris dan dicatat di audit.

## Alur Git

- Satu branch dan satu PR per milestone, dengan target `main`.
- Deskripsi PR berisi: apa yang berubah, cara mengetes, screenshot UI (disimpan di `docs/screenshots/<milestone>/`), dan dependensi baru beserta alasannya.
- Setiap PR wajib lolos lint, format, typecheck, unit test, build, dan e2e di CI. Jangan menyatakan selesai jika ada test yang gagal.
