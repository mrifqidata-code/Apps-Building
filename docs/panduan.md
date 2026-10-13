# Panduan Reqap

Panduan singkat untuk pemilik dan kasir. Panduan yang sama ada di menu **Bantuan** di aplikasi, dan bisa dibuka tanpa internet.

## Menyiapkan toko (pemilik, sekali saja)

1. Buka aplikasi di **Chrome** HP Android, lalu ketuk **Pasang aplikasi** (atau menu ⋮ → **Tambahkan ke layar utama**) supaya ada ikon Reqap di layar utama.
2. Di layar **Siapa yang bertugas?**, pilih **Pemilik**, lalu buat PIN 4–6 angka. Ingat PIN ini, karena PIN pemilik dipakai untuk membatalkan transaksi dan opname stok.
3. Buka **Pengaturan**:
   - **Data toko:** nama, alamat, nomor telepon, logo, dan catatan kaki struk.
   - **Pajak dan biaya layanan:** isi PB1 dan biaya layanan kalau toko Anda memungutnya, lalu pilih apakah harga di menu sudah termasuk pajak.
   - **QRIS toko:** unggah gambar QRIS statis dari bank atau e-wallet.
   - **Pengguna:** tambah nama kasir. Setiap kasir membuat PIN sendiri saat pertama masuk.
4. Buka **Produk**. Hapus produk contoh yang tidak dipakai, lalu tambah produk Anda dengan **+ Produk**: nama, harga jual, HPP (modal), dan varian kalau ada (misalnya Ukuran atau Tambahan).
5. Kalau ingin cadangan di cloud atau memakai lebih dari satu HP, buka **Pengaturan → Akun & sinkron → Hubungkan ke akun pemilik**.

## Membuka kasir dan berjualan

1. Kasir masuk dengan namanya dan PIN-nya.
2. Sebelum transaksi pertama, isi **Modal awal** (uang tunai di laci), lalu ketuk **Buka kasir**.
3. Ketuk produk yang dibeli. Produk dengan pilihan (misalnya ukuran) membuka lembar pilihan dulu.
4. Ketuk **Bayar**, pilih **Tunai**, **QRIS**, atau **Transfer**.
5. Untuk tunai, ketuk **Uang pas** atau nominal uang dari pelanggan, lalu **Selesaikan**. Kembalian tampil besar di layar.
6. Di layar struk, ketuk **Cetak struk**, **Simpan PDF**, atau **Kirim struk ke WhatsApp**. Nomor WhatsApp pelanggan tidak disimpan.
7. Ketuk **Transaksi baru** untuk pelanggan berikutnya.

Semua langkah ini tetap jalan tanpa internet.

## Kas keluar dan kas masuk

Catat setiap uang yang keluar dari laci selain kembalian, supaya hitungan tutup kasir tetap cocok.

1. Buka menu **Kas**.
2. Ketuk **− Kas keluar** (misalnya beli es batu) atau **+ Kas masuk** (misalnya tambah uang kecil).
3. Isi jumlah dan alasannya, lalu simpan.

## Menutup kasir

1. Buka **Kas → Tutup kasir**.
2. Hitung semua uang tunai di laci, termasuk modal awal.
3. Ketik jumlahnya di **Uang fisik di laci**, lalu ketuk **Simpan dan tutup kasir** dan **Ya, tutup kasir**.
4. Rekap muncul: angka seharusnya di laci, uang fisik, dan selisihnya (**Pas**, **Lebih**, atau **Kurang**).
5. Ketuk **Kirim ke WhatsApp** untuk mengirim rekap ke pemilik, atau **Cetak rekap**.

Kasir sengaja tidak melihat angka sistem sebelum menghitung, supaya hitungannya jujur. Untuk berjualan lagi, buka kasir baru.

## Membatalkan transaksi (void dan refund)

Hanya pemilik yang bisa membatalkan transaksi, selalu dengan alasan, dan semuanya tercatat. Transaksi tidak pernah dihapus.

