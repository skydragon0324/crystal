#!/usr/bin/env bash
# Walks every endpoint behind the account pages in the configuration a
# developer actually runs: a real Postgres for the database-backed
# endpoints, mock/mockExternalApi.js for the ones that proxy an outbound
# service.
#
#   # in vendor_backend/.env:  USE_MOCK=false, USE_MOCK_API=true
#   npm start
#   bash mock/tests/account_db_test.sh
#
# It asserts a 200 AND a field the page actually renders, because an
# empty {"total":0,"rows":[]} is a 200 too - and an empty list is exactly
# the failure this suite exists to catch.
#
# Prerequisites, or the database half fails wholesale:
#   psql -d vendor -f sql_pg/00_compat.sql
#   psql -d vendor -f sql_pg/91_mock_satellite_schemas.sql
#   psql -d vendor -f sql_pg/seed_mock_account.sql
#
# Override the login with USER_ID / PASSWORD_MD5 (the client MD5s the
# password before posting, so the API takes the hash, not the password).
BASE="${BASE_URL:-http://localhost:5000/vendor/api}"
USER_ID="${USER_ID:-iron}"
PASSWORD_MD5="${PASSWORD_MD5:-25d55ad283aa400af464c76d713c07ad}"   # MD5('12345678')
JAR="${TMPDIR:-/tmp}/account_db_cookies.txt"
rm -f "$JAR"
PASS=0; FAIL=0

get() {
  local label="$1" path="$2" pattern="$3"
  local body
  body=$(curl -s -b "$JAR" "$BASE$path")
  if echo "$body" | grep -q '"code":200' && echo "$body" | grep -q "$pattern"; then
    echo "  PASS  $label"; PASS=$((PASS+1))
  else
    echo "  FAIL  $label  ($path)"
    echo "        wanted: $pattern"
    echo "        got:    $(echo "$body" | head -c 220)"
    FAIL=$((FAIL+1))
  fi
}

echo "===== login ====="
login_body=$(curl -s -c "$JAR" -X POST "$BASE/auth/web_login" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$USER_ID\",\"password\":\"$PASSWORD_MD5\"}")
if echo "$login_body" | grep -q '"code":200'; then
  echo "  PASS  login as $USER_ID"; PASS=$((PASS+1))
else
  echo "  FAIL  login as $USER_ID"
  echo "        got:    $(echo "$login_body" | head -c 220)"
  echo
  echo "Cannot continue without a session - every endpoint below is behind"
  echo "verifyWebToken. Check the user exists in ora_pid.users."
  exit 1
fi

# ---------------------------------------------------------------
# Database-backed. These read ora_pid, ora_blog, ora_license,
# ora_media and ora_old_db, and need seed_mock_account.sql.
# ---------------------------------------------------------------
echo "===== software points (ora_pid) ====="
get "appstore point log" "/soft_point_log?point_type=0" '"soft_points"'
get "karaoke point log"  "/soft_point_log?point_type=1" '"soft_points"'
get "bmedia point log"   "/soft_point_log?point_type=2" '"soft_points"'
get "minus point log"    "/soft_point_log?point_type=3" '"soft_points"'
get "point log paging"   "/soft_point_log?point_type=0&offset=10&limit=5" '"total":19'
get "point log search"   "/soft_point_log?point_type=0&keyword=reward" '"total"'

echo "===== activity points ====="
get "activity point log" "/activity_point_log"          '"points"'
# NULL reason falls back to "main_type sub_type" through the NVL shim in
# sql_pg/00_compat.sql - without it this endpoint is a 500.
get "activity reason nvl" "/activity_point_log"         '"reason":"Daily login'
get "activity old log"   "/activity_old_log"            '"points"'

echo "===== legacy licences ====="
get "karaoke old log"    "/karaoke_old_log"             '"equ_num":"MK-'
get "bmedia old log"     "/bmedia_old_log"              '"equ_num":"DEV-'
# The provider join supplies the reason column.
get "bmedia provider"    "/bmedia_old_log"              '"reason":"'

echo "===== feedback ====="
get "feedback threads"   "/feedback_threads"            '"title"'
get "thread messages"    "/feedback_threads"            '"last_message"'

echo "===== blog ====="
get "my articles"        "/blog_my_articles"            '"title"'
get "article info join"  "/blog_my_articles"            '"visited_num"'
get "my drafts"          "/blog_my_articles?state=-2"   '"title":"Draft:'

# ---------------------------------------------------------------
# Proxied to an outbound service. These need USE_MOCK_API=true and
# touch no database table at all.
# ---------------------------------------------------------------
echo "===== eshop (mocked service) ====="
get "wallet balance"     "/eshop_wallet_balance"                 '"vip_no"'
get "order list"         "/eshop_order_list"                     '"foreign_qty"'
get "order status label" "/eshop_order_list"                     '"status":"'
get "wallet log"         "/eshop_wallet_transactions?type=0"     '"money_value"'
get "exp log"            "/eshop_wallet_transactions?type=1"     '"fill_dt"'
get "commerce values"    "/eshop_wallet_transactions?type=2"     '"fill_type"'

echo "===== appstore (mocked service) ====="
get "purchase log"       "/appstore_purchase_log"                '"purchase_history_unique_id"'
get "purchase type"      "/appstore_purchase_log"                'App..Models..'
get "comments"           "/appstore_comments"                    '"rating"'
get "comment app join"   "/appstore_comments"                    '"icon_48_48_url"'
get "favorites"          "/appstore_favorites"                   '"app_icon"'
get "wallet log"         "/appstore_wallet_transactions"         '"transaction_type_id"'

echo "===== eprod and keygen (mocked service) ====="
get "register log"       "/eprod_regist_add_log"                 '"sn_num"'
get "register sum"       "/eprod_regist_add_log"                 '"sum_total"'
get "karaoke keygen"     "/karaoke_keygen_log"                   '"machinekey":"KAR-'
get "manbang keygen"     "/manbang_keygen_log"                   '"machinekey":"MB-'
get "bmedia providers"   "/bmedia_providers"                     '"short_name"'
get "bmedia keygen"      "/bmedia_keygen_log"                    '"dev_id"'

# These two take an id from the list above, so pull a real one rather
# than hard-coding a value that drifts when the generator changes.
qr_id=$(curl -s -b "$JAR" "$BASE/appstore_purchase_log" \
  | grep -o '"purchase_history_unique_id":"[^"]*"' | head -1 | cut -d'"' -f4)
get "license qr"         "/appstore_license_qr?purchase_history_unique_id=$qr_id" '"device_license"'

media_id=$(curl -s -b "$JAR" "$BASE/bmedia_keygen_log" \
  | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
get "bmedia detail"      "/bmedia_keygen_by_id?id=$media_id"     '"media_price"'

order_id=$(curl -s -b "$JAR" "$BASE/eshop_order_list" \
  | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
get "order detail"       "/eshop_order_detail?order_id=$order_id" '"goods_name"'

echo
echo "===== $PASS passed, $FAIL failed ====="
[ "$FAIL" -eq 0 ]
