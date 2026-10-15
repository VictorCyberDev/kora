#!/usr/bin/env bash
# Regenerates the TLS fixtures used by monitor.network.test.ts.
# Validity windows are fixed (never relative to "now") so tests never become
# time-dependent. Requires OpenSSL >= 1.1.1. TEST-ONLY keys: never reuse.
set -euo pipefail
cd "$(dirname "$0")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir "$work/ca"; : > "$work/ca/index.txt"; echo 01 > "$work/ca/serial"
cat > "$work/ca.cnf" <<CNF
[ca]
default_ca = x
[x]
database = $work/ca/index.txt
new_certs_dir = $work/ca
serial = $work/ca/serial
default_md = sha256
policy = p
unique_subject = no
copy_extensions = copy
[p]
commonName = supplied
[req]
distinguished_name = dn
prompt = no
req_extensions = ext
[dn]
CN = localhost
[ext]
subjectAltName = DNS:localhost,IP:127.0.0.1
CNF
issue() { # name startdate enddate
  openssl req -new -newkey rsa:2048 -nodes -keyout "$1.key" -out "$work/$1.csr" -config "$work/ca.cnf" 2>/dev/null
  openssl ca -batch -selfsign -keyfile "$1.key" -in "$work/$1.csr" -out "$1.crt" \
    -config "$work/ca.cnf" -startdate "$2" -enddate "$3" 2>/dev/null
}
# Self-signed, valid 2020-01-01 .. 2099-12-31 (fails only because it is self-signed).
issue self-signed 20200101000000Z 20991231235959Z
# Self-signed, expired: valid 2020-01-01 .. 2020-01-02.
issue expired 20200101000000Z 20200102000000Z
for f in self-signed expired; do openssl x509 -in "$f.crt" -noout -subject -dates; done
