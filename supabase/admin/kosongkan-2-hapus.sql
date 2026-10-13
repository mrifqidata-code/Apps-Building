-- Kosongkan data uji, langkah 2 dari 2: HAPUS. TIDAK BISA DIBATALKAN.
--
-- Jalankan kosongkan-1-lihat.sql dulu dan pastikan semua toko di sana memang data uji.
-- Cara memakai: buka SQL Editor di Supabase, tempel seluruh isi file ini, lalu Run.
-- Panduan lengkap (termasuk mengosongkan HP dan file gambar): docs/kosongkan-data.md.
--
-- Yang dihapus: semua toko dan isinya (produk, transaksi, kas, stok, log audit, paket),
-- HP yang terhubung, kode pasang, dan akun anonim HP kasir.
-- Yang tetap ada: akun email (pemilik bisa masuk lagi), struktur database, dan
-- file gambar di Storage (hapus lewat menu Storage).

begin;

-- Every table with store data: those with a store_id column.
do $$
declare
  v_tables text;
begin
  select string_agg(format('public.%I', c.table_name), ', ' order by c.table_name)
    into v_tables
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
   where c.table_schema = 'public' and c.column_name = 'store_id'
     and t.table_type = 'BASE TABLE';
  execute 'truncate table ' || v_tables;
end;
$$;

truncate table private.pairing_codes, private.pairing_failures;

-- Cashier phones signed in anonymously; a phone paired again gets a new one.
delete from auth.users where is_anonymous;

commit;

-- Result: everything below should be 0, and the email accounts are still there.
select 'toko' as bagian, count(*) as jumlah from public.stores
union all select 'anggota toko', count(*) from public.store_members
union all select 'transaksi', count(*) from public.transactions
union all select 'kode pasang HP kasir', count(*) from private.pairing_codes
union all select 'akun anonim HP kasir', count(*) from auth.users where is_anonymous
union all select 'akun email (tetap ada)', count(*) from auth.users where not is_anonymous;
