import { decodeJwt as readToken, jwtVerify } from 'jose'
import * as jose from 'jose'

async function session(token, key) {
  // ruleid: unverified-session
  const unverified = readToken(token)
  // ruleid: unverified-session
  const alsoUnverified = jose.decodeJwt(token)
  // ok: unverified-session
  const verified = await jwtVerify(token, key)
}
