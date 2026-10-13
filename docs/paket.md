# Paket toko: uji coba, perpanjangan, dan bantuan WhatsApp

Panduan untuk pengelola Reqap (Anda): cara kerja paket, cara memperpanjang setelah pelanggan transfer, dan cara memasang nomor WhatsApp bantuan.

## Cara kerjanya

- **Gratis:** Reqap tanpa akun di satu HP. Data hanya di HP itu dan tidak memakai server.
- **Uji coba 30 hari:** dimulai otomatis saat pemilik toko menghubungkan tokonya ke akun cloud.
- **Paket Toko:** fitur cloud (sinkron, cadangan, tambahan HP kasir) setelah uji coba. Anda aktifkan manual setelah pelanggan transfer. Tidak ada payment gateway dan tidak diperpanjang otomatis.
- **Masa aktif habis:** server menolak semua baca/tulis data toko itu (tabel, sinkron, gambar, kode pasang). Aplikasi kasir tetap jalan di setiap HP, dan penjualan menunggu di HP. Setelah diperpanjang, data terkirim sendiri.
- Aturan ini ditegakkan di database (`supabase/migrations/20261013120000_m7_paket.sql`), jadi tidak bisa diakali dari aplikasi. Pemilik toko hanya bisa **melihat** paketnya.

Yang dilihat pemilik toko:

- **Pengaturan → Akun & sinkron → Paket:** nama paket dan tanggal berakhir, plus tombol **Perpanjang lewat WhatsApp**.
- Mulai 7 hari sebelum berakhir: pita kuning di bawah menu, misalnya "Uji coba gratis berakhir 3 hari lagi".
- Setelah habis: status **Masa aktif habis** di kanan atas.

## Melihat semua toko

Di Supabase, **SQL Editor → New query**:

```sql
select * from admin_stores();
```

Kolomnya: ID toko, nama toko, email pemilik, paket (`trial` atau `toko`), aktif sampai (kosong = tanpa batas), jumlah HP aktif, penjualan terakhir, dan tanggal bergabung.

## Memperpanjang setelah transfer

Pesan WhatsApp dari tombol **Perpanjang** berisi nama toko dan **ID toko**. Setelah transfer masuk, jalankan:

```sql
select admin_extend_plan('ID-TOKO-DARI-PESAN', 1, 'Transfer BCA 13 Okt Rp59.000');
```

- Angka `1` adalah jumlah bulan (1–36).
- Bulan ditambahkan dari tanggal berakhir yang sekarang. Kalau sudah lewat, dihitung dari hari ini.
- Teks terakhir adalah catatan untuk Anda sendiri (boleh dihapus).

Atau cari lewat email pemilik:

```sql
select admin_extend_plan(store_id, 1, 'Transfer BCA 13 Okt')
from admin_stores()
where owner_email = 'pemilik@contoh.com';
```

Minta pemilik toko mengetuk **Sinkron sekarang**. Kalau tidak, aplikasi memeriksa sendiri paling lama 10 menit kemudian.

## Toko tanpa batas waktu

Untuk toko Anda sendiri atau toko percontohan:

```sql
select admin_set_plan_unlimited('ID-TOKO', 'Toko sendiri');
```

## Nomor WhatsApp bantuan

Tombol **Hubungi kami** (menu Bantuan) dan **Perpanjang lewat WhatsApp** (Pengaturan) membuka WhatsApp ke nomor Anda. Nomornya tidak disimpan di GitHub, tapi diisi di Cloudflare:

1. Dasbor Cloudflare → **Workers & Pages → apps-building → Settings → Build → Build variables and secrets → Add**.
2. Nama `VITE_SUPPORT_WHATSAPP`, tipe **Text**, isi nomor WhatsApp, misalnya `0812xxxxxxx`.
3. Berlaku mulai build berikutnya.

Tanpa variabel ini, tombolnya disembunyikan dan aplikasi menulis "Hubungi pengelola Reqap".

## Yang belum diputuskan

- **Harga Paket Toko.** Dokumen monetisasi menyarankan Rp49.000–79.000 per bulan setelah uji coba di beberapa toko. Harga belum ditulis di aplikasi; Anda menyampaikannya lewat WhatsApp.
- **Uji coba berulang.** Pemilik bisa membuat akun dan toko baru untuk uji coba lagi, tapi harus mengisi ulang produk dan pengaturannya. Untuk skala awal ini dianggap cukup.
