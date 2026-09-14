#!/usr/bin/env bash
# Walks every /vendor/api endpoint the mock serves and checks the response
# envelope and payload shape. Run the server with USE_MOCK=true first:
#
#   USE_MOCK=true PORT=5099 node app.js
#   bash mock/tests/api_smoke_test.sh
BASE="${BASE_URL:-http://localhost:5099/vendor/api}"
JAR=/tmp/smoke_cookies.txt
rm -f "$JAR"
PASS=0; FAIL=0

# get <label> <path> <jq-ish grep pattern>
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

echo "===== public catalogue ====="
get "provinces"          "/provinces"                          '"location_name":"Capital"'
get "phone products"     "/phone_products"                     '"product_name":"S-9 64GB Graphite"'
get "phone specs"        "/phone_specs?product_pk=101"         '"spec_name":"Display"'
get "spec hero image"    "/phone_specs?product_pk=101"         '"image_type":0'
get "intro images"       "/phone_images?product_pk=101"        '"image_type":1'
get "accessories"        "/phone_accessories?product_pk=101"   '"accessory_name":"Display Assembly"'
get "changelog"          "/phone_changelog?product_pk=101"     '"publish_num"'
get "agencies"           "/phone_agencies"                     '"business"'
get "agencies by region" "/phone_agencies?parent_location_code=02" '"location_name":"North Province"'
get "faqs"               "/phone_faqs?offset=0&limit=5"        '"question"'
get "faq search"         "/phone_faqs?keyword=warranty"        '"question"'

echo "===== blog ====="
get "articles"           "/blog_articles?offset=0&limit=5"     '"title"'
get "article search"     "/blog_articles?keyword=battery"      '"total"'
get "admin recoms"       "/admin_recom_blogs"                  '"is_admin_recom":1'
get "honormans"          "/honormans"                          '"user_userid"'
get "replies"            "/blog_replies?parent_pk=1"           '"total"'

echo "===== unauthenticated account access is refused ====="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/eshop_order_list")
if [ "$CODE" = "401" ]; then echo "  PASS  account route requires auth"; PASS=$((PASS+1));
else echo "  FAIL  account route returned $CODE, wanted 401"; FAIL=$((FAIL+1)); fi

echo "===== sign in ====="
BODY=$(curl -s -c "$JAR" -H "Content-Type: application/json" \
  -d '{"user_id":"demo","password":"81dc9bdb52d04dc20036dbd8313ed055"}' "$BASE/auth/web_login")
if echo "$BODY" | grep -q '"user_id":"demo"'; then echo "  PASS  login"; PASS=$((PASS+1));
else echo "  FAIL  login: $BODY"; FAIL=$((FAIL+1)); fi

echo "===== eshop ====="
get "wallet balance"     "/eshop_wallet_balance"                      '"wallet_money"'
get "order list"         "/eshop_order_list?offset=0&limit=10"        '"order_no"'
get "order detail"       "/eshop_order_detail?order_pk=1001001"       '"goods_name"'
get "wallet txns"        "/eshop_wallet_transactions?offset=0&limit=10" '"money_type"'
get "exp log"            "/eshop_exp_log?offset=0&limit=10"           '"total_exp"'
get "commerce values"    "/eshop_commerce_values?offset=0&limit=10"   '"commerce_value"'

echo "===== appstore ====="
get "purchase log"       "/appstore_purchase_log?offset=0&limit=10"   '"purchase_history_unique_id"'
get "license qr"         "/appstore_license_qr?purchase_history_unique_id=PH-1001-1" '"license_file"'
get "comments"           "/appstore_comments?offset=0&limit=10"       '"rating"'
get "favorites"          "/appstore_favorites?offset=0&limit=10"      '"app_name"'
get "appstore wallet"    "/appstore_wallet_transactions?offset=0&limit=10" '"balance"'

echo "===== software / activity point logs ====="
get "soft point (appstore)" "/soft_point_log?category=0&offset=0&limit=10" '"total_point"'
get "soft point (karaoke)"  "/soft_point_log?category=1&offset=0&limit=10" '"total_point"'
get "soft point (media)"    "/soft_point_log?category=2&offset=0&limit=10" '"total_point"'
get "soft point (minus)"    "/soft_point_log?category=3&offset=0&limit=10" '"total_point"'
get "karaoke old log"       "/karaoke_old_log?offset=0&limit=10"          '"total_point"'
get "bmedia old log"        "/bmedia_old_log?offset=0&limit=10"           '"total_point"'
get "activity point log"    "/activity_point_log?offset=0&limit=10"       '"total_point"'
get "activity old log"      "/activity_old_log?offset=0&limit=10"         '"total_point"'

