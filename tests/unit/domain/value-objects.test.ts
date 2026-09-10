import { describe, expect, it } from 'vitest'
import { ValidationError } from '@/domain/errors'
import { EmailAddress } from '@/domain/value-objects/email-address'
import { HexColor } from '@/domain/value-objects/hex-color'
import { Iban, isValidIban } from '@/domain/value-objects/iban'

describe('EmailAddress', () => {
  it('normalizuje na malá písmena a ořeže mezery', () => {
    expect(EmailAddress.of('  JAN@Email.CZ ').value).toBe('jan@email.cz')
  })

  it('přijme adresu s tečkou i plusem', () => {
    expect(EmailAddress.of('jan.novak+farma@email.cz').value).toBe('jan.novak+farma@email.cz')
  })

  it('odmítne adresu bez zavináče nebo domény', () => {
    expect(() => EmailAddress.of('jan.email.cz')).toThrow(ValidationError)
    expect(() => EmailAddress.of('jan@')).toThrow(ValidationError)
    expect(() => EmailAddress.of('@email.cz')).toThrow(ValidationError)
    expect(() => EmailAddress.of('')).toThrow(ValidationError)
  })

  it('odmítne adresu s mezerou uvnitř', () => {
    expect(() => EmailAddress.of('jan novak@email.cz')).toThrow(ValidationError)
  })
})

describe('HexColor', () => {
  it('normalizuje na malá písmena', () => {
    expect(HexColor.of('#C98A2B').value).toBe('#c98a2b')
  })

  it('odmítne tvar bez mřížky, zkrácený i neplatné znaky', () => {
    expect(() => HexColor.of('c98a2b')).toThrow(ValidationError)
    expect(() => HexColor.of('#abc')).toThrow(ValidationError)
    expect(() => HexColor.of('#zzzzzz')).toThrow(ValidationError)
  })

  it('odmítne pokus o vložení CSS mimo barvu', () => {
    // barva jde přímo do atributu style, takže sem nesmí nic jiného
    expect(() => HexColor.of('red;background:url(javascript:alert(1))')).toThrow(ValidationError)
  })
})

describe('Iban', () => {
  it('přijme platný český IBAN s mezerami i bez', () => {
    expect(Iban.of('CZ6508000000192000145399').value).toBe('CZ6508000000192000145399')
    expect(Iban.of('cz65 0800 0000 1920 0014 5399').value).toBe('CZ6508000000192000145399')
  })

  it('naformátuje po čtveřicích', () => {
    expect(Iban.of('CZ6508000000192000145399').formatted).toBe('CZ65 0800 0000 1920 0014 5399')
  })

  it('odmítne překlep v kontrolních číslicích', () => {
    expect(() => Iban.of('CZ6608000000192000145399')).toThrow(ValidationError)
  })

  it('odmítne špatnou délku pro danou zemi', () => {
    expect(isValidIban('CZ650800000019200014539')).toBe(false)
    expect(isValidIban('CZ65080000001920001453990')).toBe(false)
  })

  it('odmítne nesmysl', () => {
    expect(isValidIban('rozbite')).toBe(false)
    expect(isValidIban('')).toBe(false)
    expect(isValidIban('1234567890123456789012')).toBe(false)
  })

  it('zvládne i IBAN delší než Number.MAX_SAFE_INTEGER', () => {
    // maltský IBAN má 31 znaků, po převodu na číslo je daleko za hranicí přesnosti double
    expect(isValidIban('MT84MALT011000012345MTLCAST001S')).toBe(true)
  })
})
