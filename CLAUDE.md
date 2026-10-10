# CLAUDE.md — Reqap, kasir untuk UMKM

Panduan kerja untuk Claude Code di repo ini. Perbarui file ini setiap ada keputusan baru.

## Produk

**Reqap**: aplikasi kasir (POS) web untuk UMKM Indonesia, yaitu kedai kopi/minuman, makanan rumahan (termasuk frozen food), dan toko kecil.

- Nama dan logo dari pemilik (9–10 Okt 2026). Logonya: ponsel, struk, dan kanopi warung, warna biru gradasi.
  - File logo ada di `docs/logo/`:
    - `reqap-logo-asli.jpg`: file asli dari pemilik.
    - `reqap-logo.png`: logo lengkap untuk README.
    - `reqap-symbol.png`: simbol tanpa tulisan, dasar semua ikon.
  - Ikon PWA, ikon iOS, dan `public/favicon-48x48.png` dibuat dengan `node scripts/render-icons.mjs`.
  - Nama di manifest: `name`/`short_name` = "Reqap".
  - Warna UI mengikuti logo: palet `brand-*` (biru) di `@theme` `src/index.css`. Warna utama adalah `brand-700` `#1f5596`, yang juga jadi `theme_color`. Pakai `brand-*` untuk warna utama, jangan warna Tailwind langsung seperti `teal-*`.
  - Nama internal tetap `pos-sederhana`: package dan **nama database IndexedDB**. Database jangan diganti nama, karena data di HP pengguna akan hilang.

- Skala: satu toko dengan 1–3 perangkat kasir.
- Perangkat utama: Chrome di HP/tablet Android. Harus tetap bisa dipakai di laptop.
- Peran: pemilik (akses penuh) dan kasir (akses terbatas).
- Skema data sudah multi-toko sejak awal. UI MVP cukup untuk satu toko.

## Stack

- Vite + React + TypeScript (strict) + Tailwind CSS v4, dijadikan PWA lewat `vite-plugin-pwa`. Register type `prompt`: versi baru tidak memuat ulang otomatis di tengah transaksi.
- IndexedDB lewat Dexie (`dexie-react-hooks` untuk query yang otomatis ter-update). IndexedDB adalah sumber data utama di perangkat.
- Mulai M5: Supabase (Postgres, Auth, RLS, Storage) lewat `@supabase/supabase-js`.
  - Library ini dimuat lazy (`src/cloud/client.ts`), jadi layar kasir tidak menunggunya.
  - URL dan publishable key masuk saat build lewat `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY`, yang diisi di Cloudflare **Settings → Build → Build variables and secrets** (bukan `.env` di repo, supaya build e2e tidak menyentuh project asli). Kotak "Runtime variables and secrets" tidak bisa dipakai untuk Worker yang hanya berisi static assets.
  - Tanpa variabel itu, fitur cloud tersembunyi dan aplikasi berjalan lokal saja.
  - Panduan untuk pemilik: `docs/supabase.md`. Aturan sinkron: `docs/sinkron.md`.
