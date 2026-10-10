# Panduan Supabase: akun pemilik dan sinkron antar-HP

Mulai M5, data toko bisa disimpan di cloud (Supabase). Manfaatnya:

- **Cadangan otomatis.** Kalau HP rusak atau hilang, data toko tidak ikut hilang.
- **Beberapa HP kasir.** Produk, harga, dan penjualan dari semua HP terkumpul di satu tempat.
- **Tetap jalan tanpa internet.** Penjualan disimpan di HP dulu, lalu dikirim saat online.

Tanpa langkah di bawah, aplikasi tetap berjalan seperti sebelumnya dan data hanya ada di HP itu.

Waktu yang dibutuhkan: sekitar 20 menit, cukup sekali.

## A. Membuat project Supabase

1. Buka **supabase.com**, ketuk **Start your project**, lalu **Continue with GitHub** dan izinkan.
2. Kalau diminta membuat _organization_: isi nama bebas (misalnya nama usaha) dan pilih paket **Free**.
3. Ketuk **New project**, lalu isi:
   - **Name:** `pos-kasir`
   - **Database Password:** ketuk **Generate a password**, lalu simpan di tempat aman (misalnya Google Password Manager). Password ini tidak dipakai aplikasi; **jangan dibagikan ke siapa pun**.
   - **Region:** **Southeast Asia (Singapore)**, karena paling dekat dengan Indonesia.
   - Pilihan lain biarkan bawaan. Ketuk **Create new project**, tunggu 1–2 menit.

## B. Memasang tabel database (salin-tempel SQL)

1. Di GitHub, buka file [`supabase/migrations/20261009120000_m5_akun_sinkron.sql`](../supabase/migrations/20261009120000_m5_akun_sinkron.sql).
2. Ketuk ikon **Copy raw file** (dua kotak bertumpuk) di kanan atas isi file.
3. Di Supabase, buka menu kiri **SQL Editor**, ketuk **New query**, tempel isinya, lalu ketuk **Run**.
4. Hasil yang benar: **Success. No rows returned**.

Kalau tidak sengaja menjalankan dua kali, akan muncul error "already exists". Itu aman: tidak ada yang berubah.

Setelah itu, lanjutkan dengan file SQL milestone berikutnya di bagian **Memperbarui database** di bawah.

### Memperbarui database

Setiap milestone yang mengubah database membawa file SQL baru di folder `supabase/migrations/`. Jalankan setiap file baru **sekali**, berurutan sesuai nama file, dengan cara yang sama seperti langkah B.1–B.4.

| File                                                                                              | Milestone | Isi                                  |
| ------------------------------------------------------------------------------------------------- | --------- | ------------------------------------ |
| [`20261009120000_m5_akun_sinkron.sql`](../supabase/migrations/20261009120000_m5_akun_sinkron.sql) | M5        | Akun, perangkat, sinkron (langkah B) |
| [`20261010120000_m3_kas.sql`](../supabase/migrations/20261010120000_m3_kas.sql)                   | M3        | Kas masuk/keluar saat shift          |

- Jalankan file baru **sebelum** versi aplikasinya di-merge, supaya HP langsung bisa mengirim data baru. File M3 aman dijalankan lebih dari sekali.
- Kalau terlambat, tidak ada data yang hilang. Catatan kas masuk/keluar tetap tersimpan di HP dan ditahan sampai database diperbarui. Selama itu, **Pengaturan → Akun & sinkron** menampilkan pesan "Database cloud belum diperbarui".

## C. Mengaktifkan login

1. Buka **Authentication → Sign In / Providers** (di beberapa tampilan namanya **Providers**).
   - Nyalakan **Allow anonymous sign-ins**, lalu **Save**. Ini dipakai HP kasir yang dipasang dengan kode. HP kasir tidak perlu email.
   - Pastikan **Email** aktif dan **Confirm email** menyala (bawaannya sudah begitu).
2. Buka **Authentication → URL Configuration**.
   - **Site URL:** `https://apps-building.mrifqidata.workers.dev`
   - **Redirect URLs:** ketuk **Add URL** dan tambahkan dua alamat ini:
     - `https://apps-building.mrifqidata.workers.dev/**`
     - `https://*-apps-building.mrifqidata.workers.dev/**` (untuk versi pratinjau PR)

Alamat ini dipakai tautan di email konfirmasi dan email "lupa password".

## D. Menghubungkan aplikasi ke Supabase (Cloudflare)

1. Di Supabase, buka **Project Settings → API Keys** (atau tombol **Connect** di atas). Salin:
   - **Project URL**, contohnya `https://abcdefgh.supabase.co`
   - **Publishable key**, yang diawali `sb_publishable_…`
2. Di dasbor Cloudflare, buka **Workers & Pages → apps-building → Settings**, gulir ke bagian **Build**, lalu cari kotak **Build variables and secrets** dan klik **Add**. Tambahkan dua variabel bertipe **Text**:

   | Nama variabel                   | Isi             |
   | ------------------------------- | --------------- |
   | `VITE_SUPABASE_URL`             | Project URL     |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key |

   Jangan pakai kotak **Runtime variables and secrets**. Kotak itu menampilkan "Variables cannot be added to a Worker that only has static assets", karena aplikasi ini tidak punya kode server. Variabel Supabase dibaca saat aplikasi dibangun, jadi tempatnya di **Build variables and secrets**.

