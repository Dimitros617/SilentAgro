import { describe, expect, it } from 'vitest'
import type { MailMessage } from '@/domain/ports/services'
import { decodeMail, encodeMail } from '@/infrastructure/mail/mail-payload'

const message: MailMessage = {
  to: 'zakaznik@example.test',
  subject: 'Potvrzení rezervace',
  text: 'Rezervace je uložená.\nDěkujeme.',
}
const messageId = '<saved-order@example.test>'

describe('uložení e-mailu do JSON', () => {
  it('zachová prostý text bez doplnění neexistujícího HTML nebo příloh', () => {
    const stored = JSON.parse(JSON.stringify(encodeMail(message)))

    expect(stored).toEqual(message)
    expect(decodeMail(stored, messageId)).toEqual({ ...message, messageId })
  })

  it('zachová binární přílohu, český název souboru a inline odkaz po uložení a načtení', () => {
    const withAttachment: MailMessage = {
      ...message,
      html: '<img src="cid:platebni-qr" alt="Platební QR">',
      attachments: [{
        filename: 'platba-číslo-7.png', content: new Uint8Array([0, 127, 128, 255]),
        contentType: 'image/png', cid: 'platebni-qr',
      }],
    }
    const stored = JSON.parse(JSON.stringify(encodeMail(withAttachment)))

    expect(stored.attachments[0].content).toBe('AH+A/w==')
    const decoded = decodeMail(stored, messageId)
    expect(decoded.html).toBe(withAttachment.html)
    expect(decoded.attachments?.[0]).toMatchObject({
      filename: 'platba-číslo-7.png', contentType: 'image/png', cid: 'platebni-qr',
    })
    expect(Array.from(decoded.attachments?.[0]?.content ?? [])).toEqual([0, 127, 128, 255])
  })

  it('povolí prázdnou běžnou přílohu bez inline identifikátoru', () => {
    const withEmptyAttachment: MailMessage = {
      ...message,
      attachments: [{ filename: 'poznamka.txt', content: new Uint8Array(), contentType: 'text/plain' }],
    }

    const decoded = decodeMail(encodeMail(withEmptyAttachment), messageId)

    expect(decoded.attachments).toHaveLength(1)
    expect(decoded.attachments?.[0]?.content).toHaveLength(0)
    expect(decoded.attachments?.[0]).not.toHaveProperty('cid')
  })

  it('zachová výslovně prázdné HTML i prázdný seznam příloh', () => {
    const withEmptyFields = { ...message, html: '', attachments: [] }
    expect(decodeMail(encodeMail(withEmptyFields), messageId)).toEqual({ ...withEmptyFields, messageId })
  })

  it('použije Message-ID přidělené frontou a nepřevezme je z obsahu zprávy', () => {
    const staleMessage = { ...message, messageId: '<stale@example.test>' }
    expect(encodeMail(staleMessage)).not.toHaveProperty('messageId')
    expect(decodeMail(staleMessage, messageId).messageId).toBe(messageId)
  })

  it.each([
    { reason: 'chybějící příjemce', payload: { subject: 'Zpráva', text: 'Obsah' } },
    { reason: 'nesprávný typ obsahu', payload: { ...message, text: 7 } },
    { reason: 'neúplná příloha', payload: { ...message, attachments: [{ filename: 'qr.png' }] } },
    {
      reason: 'poškozené base64',
      payload: { ...message, attachments: [{ filename: 'qr.png', content: '###', contentType: 'image/png' }] },
    },
  ])('odmítne poškozený záznam: $reason', ({ payload }) => {
    expect(() => decodeMail(payload, messageId)).toThrow()
  })
})