- Deploy: Cloudflare Workers dengan static assets saja, tanpa kode server (gratis, boleh komersial). Konfigurasinya di `wrangler.jsonc`. Panduan: `docs/deploy-cloudflare.md`.
  - `name` di `wrangler.jsonc` harus sama dengan nama Worker di dasbor Cloudflare (`apps-building`). Workers Builds tetap memakai nama Worker yang terhubung kalau beda (lewat `WRANGLER_CI_OVERRIDE_NAME`), tapi akan membuka PR otomatis untuk menyamakannya.
  - Preview build untuk branch PR baru bisa jalan setelah Worker pernah berhasil di-deploy dari `main`. Sebelum itu, check "Workers Builds" gagal dengan pesan "This Worker does not exist on your account".
  - `wrangler.jsonc` wajib ada. Tanpa file ini, `wrangler deploy` menjalankan autoconfig yang mengubah `package.json` (termasuk skrip `preview` yang dipakai Playwright) dan memasang `@cloudflare/vite-plugin`.
  - `"previews": {}` di `wrangler.jsonc` wajib ada. Workers Builds menjalankan `npx wrangler preview` untuk branch PR, dan perintah itu gagal tanpa blok ini ("missing a `previews` block").
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
npm run db:start     # Supabase lokal di Docker (supabase CLI 2.120.0 lewat npx), pasang migrations
npm run db:reset     # pasang ulang supabase/migrations dari nol (setelah mengubah SQL)
npm run test:cloud   # RLS + sinkron dua perangkat terhadap Supabase lokal (src/**/*.cloud.test.ts)
npm run test:e2e:cloud # Playwright dengan sinkron aktif (build ke dist-cloud, port 4174)
```

- Test `*.cloud.test.ts` dan `e2e/cloud.spec.ts` butuh Supabase lokal, jadi tidak ikut `npm test`/`npm run test:e2e`. CI menjalankannya di job terpisah "Supabase lokal".
- Di container cloud Claude, jalankan `dockerd` dulu, lalu pakai `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` saat `supabase start`/`db reset`, karena blob image di public.ecr.aws diblokir proxy.

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

## Struktur dan pola kode

- `src/domain/`: logika murni tanpa React/Dexie, semuanya dengan unit test.
  - `pricing.ts`: urutan hitung diskon baris → subtotal → diskon transaksi → layanan → PB1, termasuk mode harga "sudah termasuk pajak".
  - `cash.ts`: tombol nominal cepat.
  - `pin.ts`: hash PBKDF2 dan kunci 5x salah.
  - `receipt-text.ts`: teks struk dan link `wa.me`.
- `src/db/`: layanan Dexie.
  - `checkout.ts` `completeSale`: satu transaksi IndexedDB untuk nomor struk + transaksi + item + mutasi stok. Harga **selalu dibaca ulang dari katalog** saat bayar, jadi jangan percaya harga dari state UI.
  - `cart.ts`: reducer keranjang. Keranjang hanya menyimpan id dan pilihan.
  - `catalog-admin.ts`: simpan produk/varian/kategori/pengaturan + audit perubahan harga, HPP, dan pengaturan.
  - `auth.ts`: PIN, sesi, dan tambah kasir.
- `src/cloud/`: akun dan sinkron (M5).
  - `sync-engine.ts` `SyncEngine`: push baris `pending` lewat RPC `push_changes`, pull lewat `pull_changes` dengan kursor per tabel (mundur 60 detik), lalu unduh file gambar.
  - `merge.ts`: aturan konflik di HP. Harus sama dengan trigger di SQL.
  - `mapping.ts`: camelCase ↔ snake_case dan jenis tabel (`lww`, `transaction`, `append`).
  - `account.ts`: daftar/masuk pemilik, `connectLocalStore`, `joinStoreAsOwner`, `pairWithCode`, kode pasang, putus perangkat, pesan error berbahasa Indonesia.
  - `link.ts`: status hubungan HP (`meta.cloudLink`) dan `replaceLocalStore` (mengosongkan HP, printer tetap).
  - `sync-manager.ts`: menjadwalkan sinkron dan status untuk UI (`useSyncStatus`).
- Semua tulis lokal ke tabel yang disinkron **wajib** lewat `newRow`/`touched` (`src/db/rows.ts`), yang memberi tanda `pending: 1`. Data dari server ditulis tanpa tanda itu.
- SQL Supabase ada di `supabase/migrations/`.
  - Jangan mengedit migration yang sudah dipasang pemilik. Tambahkan file baru.
  - Pemilik memasang SQL dengan salin-tempel di SQL Editor (keputusan 10).
- Batas diskon kasir ditegakkan di `completeSale` (bukan hanya di UI).
- UI:
  - `react-router` (mode deklaratif, `BrowserRouter`).
  - Halaman pemilik dibungkus `RequireOwner`.
  - Context dan hook dipisah dari provider (`session-context.ts`, `cart-context.ts`) agar fast refresh tidak memberi peringatan.
- Data lokal di tabel `meta`:
  - `activeUserId`: pengguna yang sedang masuk.
  - `cartDraft`: keranjang belum dibayar, agar tidak hilang saat reload.
  - `pinAttempts:<userId>`: hitungan PIN salah.
  - `cloudLink`: `{storeId, role: 'owner' | 'device', linkedAt}` kalau HP terhubung ke cloud.
  - `syncCursors` dan `lastSyncAt`: posisi pull per tabel dan waktu sinkron terakhir.
  - `printer`: satu-satunya entri yang tetap ada saat HP dipindah ke toko lain.
- UUIDv7 monotonik dalam satu milidetik, jadi urutan `id` = urutan dibuat. Item struk diurutkan dengan `sortBy('id')`.
- Font UI: **Poppins** (permintaan pemilik, 9 Okt 2026).
  - Dibundel lewat `@fontsource/poppins` (subset latin, berat 400/600/700) di `src/index.css`, lalu di-precache service worker (`woff2` di `globPatterns`). Jadi font tetap tampil offline dan tidak memanggil Google Fonts.
  - Struk di layar tetap `font-mono`, supaya mirip hasil printer thermal.
  - Kalau memakai berat lain (mis. `font-medium` = 500), impor juga file berat itu.
- Gambar (foto produk, QRIS) dikecilkan di perangkat lewat canvas, lalu disimpan sebagai Blob di tabel `images`.
- Tombol aksi utama di layar bayar dan struk dibuat `sticky` di bawah, agar kasir tidak perlu menggulir.
- Struk (`src/domain/receipt-text.ts`): `receiptSummaryRows` adalah satu-satunya sumber baris ringkasan (subtotal, diskon, layanan, PB1, total, bayar, kembalian). Layar, teks WhatsApp, dan cetakan semuanya memakainya.
- Cetak:
  - `src/domain/receipt-layout.ts` menyusun baris 32 karakter (ASCII lewat `toPrintable`).
  - `src/domain/escpos.ts` mengubahnya menjadi byte ESC/POS: ESC @, ESC a, ESC E, GS ! 0x01 (tinggi ganda), ESC d. Logo dikirim lewat GS v 0 dalam potongan 64 baris, maks. 256 titik.
  - `src/printing/transports.ts`: BLE mencari layanan printer umum lalu menulis per 100 byte. Classic memakai Web Serial SPP.
  - `src/printing/printer.ts` `PrinterManager`: koneksi per sesi. Preferensi disimpan di `meta.printer` (lokal per HP): jenis, nama, deviceId, `autoPrint`.
  - Picker Bluetooth hanya boleh dibuka dari ketukan (`allowPicker`). Cetak otomatis tidak membuka picker.
  - Tipe Web Bluetooth/Serial yang dipakai dideklarasikan sendiri di `src/printing/web-apis.d.ts` (tanpa paket @types).
- PDF (`src/features/struk/pdf.ts`): `window.print()` hanya untuk elemen `[data-print-area]`, dengan `@page` selebar 58 mm dan tinggi sesuai struk (diukur lewat `.print-measure`, lihat `index.css`).
- Test e2e printer memakai printer tiruan di `e2e/printer-mocks.ts`, yang merekam semua byte ke `window.__printed`.
- Test e2e memakai helper di `e2e/helpers.ts`. Layout HP memakai bottom bar dan sheet keranjang, sedangkan laptop (≥1024px) memakai panel keranjang di kanan.

## Skema data (`src/db/schema.ts`, `src/db/db.ts`)

- Setiap tabel yang disinkron punya `id`, `storeId`, `createdAt`, `updatedAt`, `syncedAt` (null = belum terkirim), dan `deletedAt` (soft delete).
  - Untuk tabel `stores`, `storeId === id`.
  - Khusus di HP (tidak dikirim): `pending` (1 = ada perubahan yang belum terkirim, terindeks sejak Dexie v2) dan `syncError` (alasan penolakan server).
  - `images.blob` bisa `null` sementara file dari HP lain belum terunduh. File gambar disimpan di Storage bucket `store-images` dengan path `<store_id>/<id>`.
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
   - Printer pemilik: **Putian POS 583-01** (58 mm, ESC/POS), **belum dibeli** per 9 Okt 2026. Jenis Bluetooth-nya (BLE atau Classic) belum dipastikan, jadi keduanya didukung. Cetak fisik belum pernah diuji; semua test memakai printer tiruan. Setelah printer ada, pemilik menjalankan Tes cetak dan perbaikan dikerjakan di PR terpisah. Panduan: `docs/printer.md`.

6. **PIN pemilik pertama** dibuat oleh orang pertama yang memilih "Pemilik" di HP yang belum terhubung ke cloud.
   - Mulai M5, di HP kasir yang dipasang dengan kode, PIN pemilik tidak bisa dibuat atau diubah. PIN pemilik datang dari HP pemilik lewat sinkron.
   - RLS juga menolak perubahan baris pemilik dari HP kasir.
7. **Nomor WhatsApp pelanggan** hanya dipakai untuk membuka `wa.me` dan tidak disimpan (privasi). Tabel `customers` belum dipakai.
8. **HP kasir dipasang dengan kode** dari HP pemilik (disetujui 9 Okt 2026).
   - HP kasir login anonim di Supabase, jadi tidak perlu email.
   - Kodenya 8 karakter (bukan 6 digit, agar tidak bisa ditebak), berlaku 10 menit, sekali pakai, dan maksimal 5 kali salah per jam.
   - Pemilik bisa memutus HP dari Pengaturan.
   - Setiap HP mendapat kode perangkat sendiri (K1, K2, …) dari server.
9. **Login pemilik:** email + password (Supabase Auth, konfirmasi email aktif).
   - Email bawaan Supabase cukup karena email pemilik sama dengan akun Supabase-nya. Email bawaan hanya mengirim ke anggota tim, maks. ±2 per jam.
   - MVP: satu akun pemilik untuk satu toko.
10. **Perubahan database** dipasang pemilik dengan salin-tempel file SQL di SQL Editor Supabase. Tidak ada token Supabase yang disimpan di GitHub.

### Asumsi MVP

- Satu metode bayar per transaksi.
- Refund selalu penuh.
- Stok dihitung per produk, bukan per varian.
- Satu shift per perangkat.
- Kasir boleh diskon sampai `cashierMaxDiscountBps` (default 0).

### Aturan sinkron (rincian: `docs/sinkron.md`)

- Transaksi, item, mutasi stok, dan log audit hanya bisa ditambah. Upsert-nya idempoten berdasarkan `id`.
- Status transaksi hanya bisa maju: `paid → void/refunded`.
- Data master memakai last-write-wins per baris dan dicatat di audit. `updated_at` lebih dari 5 menit di masa depan dipotong ke waktu server.
- Aturan ini ditegakkan oleh trigger di server **dan** `mergeRemote` di HP. Ubah keduanya bersamaan.
- RLS: hanya anggota toko (`store_members`, peran `owner`/`device`) yang bisa membaca/menulis data toko. Tidak ada `DELETE` lewat API. Dibuktikan di `src/cloud/rls.cloud.test.ts`.

## Alur Git

- Satu branch dan satu PR per milestone, dengan target `main`.
- Deskripsi PR berisi: apa yang berubah, cara mengetes, screenshot UI (disimpan di `docs/screenshots/<milestone>/`), dan dependensi baru beserta alasannya.
- Setiap PR wajib lolos lint, format, typecheck, unit test, build, dan e2e di CI. Jangan menyatakan selesai jika ada test yang gagal.
