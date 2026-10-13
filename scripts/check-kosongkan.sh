#!/usr/bin/env bash
# Runs the cleanup SQL in supabase/admin against the local Supabase (after the
# cloud tests have filled it) and checks that store data is gone while the
# email accounts stay. Usage: npm run test:kosongkan
set -euo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
q() { psql "$DB_URL" -v ON_ERROR_STOP=1 -tAc "$1"; }

stores_before=$(q "select count(*) from public.stores")
emails_before=$(q "select count(*) from auth.users where not is_anonymous")
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -o /dev/null -f supabase/admin/kosongkan-1-lihat.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -o /dev/null -f supabase/admin/kosongkan-2-hapus.sql

left=$(q "select (select count(*) from public.stores) + (select count(*) from public.store_members)
  + (select count(*) from public.transactions) + (select count(*) from public.store_plans)
  + (select count(*) from private.pairing_codes) + (select count(*) from auth.users where is_anonymous)")
emails_after=$(q "select count(*) from auth.users where not is_anonymous")

if [ "$stores_before" = 0 ]; then echo "Tidak ada data untuk diuji: jalankan test:cloud dulu."; exit 1; fi
if [ "$left" != 0 ]; then echo "Masih ada $left baris setelah dikosongkan."; exit 1; fi
if [ "$emails_before" != "$emails_after" ]; then echo "Akun email ikut terhapus."; exit 1; fi
echo "Kosongkan data: $stores_before toko terhapus, $emails_after akun email tetap ada."