1. Buka **Riwayat**, lalu pilih transaksinya.
2. Ketuk **Batalkan transaksi**. Kalau yang sedang masuk adalah kasir, pemilik memasukkan PIN pemilik di HP itu.
3. Pilih atau tulis alasannya, lalu konfirmasi.

Aplikasi memilih jenisnya sendiri:

- **Void:** kasir untuk transaksi itu masih buka. Kembalikan uangnya dari laci. Barang yang stoknya dilacak kembali ke stok.
- **Refund:** kasirnya sudah ditutup. Refund tunai diambil dari laci yang sedang buka dan tercatat sebagai kas keluar. Barang kembali ke stok kalau dicentang.

## Menghubungkan printer

Printer thermal 58 mm Bluetooth bisa dipakai langsung dari Chrome Android.

1. Nyalakan printer, Bluetooth HP, dan **Lokasi (GPS)** HP.
2. Masuk sebagai pemilik, buka **Pengaturan → Printer struk (58 mm)**.
3. Ketuk **Hubungkan printer (Bluetooth BLE)**, pilih printer, lalu **Sambungkan**.
4. Kalau printer tidak muncul: pasangkan (pairing) printer di **Pengaturan HP → Bluetooth** dengan PIN **0000** atau **1234**, lalu ketuk **Hubungkan printer (Bluetooth Classic)**.
5. Ketuk **Tes cetak**. Hasilnya harus berisi tulisan **TES PRINTER BERHASIL**.
6. Kalau mau, nyalakan **Cetak otomatis setelah pembayaran**.

Tanpa printer, struk tetap bisa dikirim lewat WhatsApp atau disimpan sebagai PDF.

## Stok

Stok hanya untuk produk yang dilacak, misalnya frozen food atau barang kemasan.

1. Pemilik membuka **Produk**, memilih produk, lalu menyalakan **Lacak stok** dan mengisi stok sekarang serta batas menipis.
2. Stok berkurang sendiri saat terjual. Layar kasir menampilkan **Sisa 3** atau **Habis**.
3. Saat barang datang, buka **Stok → + Stok masuk**.
4. Pemilik sesekali menghitung barang di rak, lalu mencatatnya lewat **Stok → Opname**. Selisihnya tercatat.

## Laporan

Hanya pemilik yang bisa membuka **Laporan**.

- Pilih **Harian**, **Mingguan**, atau **Bulanan**, lalu geser periodenya dengan tombol panah.
- Isinya: penjualan bersih, laba kotor, metode bayar, jam paling ramai, per produk, dan rekap tutup kasir.
- Ketuk tombol di **Ekspor CSV** untuk menyimpan file. Buka di Google Sheets lewat **File → Impor → Upload**.

## Memakai beberapa HP

1. Di HP pemilik: **Pengaturan → Akun & sinkron → Tambah HP kasir**. Muncul kode 8 huruf yang berlaku 10 menit.
2. Di HP kasir: buka aplikasi, ketuk **Pasang HP kasir dengan kode**, lalu ketik kodenya.
3. Penjualan dari semua HP terkumpul sendiri saat ada internet, termasuk yang dibuat saat offline.

## Kalau ada masalah

- **Status Offline:** tidak ada internet. Jualan tetap jalan, dan datanya terkirim sendiri saat online lagi.
- **Status Belum terkirim:** ada data yang menunggu dikirim. Biarkan aplikasi terbuka sebentar saat ada internet.
- **Muncul Versi baru tersedia:** selesaikan transaksi yang sedang berjalan, lalu ketuk **Muat ulang**.
- **PIN terkunci:** tunggu sebentar setelah 5 kali salah, lalu coba lagi.
- **Printer tidak mencetak:** tekan tombol daya printer, dekatkan ke HP, lalu ketuk **Cetak struk** lagi.
- **Selisih kas sering muncul:** pastikan setiap uang keluar dicatat lewat **Kas keluar**.
