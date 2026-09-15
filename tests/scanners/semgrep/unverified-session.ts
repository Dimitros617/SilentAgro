import { decodeJwt, decodeJwt as readToken, jwtVerify } from 'jose'
import * as jose from 'jose'

async function session(token, key) {
  // Nejběžnější tvar importu. Rozhoduje o tom, jestli pravidlo drží v middlewaru.
  // ruleid: unverified-session
  const plain = decodeJwt(token)
  // ruleid: unverified-session
  const unverified = readToken(token)
  // ruleid: unverified-session
  const alsoUnverified = jose.decodeJwt(token)
  // ruleid: unverified-session
  const viaRequire = require('jose').decodeJwt(token)
  // ok: unverified-session
  const verified = await jwtVerify(token, key)
}
