# Email pendaftaran untuk pemilik toko lain (SMTP)

Email bawaan Supabase hanya terkirim ke anggota tim project Supabase, dan dibatasi sekitar 2 email per jam. Akibatnya, pemilik toko lain tidak menerima email konfirmasi dan tidak bisa mendaftar. Panduan ini memasang pengirim email sendiri lewat **Resend**, yang punya paket gratis.

## Yang perlu disiapkan

- **Domain sendiri**, misalnya `reqap.id` (sekitar Rp200.000 per tahun). Resend hanya mengirim dari domain yang sudah diverifikasi. Domain ini juga bisa dipakai untuk alamat aplikasi nanti.
- Akun **Resend** (resend.com). Paket gratisnya sekitar 3.000 email per bulan dan 100 email per hari, cukup untuk pendaftaran dan "lupa password". Cek angka terbarunya di halaman harga Resend.

## 1. Verifikasi domain di Resend

1. Masuk ke Resend, buka **Domains → Add Domain**, ketik domain Anda.
2. Resend menampilkan beberapa catatan DNS (TXT dan MX). Tambahkan semuanya di pengelola domain Anda (tempat Anda membeli domain, atau Cloudflare kalau DNS-nya di sana).
3. Kembali ke Resend dan ketuk **Verify**. Biasanya selesai dalam beberapa menit, kadang sampai beberapa jam.

## 2. Buat API key

1. Di Resend, buka **API Keys → Create API Key**.
2. Beri nama `Supabase Reqap`, izin **Sending access**, pilih domain Anda.
3. Salin kuncinya (diawali `re_…`). Kunci ini rahasia: jangan dikirim ke siapa pun atau dimasukkan ke GitHub.

## 3. Pasang di Supabase

1. Di Supabase, buka **Authentication → Emails → SMTP Settings** (di tampilan lama: **Project Settings → Authentication → SMTP Settings**).
2. Nyalakan **Enable custom SMTP**, lalu isi:
   - **Sender email:** `noreply@domain-anda` (harus di domain yang sudah diverifikasi)
   - **Sender name:** `Reqap`
   - **Host:** `smtp.resend.com`
   - **Port:** `465`
   - **Username:** `resend`
   - **Password:** API key dari langkah 2
3. Ketuk **Save**.

## 4. Atur batas kirim

Buka **Authentication → Rate Limits** dan lihat batas **email sent** per jam. Setelah SMTP sendiri aktif, angka ini bisa dinaikkan. Untuk awal, 30 per jam sudah cukup.

## 5. Ganti isi email ke bahasa Indonesia

Buka **Authentication → Emails → Templates**.

**Confirm signup**

- Subject: `Konfirmasi pendaftaran Reqap`
- Isi:

```html
<h2>Selamat datang di Reqap</h2>
<p>Ketuk tautan di bawah untuk mengonfirmasi email Anda, lalu kembali ke aplikasi dan masuk.</p>
<p><a href="{{ .ConfirmationURL }}">Konfirmasi email</a></p>
<p>Kalau Anda tidak mendaftar di Reqap, abaikan email ini.</p>
```

**Reset password**

- Subject: `Buat password baru Reqap`
- Isi:

```html
<h2>Buat password baru</h2>
<p>Ketuk tautan di bawah untuk membuat password baru akun Reqap Anda.</p>
<p><a href="{{ .ConfirmationURL }}">Buat password baru</a></p>
<p>Kalau Anda tidak memintanya, abaikan email ini. Password lama tetap berlaku.</p>
```

## 6. Coba

1. Buka aplikasi di browser lain (atau mode penyamaran), lalu **Masuk akun pemilik (email) → Daftar baru** dengan email selain email Anda.
2. Email konfirmasi harus masuk dalam satu menit. Cek juga folder Spam.
3. Di Resend, menu **Emails** menampilkan setiap email yang terkirim dan statusnya.

Setelah itu, hapus akun uji itu di **Authentication → Users**.

## Kalau ada masalah

- **Email tidak sampai:** cek menu **Emails** di Resend. Kalau tertulis gagal, biasanya domain belum terverifikasi atau sender email bukan di domain itu.
- **"Error sending confirmation email" di aplikasi:** periksa lagi host, port, username, dan API key di langkah 3.
- **Masuk folder Spam:** pastikan semua catatan DNS dari Resend sudah ditambahkan, lalu tunggu beberapa jam.
