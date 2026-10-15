# TLS test fixtures

Used only by `src/monitor.network.test.ts` to give the health monitor real TLS
failures from a local HTTPS server. **These private keys are test-only and
public. Never use them for anything else.**

| File                                  | Subject / SAN                                   | Validity (fixed)                            |
| ------------------------------------- | ----------------------------------------------- | ------------------------------------------- |
| `self-signed.crt` / `self-signed.key` | `CN=localhost`, `DNS:localhost`, `IP:127.0.0.1` | 2020-01-01 00:00:00Z – 2099-12-31 23:59:59Z |
| `expired.crt` / `expired.key`         | same                                            | 2020-01-01 00:00:00Z – 2020-01-02 00:00:00Z |

Both are self-signed, so the "valid" one fails with `DEPTH_ZERO_SELF_SIGNED_CERT`
and the expired one fails with `CERT_HAS_EXPIRED`. The validity windows are
absolute dates, so the tests never depend on the current time (the non-expired
window ends in 2099).

## Regenerate

```bash
apps/api/test-fixtures/generate.sh
```

The script runs these OpenSSL commands (`issue <name> <start> <end>`), with a
throwaway CA database in a temp directory:

```bash
openssl req -new -newkey rsa:2048 -nodes -keyout NAME.key -out NAME.csr -config ca.cnf
openssl ca -batch -selfsign -keyfile NAME.key -in NAME.csr -out NAME.crt \
  -config ca.cnf -startdate START -enddate END
# self-signed: START=20200101000000Z END=20991231235959Z
# expired:     START=20200101000000Z END=20200102000000Z
```

Verify the dates with `openssl x509 -in FILE.crt -noout -dates`. Requires an
OpenSSL that accepts four-digit years in `-startdate/-enddate` (tested with
OpenSSL 3.0.13). Regenerating changes the keys but never the validity windows.
