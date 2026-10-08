# Menayangkan aplikasi ke internet (Cloudflare Pages)

Panduan ini cukup dilakukan **sekali**. Setelah itu, setiap perubahan yang di-merge ke branch `main` akan otomatis tayang, dan setiap pull request mendapat link pratinjau sendiri.

Biaya: **gratis**. Paket gratis Cloudflare Pages boleh dipakai untuk usaha komersial.

## Yang perlu disiapkan

- Akun GitHub yang memiliki repo `Apps-Building` (sudah ada).
- Alamat email untuk mendaftar Cloudflare.

## Langkah-langkah

1. **Daftar Cloudflare.** Buka <https://dash.cloudflare.com/sign-up>, isi email dan kata sandi, lalu verifikasi email Anda.
2. **Buka menu Workers & Pages.** Di dasbor Cloudflare, pilih **Workers & Pages** di menu kiri (kadang ada di bawah **Compute**).
3. **Buat aplikasi Pages.** Klik **Create** (atau **Create application**), pilih tab **Pages**, lalu pilih **Import an existing Git repository** / **Connect to Git**.
   - Kalau yang muncul hanya pilihan "Workers", cari tautan kecil seperti _"Looking to deploy Pages? Get started"_.
4. **Hubungkan GitHub.** Pilih **GitHub**, login, lalu izinkan Cloudflare mengakses repo **Apps-Building** saja (pilih _Only select repositories_).
5. **Isi pengaturan build** persis seperti ini:

   | Kolom                  | Isi             |
   | ---------------------- | --------------- |
   | Project name           | `pos-sederhana` |
   | Production branch      | `main`          |
   | Framework preset       | `None`          |
   | Build command          | `npm run build` |
   | Build output directory | `dist`          |

   Bagian _Environment variables_ dibiarkan kosong. Versi Node sudah diatur otomatis lewat file `.nvmrc`.

6. Klik **Save and Deploy**, lalu tunggu 1–3 menit sampai statusnya **Success**.
7. Aplikasi Anda sekarang ada di `https://pos-sederhana.pages.dev`. Kalau nama itu sudah dipakai orang lain, Cloudflare memberi nama lain. Lihat alamatnya di halaman proyek.

## Memasang aplikasi di HP Android

1. Buka alamat aplikasi di **Chrome**.
2. Ketuk tombol **Pasang aplikasi** di pojok kanan atas. Kalau tombolnya tidak muncul, ketuk menu **⋮** lalu pilih **Instal aplikasi** atau **Tambahkan ke layar utama**.
3. Ikon **Kasir** akan muncul di layar utama. Bukalah sekali saat ada internet. Setelah muncul tulisan "Aplikasi siap dipakai tanpa internet", aplikasi bisa dibuka walaupun internet mati.

## Link pratinjau untuk pull request

Setelah langkah di atas selesai, setiap pull request otomatis mendapat link pratinjau. Link ini muncul sebagai komentar atau status dari Cloudflare di halaman PR. Gunakan link itu untuk mencoba perubahan di HP sebelum Anda menyetujui PR.

## Kalau ada masalah

- **Build gagal:** buka proyek di Cloudflare → **Deployments** → klik deployment yang gagal → salin isi log, lalu kirimkan ke Claude.
- **Aplikasi tidak berubah setelah update:** tutup aplikasi lalu buka lagi. Kalau muncul tulisan "Versi baru tersedia", ketuk **Muat ulang**.
