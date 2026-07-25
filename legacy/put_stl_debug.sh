#!/usr/bin/env bash
# Usage: ./put_stl_debug.sh upper   (or: lower)
set -euo pipefail

JAW="${1:-upper}"
case "$JAW" in
  upper) STL_PATH="/Users/pingpong/Downloads/ATC-P-29U.stl"; TYPE=1; FILENAME="ATC-P-29U.stl" ;;
  lower) STL_PATH="/Users/pingpong/Downloads/ATC-P-29L.stl"; TYPE=2; FILENAME="ATC-P-29L.stl" ;;
  *) echo "Usage: $0 upper|lower" >&2; exit 1 ;;
esac

MACHINE_ID="3a0df9c37b50873c63cebecd7bed73152a5ef616"
USERNAME="nyunt"
PASSWORD='passworD123*'
CASE_INT_ID=2275
BASE="https://live.api.smartrpdai.com/api/smartrpd"
API="$BASE/stl"
LOGIN_API="$BASE/user/login"
CASE_GET_API="$BASE/case/get/$CASE_INT_ID"
COOKIES="$(mktemp -t put_stl_cookies.XXXXXX)"
trap 'rm -f "$COOKIES" "${TMP_JSON:-}"' EXIT

echo "POST $LOGIN_API  (login as $USERNAME)"
LOGIN_RES="$(curl -sS -X POST "$LOGIN_API" \
  -H "Content-Type: application/json" \
  -c "$COOKIES" \
  -w "\nHTTP %{http_code}" \
  -d "[{\"machine_id\":\"$MACHINE_ID\"},{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}]")"
echo "$LOGIN_RES"
echo "$LOGIN_RES" | grep -q "HTTP 200" || { echo "Login failed, aborting." >&2; exit 1; }
UUID="$(echo "$LOGIN_RES" | sed -n 's/.*"uuid":"\([^"]*\)".*/\1/p' | head -n1)"
[[ -n "$UUID" ]] || { echo "Could not parse uuid from login response" >&2; exit 1; }
echo "uuid=$UUID"
echo

echo "POST $CASE_GET_API  (fetch case_id)"
CASE_RES="$(curl -sS -X POST "$CASE_GET_API" \
  -H "Content-Type: application/json" \
  -b "$COOKIES" -c "$COOKIES" \
  -d "[{\"machine_id\":\"$MACHINE_ID\",\"uuid\":\"$UUID\",\"caseIntID\":$CASE_INT_ID}]")"
CASE_ID="$(echo "$CASE_RES" | sed -n 's/.*"case_id":"\([^"]*\)".*/\1/p' | head -n1)"
[[ -n "$CASE_ID" ]] || { echo "Could not parse case_id from: $CASE_RES" >&2; exit 1; }
echo "case_id=$CASE_ID"
echo

[[ -f "$STL_PATH" ]] || { echo "STL not found: $STL_PATH" >&2; exit 1; }

TMP_JSON="$(mktemp -t put_stl.XXXXXX.json)"

{
  printf '[{"machine_id":"%s","uuid":"%s","caseIntID":%s},' \
    "$MACHINE_ID" "$UUID" "$CASE_INT_ID"
  printf '{"case_id":"%s","type":%s,"filename":"%s","data":"' \
    "$CASE_ID" "$TYPE" "$FILENAME"
  base64 < "$STL_PATH" | tr -d '\n'
  printf '"}]'
} > "$TMP_JSON"

echo "PUT $API  (jaw=$JAW type=$TYPE file=$FILENAME stl_bytes=$(wc -c < "$STL_PATH") payload_bytes=$(wc -c < "$TMP_JSON"))"
RESP_FILE="$(mktemp -t put_stl_resp.XXXXXX)"
HTTP_CODE="$(curl -sS -X PUT "$API" \
  -H "Content-Type: application/json" \
  -b "$COOKIES" \
  -o "$RESP_FILE" \
  -w "%{http_code}" \
  --data-binary "@$TMP_JSON")"
echo "HTTP $HTTP_CODE  response_bytes=$(wc -c < "$RESP_FILE")"
# Show short error message if present, otherwise first 300 chars
if grep -q "serverErrorMessage" "$RESP_FILE"; then
  grep -o '"serverErrorMessage":"[^"]*"\|"sqlMessage":"[^"]*"\|"code":"[^"]*"\|"sqlState":"[^"]*"' "$RESP_FILE"
else
  head -c 300 "$RESP_FILE"
  echo
fi
rm -f "$RESP_FILE"
