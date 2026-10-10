<p align="center"><img src="docs/logo/reqap-logo.png" alt="Reqap, POS sederhana untuk UMKM" width="320"></p>

# Reqap: kasir untuk UMKM

**Reqap** adalah aplikasi kasir (POS) berbasis web untuk kedai kopi/minuman, usaha makanan rumahan, dan toko kecil di Indonesia.

- **Cepat dipakai kasir:** tombol besar dan ramah jari.
- **Tetap jalan saat internet putus:** data disimpan di perangkat dan disinkronkan ke cloud saat online.
- **Murah dioperasikan:** hosting gratis di Cloudflare Workers.

Dibuat sebagai PWA, jadi bisa dipasang di layar utama HP/tablet Android lewat Chrome. Bisa juga dipakai di laptop.

## Status milestone

| Milestone | Isi                                                   | Status       |
| --------- | ----------------------------------------------------- | ------------ |
| M0        | Fondasi: proyek, PWA, CI, skema data, data demo       | ✅ Selesai   |
| M1        | Layar kasir offline: produk, keranjang, bayar, struk  | ✅ Selesai   |
| M2        | Cetak struk Bluetooth, PDF, WhatsApp, pengaturan toko | ✅ Selesai   |
| M5        | Akun pemilik, HP kasir dengan kode, sinkron Supabase  | ✅ PR ini    |
| M3        | Kas, shift, laporan, ekspor CSV                       | Direncanakan |
| M4        | Stok                                                  | Direncanakan |
| M6        | Pengerasan: void/refund, log audit, panduan pemakaian | Direncanakan |

M5 sengaja dikerjakan sebelum M3, supaya laporan dan stok langsung dibangun di atas data dari semua perangkat.

## Mencoba aplikasi

1. Saat pertama dibuka, pilih **Pemilik** lalu buat PIN (4–6 angka). Pengguna pertama yang memilih "Pemilik" di perangkat baru menentukan PIN pemilik, jadi lakukan ini sendiri sebelum perangkat dipakai kasir.
2. Pemilik bisa:
   - mengunggah gambar QRIS toko di **Pengaturan**,
   - menambah kasir dan mengatur ulang PIN di **Pengaturan**,
   - mengelola produk, kategori, varian, dan foto di **Produk**.
3. Kasir masuk dengan PIN sendiri. Kasir hanya melihat menu **Kasir** dan **Riwayat**.
4. Alur jualan: ketuk produk → **Bayar** → pilih nominal tunai atau QRIS/Transfer → **Selesaikan**. Struk tampil di layar dan bisa dikirim ke WhatsApp.

Semua langkah di atas tetap jalan tanpa internet. Data tersimpan di perangkat.

## Akun pemilik dan beberapa HP kasir

Setelah Supabase disiapkan ([docs/supabase.md](docs/supabase.md)), pemilik bisa:

- masuk dengan email,
- menyimpan data toko di cloud,
- memasang HP kasir lain dengan kode 8 huruf.

Penjualan dari semua HP terkumpul dan tersinkron otomatis, termasuk yang dibuat saat offline. Aturan sinkron dan keamanannya: [docs/sinkron.md](docs/sinkron.md).

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

| Perintah                 | Fungsi                                                     |
| ------------------------ | ---------------------------------------------------------- |
| `npm run dev`            | Menjalankan aplikasi untuk pengembangan                    |
| `npm run build`          | Membuat versi produksi di folder `dist`                    |
| `npm run preview`        | Menjalankan hasil build (service worker/offline aktif)     |
| `npm run lint`           | Memeriksa gaya dan potensi bug di kode (ESLint)            |
| `npm run format`         | Merapikan format kode (Prettier)                           |
| `npm run typecheck`      | Memeriksa tipe TypeScript                                  |
| `npm test`               | Unit test (Vitest)                                         |
| `npm run test:e2e`       | Test alur di browser sungguhan (Playwright), HP dan laptop |
| `npm run check`          | Lint, format, typecheck, dan unit test sekaligus           |
| `npm run db:start`       | Menjalankan Supabase lokal di Docker (untuk test sinkron)  |
| `npm run test:cloud`     | Test RLS dan sinkron dua perangkat ke Supabase lokal       |
| `npm run test:e2e:cloud` | Test browser dengan sinkron aktif (dua HP)                 |

Sebelum menjalankan `npm run test:e2e` pertama kali, pasang dulu browser untuk test dengan `npx playwright install chromium`. Test cloud butuh [Docker](https://docs.docker.com/get-docker/) yang menyala.

## Printer struk

Panduan menghubungkan printer thermal 58 mm Bluetooth (termasuk Putian POS 583-01), cara mencetak, dan solusi kalau gagal: [docs/printer.md](docs/printer.md).

## Menayangkan ke internet

Ikuti [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md). Ada langkah demi langkah sampai aplikasi terpasang di HP.

## Struktur kode

```
src/
  domain/     logika murni tanpa UI/database: uang, harga & pajak, waktu WIB, ID,
              nomor struk, PIN, teks struk WhatsApp, tata letak struk 58 mm, ESC/POS
  db/         database di perangkat (IndexedDB lewat Dexie): skema, keranjang,
              simpan transaksi, kelola produk, PIN, data demo
  cloud/      akun pemilik, kode pasang HP kasir, mesin sinkron ke Supabase
  app/        sesi pengguna, layout, dan penjaga halaman (khusus pemilik)
  features/   layar per fitur: masuk, akun, kasir, bayar, struk, riwayat, produk, pengaturan
  printing/   koneksi printer Bluetooth (BLE lewat Web Bluetooth, Classic lewat Web Serial)
  pwa/        pemasangan aplikasi dan pembaruan versi
  ui/         komponen tampilan bersama (tombol, sheet, keypad PIN, input rupiah)
supabase/     konfigurasi Supabase lokal dan SQL database (migrations)
e2e/          test Playwright
docs/         panduan
```

Keputusan arsitektur dan konvensi kode dicatat di [CLAUDE.md](CLAUDE.md).
