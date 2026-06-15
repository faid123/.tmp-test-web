#!/usr/bin/env bash
# Verify the jaw-struct (L2) SAVE endpoint, non-destructively.
#
# Usage: ./put_jawstruct_debug.sh [upper|lower] [CASE_INT_ID]
#
# It logs in, GETs the case's current jaw struct, re-stamps ONLY the
# "Start of Jaw Struct ...: <timestamp>" line with a recognizable sentinel,
# POSTs it back to /jawstruct/l2, then GETs again to confirm the sentinel
# landed. Because it round-trips the case's own data (only the cosmetic
# timestamp changes — which the real encoder re-stamps anyway) it cannot
# corrupt the design.
set -euo pipefail

JAW="${1:-upper}"
CASE_INT_ID="${2:-2275}"
case "$JAW" in
  upper) TYPE_STR="upper_jaw" ;;
  lower) TYPE_STR="lower_jaw" ;;
  *) echo "Usage: $0 upper|lower [CASE_INT_ID]" >&2; exit 1 ;;
esac

MACHINE_ID="3a0df9c37b50873c63cebecd7bed73152a5ef616"
USERNAME="nyunt"
PASSWORD='passworD123*'
BASE="https://live.api.smartrpdai.com/api/smartrpd"
LOGIN_API="$BASE/user/login"
GETALL_API="$BASE/jawstruct/l2/getall"
SAVE_API="$BASE/jawstruct/l2"
SENTINEL="9999.12.31.23.59.59"

COOKIES="$(mktemp -t jawstruct_cookies.XXXXXX)"
GET1="$(mktemp -t jawstruct_get1.XXXXXX.json)"
GET2="$(mktemp -t jawstruct_get2.XXXXXX.json)"
POST_BODY="$(mktemp -t jawstruct_post.XXXXXX.json)"
trap 'rm -f "$COOKIES" "$GET1" "$GET2" "$POST_BODY"' EXIT

echo "POST $LOGIN_API  (login as $USERNAME)"
LOGIN_RES="$(curl -sS -X POST "$LOGIN_API" \
  -H "Content-Type: application/json" \
  -c "$COOKIES" \
  -w "\nHTTP %{http_code}" \
  -d "[{\"machine_id\":\"$MACHINE_ID\"},{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}]")"
echo "$LOGIN_RES" | tail -n1
echo "$LOGIN_RES" | grep -q "HTTP 200" || { echo "Login failed, aborting." >&2; exit 1; }
UUID="$(echo "$LOGIN_RES" | sed -n 's/.*"uuid":"\([^"]*\)".*/\1/p' | head -n1)"
[[ -n "$UUID" ]] || { echo "Could not parse uuid from login response" >&2; exit 1; }
echo "uuid=$UUID  caseIntID=$CASE_INT_ID  jaw=$TYPE_STR"
echo

echo "POST $GETALL_API  (fetch current jaw struct)"
curl -sS -X POST "$GETALL_API" \
  -H "Content-Type: application/json" \
  -b "$COOKIES" -c "$COOKIES" \
  -o "$GET1" \
  -d "[{\"machine_id\":\"$MACHINE_ID\",\"uuid\":\"$UUID\",\"caseIntID\":$CASE_INT_ID},{\"case_id\":$CASE_INT_ID}]"
echo "get response_bytes=$(wc -c < "$GET1")"

# Build the POST payload: same record, sentinel-stamped Start line.
python3 - "$GET1" "$TYPE_STR" "$SENTINEL" "$MACHINE_ID" "$UUID" "$CASE_INT_ID" "$POST_BODY" <<'PY'
import base64, json, re, sys
get_file, type_str, sentinel, machine_id, uuid, case_int_id, out_file = sys.argv[1:8]
records = json.load(open(get_file))
if not isinstance(records, list) or not records:
    sys.exit(f"GET returned no records (case has no 2D design?). Raw: {records!r}")
rec = next((r for r in records if r.get("type") == type_str), None)
if rec is None:
    sys.exit(f"No '{type_str}' record. Types present: {[r.get('type') for r in records]}")
text = base64.b64decode(rec["data"]).decode("latin-1")
m = re.search(r"^(Start of Jaw Struct[^:]*:).*$", text, flags=re.M)
print("  original Start line:", (m.group(0) if m else "<none found>"))
new_text = re.sub(r"^(Start of Jaw Struct[^:]*:).*$",
                  lambda mm: mm.group(1) + " " + sentinel, text, count=1, flags=re.M)
new_b64 = base64.b64encode(new_text.encode("latin-1")).decode("ascii")
payload = [
    {"machine_id": machine_id, "uuid": uuid, "caseIntID": int(case_int_id)},
    {"case_id": int(case_int_id), "type": type_str,
     "filename": rec.get("filename") or "JawUpper_Struct_L2.txt", "data": new_b64},
]
json.dump(payload, open(out_file, "w"))
print(f"  filename={rec.get('filename')!r}  text_bytes={len(text)}  payload_bytes={len(json.dumps(payload))}")
PY

echo
echo "POST $SAVE_API  (write sentinel-stamped $TYPE_STR back)"
RESP_FILE="$(mktemp -t jawstruct_resp.XXXXXX)"
HTTP_CODE="$(curl -sS -X POST "$SAVE_API" \
  -H "Content-Type: application/json" \
  -b "$COOKIES" \
  -o "$RESP_FILE" \
  -w "%{http_code}" \
  --data-binary "@$POST_BODY")"
echo "HTTP $HTTP_CODE  response: $(head -c 300 "$RESP_FILE")"
rm -f "$RESP_FILE"
echo

echo "POST $GETALL_API  (re-fetch to confirm the write landed)"
curl -sS -X POST "$GETALL_API" \
  -H "Content-Type: application/json" \
  -b "$COOKIES" -c "$COOKIES" \
  -o "$GET2" \
  -d "[{\"machine_id\":\"$MACHINE_ID\",\"uuid\":\"$UUID\",\"caseIntID\":$CASE_INT_ID},{\"case_id\":$CASE_INT_ID}]"

python3 - "$GET2" "$TYPE_STR" "$SENTINEL" <<'PY'
import base64, json, sys
get_file, type_str, sentinel = sys.argv[1:4]
records = json.load(open(get_file))
rec = next((r for r in records if r.get("type") == type_str), None)
if rec is None:
    sys.exit("re-fetch: record missing")
text = base64.b64decode(rec["data"]).decode("latin-1")
import re
m = re.search(r"^Start of Jaw Struct[^\n]*$", text, flags=re.M)
print("  re-fetched Start line:", (m.group(0) if m else "<none>"))
if sentinel in text:
    print("RESULT: ✓ write confirmed — sentinel present in re-fetched data. Endpoint + shape OK.")
else:
    print("RESULT: ✕ sentinel NOT found — POST did not update the stored record.")
    sys.exit(2)
PY
