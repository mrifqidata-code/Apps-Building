-- Kosongkan data uji, langkah 1 dari 2: LIHAT ISINYA DULU. File ini tidak mengubah apa pun.
--
-- Cara memakai: buka SQL Editor di Supabase, tempel seluruh isi file ini, lalu Run.
-- Hasilnya: daftar toko beserta email pemiliknya, lalu jumlah baris setiap tabel.
-- Kalau semua toko di daftar ini memang data uji, lanjut ke kosongkan-2-hapus.sql.
-- Panduan lengkap: docs/kosongkan-data.md.

select 'toko' as bagian,
       null::bigint as jumlah,
       coalesce(s.name, '(belum terkirim)') || ' | ' || coalesce(
         (select string_agg(u.email, ', ')
            from public.store_members o join auth.users u on u.id = o.user_id
           where o.store_id = m.store_id and o.role = 'owner'),
         '-') as keterangan
  from (select distinct store_id from public.store_members) m
  left join public.stores s on s.id = m.store_id

union all

-- Every table with store data (each has a store_id column).
select 'tabel ' || c.table_name,
       (xpath('/row/n/text()',
              query_to_xml(format('select count(*) as n from public.%I', c.table_name),
                           false, true, '')))[1]::text::bigint,
       'dihapus'
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
 where c.table_schema = 'public' and c.column_name = 'store_id' and t.table_type = 'BASE TABLE'

union all
select 'kode pasang HP kasir', count(*), 'dihapus' from private.pairing_codes
union all
select 'akun anonim HP kasir', count(*), 'dihapus' from auth.users where is_anonymous
union all
select 'akun email (tetap ada)', null, email from auth.users where not is_anonymous
union all
select 'file gambar (store-images)', count(*), 'hapus lewat menu Storage, lihat panduan'
  from storage.objects where bucket_id = 'store-images'

order by 1;
