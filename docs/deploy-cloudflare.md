# Menayangkan aplikasi ke internet (Cloudflare Workers)

Panduan ini cukup dilakukan **sekali**. Setelah itu:

- Setiap perubahan yang di-merge ke branch `main` akan otomatis tayang.
- Setiap branch pull request mendapat versi pratinjau sendiri.

Biaya: **gratis**. Paket gratis Cloudflare Workers boleh dipakai untuk usaha komersial. Aplikasi ini hanya berisi file statis (tanpa kode server), dan permintaan file statis tidak dihitung kuota.

> Cloudflare sekarang mengarahkan proyek baru ke **Workers**, bukan Pages. Repo ini sudah punya file `wrangler.jsonc` yang memberi tahu Cloudflare cara menayangkan aplikasinya.

## Sebelum mulai

**Merge PR M0 dulu.** Cloudflare membangun aplikasi dari branch `main`. Selama PR M0 belum di-merge, `main` belum berisi aplikasi, jadi build pertama akan gagal.

Kalau Anda sudah terlanjur klik **Deploy** sebelum merge, tidak apa-apa. Setelah PR di-merge, Cloudflare otomatis membangun ulang.

## Langkah-langkah

1. **Daftar Cloudflare.** Buka <https://dash.cloudflare.com/sign-up>, isi email dan kata sandi, lalu verifikasi email Anda.
2. **Buka menu Workers & Pages.** Di dasbor Cloudflare, pilih **Workers & Pages** di menu kiri (kadang ada di bawah **Compute**). Klik **Create** → **Import a repository** / **Connect GitHub**.
3. **Hubungkan GitHub.** Login, lalu izinkan Cloudflare mengakses repo **Apps-Building** saja (pilih _Only select repositories_). Pilih repo `mrifqidata-code/Apps-Building`.
4. **Isi halaman "Set up your application"** persis seperti ini:

   | Kolom                          | Isi                                     |
   | ------------------------------ | --------------------------------------- |
   | Project name                   | `pos-sederhana` (harus persis sama)     |
   | Build command                  | `npm run build`                         |
   | Deploy command                 | `npx wrangler deploy` (biarkan bawaan)  |
   | Preview command                | `npx wrangler preview` (biarkan bawaan) |
   | Enable Preview builds          | **Nyala**                               |
   | Protect with Cloudflare Access | **Mati**                                |
   | Advanced settings → Path       | `/`                                     |
   | API token                      | Biarkan token yang dibuat otomatis      |
   | Variable name / Variable value | Kosongkan, belum perlu                  |

   Nama proyek harus `pos-sederhana`, karena sama dengan nama di file `wrangler.jsonc`. Kalau berbeda, build akan gagal.

5. Klik **Deploy**, lalu tunggu 1–3 menit sampai statusnya **Success**.
6. Aplikasi Anda sekarang ada di alamat berbentuk `https://pos-sederhana.<nama-akun>.workers.dev`. Lihat alamat persisnya di halaman proyek, bagian **Domains & Routes** atau tombol **Visit**.

## Memasang aplikasi di HP Android

1. Buka alamat aplikasi di **Chrome**.
2. Ketuk tombol **Pasang aplikasi** di pojok kanan atas. Kalau tombolnya tidak muncul, ketuk menu **⋮** lalu pilih **Instal aplikasi** atau **Tambahkan ke layar utama**.
3. Ikon **Kasir** akan muncul di layar utama. Bukalah sekali saat ada internet. Setelah muncul tulisan "Aplikasi siap dipakai tanpa internet", aplikasi bisa dibuka walaupun internet mati.

## Versi pratinjau untuk pull request

Karena **Enable Preview builds** menyala, setiap kali ada perubahan di branch PR, Cloudflare membuat versi pratinjau dengan alamat sendiri. Alamatnya muncul sebagai status Cloudflare di halaman PR di GitHub, dan di dasbor Cloudflare pada menu **Deployments**. Gunakan alamat itu untuk mencoba perubahan di HP sebelum Anda menyetujui PR.

## Kalau ada masalah

- **Build gagal:** buka proyek di Cloudflare → **Deployments** → klik deployment yang gagal → salin isi log, lalu kirimkan ke Claude.
- **Muncul error soal nama Worker tidak cocok:** pastikan nama proyek di Cloudflare adalah `pos-sederhana`.
- **Aplikasi tidak berubah setelah update:** tutup aplikasi lalu buka lagi. Kalau muncul tulisan "Versi baru tersedia", ketuk **Muat ulang**.