3. Variabel berlaku mulai build berikutnya, misalnya saat PR di-merge atau ada commit baru di PR.

Project URL dan publishable key aman dimasukkan ke aplikasi, karena memang ikut terkirim ke setiap HP. Yang **tidak boleh** dibagikan atau dimasukkan ke GitHub/Cloudflare: **secret key** (`sb_secret_…` atau `service_role`) dan **password database**.

## E. Pemakaian pertama

### HP pemilik

1. Buka aplikasi. Di layar **Siapa yang bertugas?**, ketuk **Masuk akun pemilik (email)**.
   - Kalau aplikasi sudah dipakai: masuk sebagai Pemilik, lalu **Pengaturan → Akun & sinkron → Hubungkan ke akun pemilik**.
2. Pilih **Daftar baru**, isi email dan password (minimal 8 karakter), lalu ketuk **Daftar**.
3. Buka email dari Supabase dan ketuk tautan konfirmasinya. Kembali ke aplikasi, lalu **Masuk**.
4. Pilih salah satu:
   - **Simpan toko ini ke akun**: produk, pengaturan, dan penjualan yang sudah ada di HP ini diunggah.
   - **Mulai toko baru yang kosong**: data contoh dihapus, lalu Anda mengisi produk sendiri.
5. Masuk sebagai **Pemilik** dengan PIN. Di **Pengaturan → Akun & sinkron**, status harus **Tersinkron**.

### Menambah HP kasir

1. Di HP pemilik: **Pengaturan → Akun & sinkron → Tambah HP kasir**. Muncul kode 8 huruf/angka, misalnya `K7QX-M2PD`. Kode berlaku 10 menit dan hanya untuk satu HP.
2. Di HP kasir: buka aplikasi, ketuk **Pasang HP kasir dengan kode**, ketik kode, beri nama HP (misalnya "Kasir depan"), lalu ketuk **Pasang HP ini**.
3. HP kasir mengambil data toko, lalu menampilkan layar **Siapa yang bertugas?**. Kasir masuk dengan PIN seperti biasa.

Setiap HP mendapat kode sendiri (K1, K2, K3, …) yang dipakai di nomor struk, jadi nomor struk tidak pernah bentrok.

### Ganti HP pemilik

Di HP baru: **Masuk akun pemilik (email)** → masuk → **Pakai toko ini di HP ini**. PIN pemilik tetap sama.

### HP hilang atau kasir berhenti

Di HP pemilik: **Pengaturan → Akun & sinkron → Perangkat**, lalu ketuk **Putus** pada HP tersebut. HP itu tidak bisa membaca atau mengirim data lagi. Penjualan yang sudah terkirim tetap aman.

## F. Arti status di kanan atas layar

| Status                   | Artinya                                                                |
| ------------------------ | ---------------------------------------------------------------------- |
| Tersinkron               | Semua data di HP ini sudah ada di cloud.                               |
| Belum terkirim           | Ada perubahan yang sedang/akan dikirim dalam beberapa detik.           |
| Offline · belum terkirim | Tidak ada internet. Data aman di HP dan otomatis terkirim saat online. |
| Perlu masuk lagi         | Sesi akun berakhir. Pemilik: masuk lagi lewat Pengaturan.              |
| Diputus pemilik          | HP ini sudah diputus. Minta kode baru untuk memasang ulang.            |
| Sinkron gagal            | Server menolak atau sedang bermasalah. Dicoba lagi otomatis.           |
| Ada data ditolak         | Ada data yang ditolak server. Kirim screenshot Pengaturan ke Claude.   |

## G. Batas paket Free dan kapan naik ke Pro

Paket Free cukup untuk uji coba dan satu toko kecil:

- Database 500 MB dan penyimpanan gambar 1 GB.
- **Project dijeda otomatis kalau tidak dipakai 7 hari.** Data tetap aman; buka dasbor Supabase dan ketuk **Restore project**.
- Email bawaan Supabase dibatasi sekitar 2 email per jam dan hanya ke email anggota tim project. Karena email pemilik sama dengan akun Supabase, konfirmasi dan "lupa password" tetap terkirim.

Sesuai keputusan awal, naik ke **Supabase Pro (US$25/bulan)** saat toko mulai dipakai sungguhan: tidak ada jeda otomatis dan ada backup harian.

## H. Kalau ada masalah

| Pesan                                   | Coba ini                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------- |
| Pemasangan HP kasir belum diaktifkan    | Nyalakan **Allow anonymous sign-ins** (langkah C.1).                        |
| Email belum dikonfirmasi                | Buka email dari Supabase dan ketuk tautannya. Cek juga folder Spam.         |
| Terlalu banyak email terkirim           | Tunggu sekitar 1 jam, lalu coba lagi.                                       |
| Kode salah atau sudah kedaluwarsa       | Buat kode baru di HP pemilik. Kode hanya berlaku 10 menit dan sekali pakai. |
| Data toko belum terkirim ke cloud       | Tunggu status **Tersinkron** di HP pemilik, lalu buat kode lagi.            |
| Tidak ada koneksi internet              | Periksa internet. Penjualan tetap tersimpan di HP.                          |
| Tombol akun tidak muncul di layar masuk | Variabel Cloudflare belum terpasang atau belum di-build ulang (langkah D).  |

Cara kerja dan aturan sinkronnya dijelaskan di [docs/sinkron.md](sinkron.md).
