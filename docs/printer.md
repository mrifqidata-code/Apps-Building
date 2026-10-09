# Panduan printer struk (thermal 58 mm Bluetooth)

Aplikasi mencetak ke printer thermal 58 mm lewat Bluetooth, langsung dari **Chrome di HP Android**. Tidak perlu memasang aplikasi printer lain.

Printer yang direncanakan pemilik: **Putian POS 583-01** (58 mm, perintah ESC/POS). Printer ini belum dibeli, jadi belum diuji langsung. Panduan ini juga berlaku untuk printer 58 mm Bluetooth lain, misalnya EPPOS, Xprinter, RPP02N, dan PT-210.

## Tips memilih printer sebelum membeli

Cek deskripsi produk di toko online. Printer yang paling mudah tersambung ke aplikasi ini:

1. **Lebar kertas 58 mm.** Aplikasi mencetak 32 karakter per baris. Printer 80 mm tetap bisa dipakai, tapi struknya hanya terisi sebagian lebar kertas.
2. **Mendukung ESC/POS.** Biasanya tertulis "ESC/POS", "support POS", atau "compatible with Loyverse/Moka/Olsera".
3. **Bluetooth 4.0 / BLE, atau tertulis "support iOS/iPhone".** Printer yang bisa dipakai di iPhone hampir selalu memakai BLE. Printer BLE bisa langsung dipilih dari aplikasi tanpa pairing di pengaturan HP.
4. Printer yang hanya **Bluetooth Classic** ("support Android only") juga bisa dipakai, tapi harus di-pairing dulu dan butuh Chrome Android versi 137 ke atas.
5. Kalau ragu, tanyakan ke penjual: **"Apakah printer ini Bluetooth BLE (4.0) dan mendukung ESC/POS?"**

Setelah printer datang, ikuti langkah di bawah lalu jalankan **Tes cetak**.

## Yang perlu disiapkan

- HP Android dengan **Chrome versi terbaru** (perbarui lewat Play Store).
- Printer terisi daya, kertas thermal 58 mm terpasang, dan printer menyala.
- Bluetooth HP menyala. **Lokasi (GPS) juga harus menyala**, karena Android mewajibkannya untuk mencari perangkat Bluetooth.

## Menghubungkan printer (cukup sekali per HP)

1. Masuk sebagai **Pemilik**, lalu buka **Pengaturan → Printer struk (58 mm)**.
2. Ketuk **Hubungkan printer (Bluetooth BLE)**.
   - Muncul daftar perangkat Bluetooth di sekitar. Pilih nama printer (biasanya mengandung nama merek, "Printer", "BT", atau nomor model), lalu ketuk **Sambungkan**.
   - Kalau Chrome meminta izin Bluetooth atau Lokasi, pilih **Izinkan**.
3. Kalau printer **tidak muncul** di daftar, atau muncul pesan "tidak dikenali sebagai printer BLE", printer Anda kemungkinan memakai **Bluetooth Classic**:
   1. Buka **Pengaturan HP → Bluetooth**, cari printer, lalu ketuk untuk **memasangkan (pairing)**. Kalau diminta PIN, coba **0000** atau **1234**.
   2. Kembali ke aplikasi, lalu ketuk **Hubungkan printer (Bluetooth Classic)** dan pilih printer.
4. Ketuk **Tes cetak**. Hasil cetakan harus berisi nama toko, tulisan **TES PRINTER BERHASIL**, dan deretan angka `1234567890…` sepanjang satu baris penuh.
5. Kalau mau, centang **Cetak otomatis setelah pembayaran**, supaya struk langsung keluar tanpa mengetuk tombol.

## Mencetak struk

- Setelah pembayaran, ketuk **Cetak struk** di layar struk. Kalau cetak otomatis menyala, struk keluar sendiri.
- Untuk mencetak ulang struk lama, buka **Riwayat**, pilih transaksi, lalu ketuk **Cetak struk**.
- Setelah aplikasi ditutup dan dibuka lagi, Chrome kadang meminta Anda memilih printer sekali lagi saat pertama mencetak. Ini normal, cukup pilih printer yang sama.

## Kalau tidak bisa mencetak

| Masalah                          | Coba ini                                                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tombol **Cetak struk** tidak ada | Browser tidak mendukung Bluetooth (misalnya iPhone atau Firefox). Pakai **Chrome di Android**, atau gunakan **Simpan PDF** dan **Kirim struk ke WhatsApp**. |
| Printer tidak muncul di daftar   | Pastikan printer menyala dan tidak sedang tersambung ke HP lain. Nyalakan Lokasi. Coba tombol **Bluetooth Classic** setelah pairing.                        |
| "Printer tidak bisa dihubungi"   | Printer mungkin tertidur. Tekan tombol daya printer, dekatkan ke HP, lalu ketuk **Cetak struk** lagi.                                                       |
| Hasil cetak berisi huruf aneh    | Printer mungkin bukan ESC/POS. Kirim foto hasil tes cetak ke Claude.                                                                                        |
| Tulisan terpotong di kanan       | Printer Anda mungkin 80 mm atau memakai huruf lebih besar. Kirim foto hasil tes cetak ke Claude.                                                            |
| Logo terlalu gelap atau pudar    | Pakai logo hitam di atas latar putih, tanpa gradasi warna.                                                                                                  |

## Tanpa printer

- **Simpan PDF:** membuka menu cetak Chrome. Pilih **Simpan sebagai PDF**. Hasilnya berupa PDF selebar 58 mm yang bisa dikirim lewat WhatsApp.
- **Kirim struk ke WhatsApp:** mengirim struk sebagai teks. Nomor pelanggan boleh dikosongkan.

## Catatan teknis

- Aplikasi mengirim perintah **ESC/POS** standar, 32 karakter per baris (lebar 384 titik).
- **BLE** memakai Web Bluetooth. Aplikasi mencari layanan cetak yang umum dipakai printer murah (misalnya `18F0`, `FF00`, `FFE0`, ISSC, dan `E7810A71…`).
- **Bluetooth Classic** memakai Web Serial dengan profil SPP (`00001101-…`). Fitur ini ada di Chrome Android versi 137 ke atas.
- Pilihan printer disimpan **per HP**, tidak ikut tersinkron ke perangkat lain.
