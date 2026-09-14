#!/usr/bin/env bash
# End-to-end check of the refresh-token flow against the mock server.
BASE="${BASE_URL:-http://localhost:5099/vendor/api}"
JAR=/tmp/cookies.txt
rm -f "$JAR"
PASS=0; FAIL=0

check() { # check <name> <expected-substring> <actual>
  if echo "$3" | grep -q "$2"; then
    echo "  PASS  $1"; PASS=$((PASS+1))
  else
    echo "  FAIL  $1"; echo "        expected to contain: $2"; echo "        got: $3"; FAIL=$((FAIL+1))
  fi
}

echo "== 1. login =="
# MD5("1234") - the client hashes before posting.
R=$(curl -s -c "$JAR" -H "Content-Type: application/json" \
  -d '{"user_id":"demo","password":"81dc9bdb52d04dc20036dbd8313ed055"}' "$BASE/auth/web_login")
check "login returns 200" '"code":200' "$R"
check "login returns the user" '"user_id":"demo"' "$R"
check "login does not leak the password hash" '"password":""' "$R"
echo "  cookies set:"; grep -o "web[A-Za-z]*Token" "$JAR" | sort -u | sed 's/^/    /'

echo "== 2. session check with the access token =="
R=$(curl -s -b "$JAR" "$BASE/auth/web_auth")
check "web_auth returns 200" '"code":200' "$R"
check "claims survive into the token" '"user_pk":1001' "$R"

echo "== 3. protected route carries full claims (not a role-only stub) =="
R=$(curl -s -b "$JAR" "$BASE/auth/mock_whoami")
check "whoami has user_pk" '"user_pk":1001' "$R"
check "whoami has user_id" '"user_id":"demo"' "$R"
check "whoami has user_name" '"user_name":"Demo User"' "$R"

echo "== 4. protected data route =="
R=$(curl -s -b "$JAR" "$BASE/eshop_order_list?offset=0&limit=5")
check "order list returns 200" '"code":200' "$R"
check "order list is paged to 5" '"total":23' "$R"

echo "== 5. drop the access token, keep the refresh token =="
curl -s -b "$JAR" -c "$JAR" "$BASE/auth/mock_expire_access" > /dev/null
if grep -q "webAccessToken" "$JAR"; then
  echo "  FAIL  access token was not cleared"; FAIL=$((FAIL+1))
else
  echo "  PASS  access token cleared"; PASS=$((PASS+1))
fi
if grep -q "webRefreshToken" "$JAR"; then
  echo "  PASS  refresh token retained"; PASS=$((PASS+1))
else
  echo "  FAIL  refresh token was lost"; FAIL=$((FAIL+1))
fi

echo "== 6. protected route now 401 (not 403 - the client only refreshes on 401) =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "$BASE/eshop_order_list")
check "expired session returns 401" "401" "$CODE"

echo "== 7. refresh =="
R=$(curl -s -b "$JAR" -c "$JAR" "$BASE/auth/refresh_token")
check "refresh returns 200" '"code":200' "$R"
check "refresh reports the role" '"role":"web"' "$R"
if grep -q "webAccessToken" "$JAR"; then
  echo "  PASS  new access token issued"; PASS=$((PASS+1))
else
  echo "  FAIL  no new access token"; FAIL=$((FAIL+1))
fi

echo "== 8. the refreshed token still identifies the same user =="
R=$(curl -s -b "$JAR" "$BASE/auth/mock_whoami")
check "refreshed token keeps user_pk" '"user_pk":1001' "$R"
check "refreshed token keeps user_id" '"user_id":"demo"' "$R"
check "refreshed token keeps user_name" '"user_name":"Demo User"' "$R"

echo "== 9. protected data works again after refresh =="
R=$(curl -s -b "$JAR" "$BASE/eshop_order_list?offset=0&limit=5")
check "order list works post-refresh" '"total":23' "$R"

echo "== 10. logout clears both cookies =="
curl -s -b "$JAR" -c "$JAR" "$BASE/auth/web_logout" > /dev/null
if grep -qE "webAccessToken|webRefreshToken" "$JAR"; then
  echo "  FAIL  cookies survived logout"; FAIL=$((FAIL+1))
else
  echo "  PASS  both cookies cleared on logout"; PASS=$((PASS+1))
fi

echo "== 11. refresh without any cookie is rejected =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/auth/refresh_token")
check "bare refresh returns 401" "401" "$CODE"

echo "== 12. a garbage refresh cookie is rejected =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Cookie: webRefreshToken=not.a.jwt" "$BASE/auth/refresh_token")
check "invalid refresh returns 401" "401" "$CODE"

echo "== 13. an access token replayed as a refresh token is rejected =="
rm -f "$JAR"
curl -s -c "$JAR" -H "Content-Type: application/json" \
  -d '{"user_id":"demo","password":"81dc9bdb52d04dc20036dbd8313ed055"}' "$BASE/auth/web_login" > /dev/null
ACCESS=$(grep webAccessToken "$JAR" | awk '{print $7}')
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Cookie: webRefreshToken=$ACCESS" "$BASE/auth/refresh_token")
check "cross-use of access token rejected" "401" "$CODE"

echo "== 14. wrong password =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Content-Type: application/json" \
  -d '{"user_id":"demo","password":"deadbeef"}' "$BASE/auth/web_login")
check "wrong password returns 401" "401" "$CODE"

echo
echo "==================== $PASS passed, $FAIL failed ===================="
[ "$FAIL" -eq 0 ]
