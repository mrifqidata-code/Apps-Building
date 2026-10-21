# Mengosongkan data uji sebelum toko dipakai sungguhan

Panduan ini menghapus **semua** toko dan transaksi di Supabase beserta isi setiap HP, supaya toko asli mulai dari nol. Akun email pemilik tetap ada.

> Penghapusan tidak bisa dibatalkan. Jalankan hanya kalau semua data di Supabase memang data uji.

## Urutan singkat

1. Pasang SQL terbaru (kalau belum).
2. Lihat isi database.
3. Hapus data toko.
4. Hapus file gambar.
5. Kosongkan setiap HP.
6. Siapkan toko asli dan jadikan paketnya tanpa batas waktu.
7. Pasang ulang HP kasir.

## 1. Pasang SQL terbaru

Pastikan file SQL M7 (`supabase/migrations/20261013120000_m7_paket.sql`) sudah dipasang, dengan cara di [docs/supabase.md](supabase.md) bagian **Memperbarui database**. Langkah 6 memerlukannya.

## 2. Lihat isi database

1. Di GitHub, buka [`supabase/admin/kosongkan-1-lihat.sql`](../supabase/admin/kosongkan-1-lihat.sql) dan salin isinya (**Copy raw file**).
2. Di Supabase: **SQL Editor → New query**, tempel, lalu **Run**.
3. Hasilnya berisi:
   - baris **toko**: nama setiap toko dan email pemiliknya;
   - baris **tabel …**: jumlah data yang akan dihapus;
   - baris **akun email (tetap ada)**: akun yang tidak ikut dihapus.

File ini tidak mengubah apa pun. Kalau ada toko yang bukan data uji, **berhenti di sini**.

## 3. Hapus data toko

1. Buka [`supabase/admin/kosongkan-2-hapus.sql`](../supabase/admin/kosongkan-2-hapus.sql), salin isinya.
2. **SQL Editor → New query**, tempel, lalu **Run**.
3. Hasil yang benar: toko, anggota toko, transaksi, kode pasang, dan akun anonim HP kasir semuanya **0**. Akun email masih ada.

Yang dihapus: semua toko dan isinya (produk, transaksi, kas, stok, log audit, paket), HP yang terhubung, kode pasang, dan akun anonim HP kasir.

## 4. Hapus file gambar

Supabase tidak mengizinkan file dihapus lewat SQL, jadi lewat menu:

1. Buka **Storage → store-images**.
2. Centang semua folder, lalu **Delete**.

Kalau ada akun email uji yang tidak dipakai lagi, hapus di **Authentication → Users** (titik tiga di baris akun → **Delete user**). Akun Anda sendiri jangan dihapus.

## 5. Kosongkan setiap HP

Data juga tersimpan di setiap HP. Lakukan di **setiap** HP yang pernah memakai Reqap:

1. Buka Reqap dan masuk sebagai **Pemilik**.
2. Buka **Pengaturan**, gulir ke paling bawah, lalu ketuk **Kosongkan HP ini**.
3. Masukkan PIN pemilik.
4. Aplikasi terbuka lagi seperti baru, dengan toko contoh, dan HP keluar dari akun.

Kalau tombol itu belum muncul (aplikasi versi lama, ketuk **Muat ulang** saat ada tulisan **Versi baru tersedia**) atau PIN pemilik di HP itu lupa, kosongkan lewat Chrome:

1. Buka **Chrome** (bukan ikon Reqap), lalu buka `apps-building.mrifqidata.workers.dev`.
2. Ketuk ikon di kiri alamat, lalu **Setelan situs** (_Site settings_).
3. Gulir ke bawah, ketuk **Hapus & reset** (_Clear & reset_), lalu konfirmasi.

HP yang tidak dikosongkan akan menampilkan status **Diputus pemilik**, karena tokonya sudah tidak ada di cloud.

## 6. Siapkan toko asli

Di HP pemilik:

1. Pilih **Pemilik** dan buat PIN.
2. **Pengaturan → Akun & sinkron → Hubungkan ke akun pemilik**, lalu **Masuk** dengan email Anda.
3. Pilih **Mulai toko baru** (kosong) atau **Simpan toko ini ke akun** (dengan produk contoh).
4. Isi data toko, pajak, QRIS, dan produk seperti di menu **Bantuan → Menyiapkan toko**.

Toko baru otomatis mendapat uji coba 30 hari. Toko Anda sendiri sebaiknya tanpa batas waktu. Jalankan ini di **SQL Editor**, dengan email Anda di antara tanda kutip:

```sql
select admin_set_plan_unlimited(store_id, 'Toko sendiri')
from admin_stores()
where owner_email = 'email-anda@contoh.com';
```

Lalu di aplikasi, ketuk **Sinkron sekarang**. Kartu **Paket** menampilkan **Tanpa batas waktu**.

## 7. Pasang ulang HP kasir

Di HP pemilik: **Pengaturan → Akun & sinkron → Tambah HP kasir**. Di HP kasir (yang sudah dikosongkan di langkah 5): **Pasang HP kasir dengan kode**.
