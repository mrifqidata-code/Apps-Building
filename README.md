# POS Sederhana untuk UMKM

Aplikasi kasir (POS) berbasis web untuk kedai kopi/minuman, usaha makanan rumahan, dan toko kecil di Indonesia.

- **Cepat dipakai kasir:** tombol besar dan ramah jari.
- **Tetap jalan saat internet putus:** data disimpan di perangkat dan disinkronkan saat online (mulai M5).
- **Murah dioperasikan:** hosting gratis di Cloudflare Workers.

Dibuat sebagai PWA, jadi bisa dipasang di layar utama HP/tablet Android lewat Chrome. Bisa juga dipakai di laptop.

## Status milestone

| Milestone | Isi                                                   | Status       |
| --------- | ----------------------------------------------------- | ------------ |
| M0        | Fondasi: proyek, PWA, CI, skema data, data demo       | ✅ PR ini    |
| M1        | Layar kasir offline: produk, keranjang, bayar, struk  | Berikutnya   |
| M2        | Cetak struk Bluetooth, PDF, WhatsApp, pengaturan toko | Direncanakan |
| M5        | Akun dan sinkron cloud (Supabase)                     | Direncanakan |
| M3        | Kas, shift, laporan, ekspor CSV                       | Direncanakan |
| M4        | Stok                                                  | Direncanakan |
| M6        | Pengerasan: void/refund, log audit, panduan pemakaian | Direncanakan |

M5 sengaja dikerjakan sebelum M3, supaya laporan dan stok langsung dibangun di atas data dari semua perangkat.

## Menjalankan di komputer sendiri

Yang dibutuhkan:

- [Node.js](https://nodejs.org/) versi 22 atau lebih baru. Pilih versi **LTS** saat mengunduh.
- [Git](https://git-scm.com/downloads).

Buka terminal, lalu jalankan:

```bash
git clone https://github.com/mrifqidata-code/Apps-Building.git
cd Apps-Building
npm install
npm run dev
```

Buka alamat yang muncul di terminal, biasanya `http://localhost:5173`. Saat pertama dibuka, aplikasi otomatis berisi data demo "Kedai Kopi Senja" (15 produk, 3 kategori).

Untuk mencoba dari HP di jaringan Wi-Fi yang sama, jalankan `npm run dev -- --host`, lalu buka alamat `Network` yang muncul di terminal.

## Perintah

| Perintah            | Fungsi                                                     |
| ------------------- | ---------------------------------------------------------- |
| `npm run dev`       | Menjalankan aplikasi untuk pengembangan                    |
| `npm run build`     | Membuat versi produksi di folder `dist`                    |
| `npm run preview`   | Menjalankan hasil build (service worker/offline aktif)     |
| `npm run lint`      | Memeriksa gaya dan potensi bug di kode (ESLint)            |
| `npm run format`    | Merapikan format kode (Prettier)                           |
| `npm run typecheck` | Memeriksa tipe TypeScript                                  |
| `npm test`          | Unit test (Vitest)                                         |
| `npm run test:e2e`  | Test alur di browser sungguhan (Playwright), HP dan laptop |
| `npm run check`     | Lint, format, typecheck, dan unit test sekaligus           |

Sebelum menjalankan `npm run test:e2e` pertama kali, pasang dulu browser untuk test dengan `npx playwright install chromium`.

## Menayangkan ke internet

Ikuti [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md). Ada langkah demi langkah sampai aplikasi terpasang di HP.

## Struktur kode

```
src/
  domain/     logika murni tanpa UI/database: uang, waktu WIB, ID, nomor struk
  db/         database di perangkat (IndexedDB lewat Dexie): skema, data demo
  features/   layar aplikasi per fitur (kasir, dan seterusnya)
  pwa/        pemasangan aplikasi dan pembaruan versi
  ui/         komponen dan hook tampilan bersama
e2e/          test Playwright
docs/         panduan
```

Keputusan arsitektur dan konvensi kode dicatat di [CLAUDE.md](CLAUDE.md).