echo "===== eprod ====="
get "eprod register log"  "/eprod_regist_add_log?offset=0&limit=10"  '"phone_imei"'
get "karaoke keygen"      "/karaoke_keygen_log?offset=0&limit=10"    '"serial_no":"KAR'
get "manbang keygen"      "/manbang_keygen_log?offset=0&limit=10"    '"serial_no":"MB'
get "bmedia providers"    "/bmedia_providers"                        '"provider_name"'
get "bmedia keygen"       "/bmedia_keygen_log?offset=0&limit=10"     '"serial_no":"BM'

echo "===== feedback ====="
get "threads"             "/feedback_threads?offset=0&limit=10"      '"thread_pk"'
THREAD=$(curl -s -b "$JAR" "$BASE/feedback_threads?offset=0&limit=1" | grep -o '"thread_pk":[0-9]*' | head -1 | cut -d: -f2)
get "messages"            "/feedback_messages?thread_pk=$THREAD"     '"message"'

echo "===== my blog ====="
get "my articles"         "/blog_my_articles?offset=0&limit=10"      '"total"'
get "my drafts"           "/blog_my_articles?state=0&offset=0&limit=10" '"Draft:'

echo "===== writes mutate the fixtures ====="
BEFORE=$(curl -s -b "$JAR" "$BASE/blog_articles?offset=0&limit=1" | grep -o '"total":[0-9]*' | cut -d: -f2)
curl -s -b "$JAR" -H "Content-Type: application/json" \
  -d '{"title":"Smoke test article","summary":"added by the smoke test","content":"<p>body</p>","subject_id":2}' \
  "$BASE/blog_add" > /dev/null
AFTER=$(curl -s -b "$JAR" "$BASE/blog_articles?offset=0&limit=1" | grep -o '"total":[0-9]*' | cut -d: -f2)
if [ "$AFTER" -gt "$BEFORE" ]; then
  echo "  PASS  blog_add is visible in the list ($BEFORE -> $AFTER)"; PASS=$((PASS+1))
else
  echo "  FAIL  blog_add did not change the list ($BEFORE -> $AFTER)"; FAIL=$((FAIL+1))
fi

echo "===== pagination actually pages ====="
P1=$(curl -s -b "$JAR" "$BASE/phone_faqs?offset=0&limit=3" | grep -o '"faq_pk":[0-9]*' | tr '\n' ' ')
P2=$(curl -s -b "$JAR" "$BASE/phone_faqs?offset=3&limit=3" | grep -o '"faq_pk":[0-9]*' | tr '\n' ' ')
if [ -n "$P1" ] && [ "$P1" != "$P2" ]; then
  echo "  PASS  page 1 differs from page 2"; PASS=$((PASS+1))
else
  echo "  FAIL  pages identical: [$P1] vs [$P2]"; FAIL=$((FAIL+1))
fi

echo "===== sorting actually sorts ====="
ASC=$(curl -s -b "$JAR" "$BASE/phone_accessories?product_pk=101&sortKey=accessory_name&sortDir=asc&limit=1" | grep -o '"accessory_name":"[^"]*"' | head -1)
DESC=$(curl -s -b "$JAR" "$BASE/phone_accessories?product_pk=101&sortKey=accessory_name&sortDir=desc&limit=1" | grep -o '"accessory_name":"[^"]*"' | head -1)
if [ -n "$ASC" ] && [ "$ASC" != "$DESC" ]; then
  echo "  PASS  asc differs from desc ($ASC vs $DESC)"; PASS=$((PASS+1))
else
  echo "  FAIL  sort had no effect: [$ASC] vs [$DESC]"; FAIL=$((FAIL+1))
fi

echo "===== a second account sees its own data ====="
JAR2=/tmp/smoke_cookies2.txt; rm -f "$JAR2"
curl -s -c "$JAR2" -H "Content-Type: application/json" \
  -d '{"user_id":"tester","password":"e10adc3949ba59abbe56e057f20f883e"}' "$BASE/auth/web_login" > /dev/null
O1=$(curl -s -b "$JAR"  "$BASE/eshop_order_list?limit=1" | grep -o '"order_no":"[^"]*"' | head -1)
O2=$(curl -s -b "$JAR2" "$BASE/eshop_order_list?limit=1" | grep -o '"order_no":"[^"]*"' | head -1)
if [ -n "$O1" ] && [ "$O1" != "$O2" ]; then
  echo "  PASS  accounts are isolated ($O1 vs $O2)"; PASS=$((PASS+1))
else
  echo "  FAIL  accounts share data: [$O1] vs [$O2]"; FAIL=$((FAIL+1))
fi

echo
echo "==================== $PASS passed, $FAIL failed ===================="
[ "$FAIL" -eq 0 ]
