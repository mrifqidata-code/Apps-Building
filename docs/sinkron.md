# Aturan sinkron dan keamanan data

Dokumen ini menjelaskan bagaimana data berpindah antara HP dan Supabase, apa yang terjadi kalau dua HP mengubah data yang sama, dan siapa boleh melihat apa. Panduan memasang Supabase ada di [supabase.md](supabase.md).

## Prinsip dasar

1. **HP adalah tempat kerja utama.** Semua transaksi disimpan dulu di HP (IndexedDB). Aplikasi tidak pernah menunggu internet untuk menyelesaikan penjualan.
2. **Server adalah titik temu.** Setiap HP mengirim perubahannya ke server, lalu mengambil perubahan dari HP lain.
3. **ID dibuat di HP** (UUIDv7). Baris dikenali dari ID-nya, jadi mengirim baris yang sama dua kali tidak pernah membuat data ganda.
4. **Tidak ada yang dihapus.** Penghapusan memakai `deletedAt` (soft delete), supaya penghapusan juga sampai ke HP lain. Lewat API, tidak ada yang bisa menjalankan `DELETE`.

## Alur satu kali sinkron

`SyncEngine.syncOnce()` di `src/cloud/sync-engine.ts`:

1. **Kirim (push).**
   - Setiap perubahan lokal (`newRow`/`touched` di `src/db/rows.ts`) menandai baris dengan `pending: 1`. Field ini terindeks, jadi mencari baris yang belum terkirim tidak perlu memindai seluruh tabel.
   - Baris dikirim per 300 lewat RPC `push_changes`, tabel induk lebih dulu.
   - File gambar diunggah ke Storage sebelum barisnya.
   - Setelah server menerima, tanda `pending` dihapus, tapi hanya kalau baris itu tidak diubah lagi selama pengiriman.
   - Baris yang ditolak server tetap `pending` dan mendapat `syncError`. Baris itu dicoba lagi tanpa menghalangi baris lain.
2. **Ambil (pull).**
   - Untuk setiap tabel, HP menyimpan kursor `{ts, id}` dari baris terakhir yang sudah diterima (urutan `synced_at, id`).
   - Pull berikutnya mulai **60 detik sebelum** kursor itu. Sebabnya: baris dari transaksi database yang lebih lama bisa terlihat setelah baris yang lebih baru. Baris yang terambil ulang aman karena diterapkan idempoten.
   - Halaman berisi 500 baris per tabel dan diulang sampai habis.
3. **Gambar.** Baris gambar dari HP lain disimpan dengan `blob: null`, lalu filenya diunduh dari Storage.

`SyncManager` (`src/cloud/sync-manager.ts`) menjalankan sinkron:

- 1,5 detik setelah ada perubahan lokal,
- setiap 30 detik,
- saat internet kembali,
- saat aplikasi dibuka lagi.

## Aturan konflik

Aturan ini berlaku di **dua tempat dengan isi yang sama**: trigger di database (`supabase/migrations/…_m5_akun_sinkron.sql`) dan `mergeRemote` di HP (`src/cloud/merge.ts`). Server tetap menegakkannya walaupun ada yang memanggil API langsung.

| Jenis data                                                                                       | Aturan                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Data master**: toko, pengguna, perangkat, kategori, produk, grup varian, varian, shift, gambar | **Last write wins per baris**: versi dengan `updatedAt` terbaru yang dipakai. Versi yang lebih lama atau sama diabaikan server, dan server mengirim balik versinya supaya HP ikut menyesuaikan. Perubahan harga, HPP, dan pengaturan tercatat di log audit. |
| **Transaksi**                                                                                    | Tidak pernah diedit. Hanya status yang boleh maju **sekali**: `paid → void` atau `paid → refunded`, beserta alasan, pelaku, dan waktunya. Void dari HP lain selalu diterima. Salinan lama berstatus `paid` tidak bisa membatalkan void.                     |
| **Item transaksi, mutasi stok, log audit**                                                       | **Hanya bisa ditambah.** Mengirim ulang baris yang sudah ada tidak mengubah apa pun. Server menolak `UPDATE` dan `DELETE`.                                                                                                                                  |

Akibat yang perlu diketahui:

- **Stok tidak pernah bentrok.** Stok adalah jumlah `qtyDelta` dari semua mutasi, jadi penjualan bersamaan di dua HP sama-sama terhitung.
- **Nomor struk tidak pernah bentrok.** Setiap HP punya kode sendiri (K1, K2, …) yang dibagikan server saat HP dipasang. Kode perangkat tidak bisa diubah.
- **Edit bersamaan pada baris yang sama:** yang terakhir menang untuk seluruh baris. Contoh: HP A mengubah harga pukul 10.00 dan HP B mengubah nama produk yang sama pukul 10.05. Hasilnya, versi HP B dipakai, termasuk harga lamanya. Ini jarang terjadi karena data master hanya diubah pemilik.
- **Jam HP yang salah.** `updatedAt` berasal dari jam HP. Server memotong waktu yang lebih dari 5 menit di masa depan menjadi waktu server, supaya HP dengan jam terlalu maju tidak menang selamanya.

## Akun, perangkat, dan izin

| Siapa          | Cara masuk                                                              | Boleh                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pemilik**    | Email + password (Supabase Auth), boleh di beberapa HP.                 | Semua data tokonya, membuat kode pasang, memutus perangkat, mengubah data pemilik.                                                              |
| **HP kasir**   | Akun anonim yang dipasang dengan kode dari pemilik (`role = 'device'`). | Membaca dan mengirim data tokonya. Tidak boleh mengubah baris pengguna pemilik (PIN, peran), mengubah perangkat lain, atau membuat kode pasang. |
| **Orang lain** | —                                                                       | Tidak bisa membaca atau menulis apa pun.                                                                                                        |

Di dalam aplikasi, pemilik dan kasir tetap masuk dengan **PIN** di setiap HP (cepat dan offline). Aksi pemilik di HP kasir memakai PIN pemilik (keputusan 4 di CLAUDE.md). Karena itu HP kasir boleh mengirim perubahan data master, misalnya harga yang diubah pemilik di HP kasir.

### Row Level Security (RLS)

- Tabel `store_members` mencatat siapa anggota toko mana, dengan peran `owner` atau `device`. Hanya fungsi di server yang bisa mengubahnya.
- Setiap tabel yang disinkron memakai RLS `private.is_member(store_id)`. Hasilnya, data satu toko tidak bisa dibaca atau ditulis dari akun toko lain.
- Gambar di bucket `store-images` disimpan di path `<store_id>/<image_id>` dengan aturan yang sama.
- Bukti otomatis ada di `src/cloud/rls.cloud.test.ts`, yang dijalankan di CI terhadap Supabase lokal. Test ini mencakup:
  - baca/tulis lintas toko,
  - menimpa baris toko lain lewat ID,
  - hapus dan ubah transaksi,
  - akses tanpa akun,
  - gambar,
  - batas HP kasir,
  - kode pasang,
  - perangkat yang diputus.

### Kode pasang

- 8 karakter dari 32 huruf/angka (tanpa 0/O/1/I), berlaku 10 menit, sekali pakai. Server hanya menyimpan hash SHA-256 kode.
- Satu akun HP hanya boleh salah memasukkan kode 5 kali per jam.
- Hanya akun pemilik dengan email terkonfirmasi yang bisa membuat toko dan kode pasang. Satu akun pemilik untuk satu toko (MVP).

### Memutus perangkat

`revoke_device` mengisi `store_members.revoked_at` dan menonaktifkan baris perangkat. Panggilan sinkron berikutnya dari HP itu mendapat `not_member`. Aplikasi lalu menampilkan **Diputus pemilik** dan berhenti sinkron. Data yang sudah ada di HP tetap tersimpan di HP.

## Data yang perlu diketahui pemilik

- **Hash PIN** (PBKDF2, 100.000 iterasi) ikut tersinkron ke semua HP toko, supaya kasir bisa masuk di HP mana pun tanpa internet. PIN 4–6 angka bisa ditebak kalau seseorang memegang hash-nya. Karena itu hanya anggota toko yang bisa membacanya, dan perangkat yang hilang sebaiknya segera **diputus**.
- **Nomor WhatsApp pelanggan** tetap tidak disimpan (keputusan 7). Tabel `customers` ada di skema, tapi belum dipakai.
- Tidak ada data kartu atau rekening pelanggan yang disimpan.

## Menguji

```bash
npm run db:start        # Supabase lokal di Docker (sekali); memasang supabase/migrations
npm run test:cloud      # RLS + sinkron dua perangkat (Vitest, src/**/*.cloud.test.ts)
npm run test:e2e:cloud  # dua browser: daftar pemilik, pasang HP kasir, jual offline, putus HP
```

Unit test mesin sinkron dengan server tiruan (`src/test/fake-cloud.ts`) ikut berjalan di `npm test` biasa.
