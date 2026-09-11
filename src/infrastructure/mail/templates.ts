import type { Order } from '@/domain/entities'
import { DELIVERY_LABELS, PAYMENT_LABELS, requiresTransfer } from '@/domain/enums'
import type { DeliveryPolicy, FarmIdentity, MailAttachment, MailMessage } from '@/domain/ports/services'
import type { PaymentDetails } from '@/infrastructure/payment/spayd'
import { formatCzkPerKg, formatKg } from '@/shared/format'

export const QR_CONTENT_ID = 'qr@silentagro'

/** `SilentAgro by Silent Industries · +420 777 123 456` — jeden podpis pro všechny zprávy. */
export const farmSignature = (farm: FarmIdentity): string =>
  [`${farm.name} by ${farm.legalName}`, farm.phone].filter((part) => part.length > 0).join(' · ')

/** Text od zákazníka jde do HTML e-mailu, takže se escapuje. */
const escapeHtml = (raw: string): string =>
  raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export interface CustomerConfirmationInput {
  readonly order: Order
  readonly farm: FarmIdentity
  readonly delivery: DeliveryPolicy
  readonly confirmationUrl: string
  readonly payment: PaymentDetails | null
  /** `null`, když se QR nepodařilo vykreslit — e-mail pak jde bez přílohy. */
  readonly qrPng: Buffer | null
}

const paymentTextBlock = (payment: PaymentDetails, hasQr: boolean): string =>
  [
    '',
    'Platba převodem',
    `  Číslo účtu:        ${payment.accountNumber}`,
    `  IBAN:              ${payment.ibanFormatted}`,
    `  Částka:            ${payment.amountLabel}`,
    `  Variabilní symbol: ${payment.variableSymbol}`,
    `  Zpráva pro příjemce: ${payment.recipientMessage}`,
    '',
    payment.instruction,
    hasQr ? '' : '',
    hasQr ? 'QR kód pro platbu najdete v příloze tohoto e-mailu.' : '',
  ]
    .filter((line) => line !== undefined)
    .join('\n')

export function renderCustomerConfirmation(input: CustomerConfirmationInput): MailMessage {
  const { order, farm, delivery, confirmationUrl, payment, qrPng } = input
  const hasQr = payment !== null && qrPng !== null

  const text = [
    `Dobrý den, ${order.customer.name},`,
    '',
    `rezervujeme pro vás: ${order.itemsLabel}.`,
    `Celkem ${formatCzkPerKg(order.total)}, ${PAYMENT_LABELS[order.payment].toLowerCase()}.`,
    `Způsob převzetí: ${DELIVERY_LABELS[order.delivery]}.`,
    payment ? paymentTextBlock(payment, hasQr) : '',
    '',
    `Zboží držíme ${delivery.holdDays} dní. Ozveme se s přesným termínem.`,
    '',
    `Podrobnosti rezervace: ${confirmationUrl}`,
    '',
    farmSignature(farm),
  ]
    .filter((line) => line !== '')
    .join('\n')

  const htmlPaymentBlock = payment
    ? `
      <h2 style="font-size:17px;margin:24px 0 8px">Platba převodem</h2>
      <table cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.7">
        <tr><td style="padding-right:16px;color:#6f7a72">Číslo účtu</td><td><strong>${escapeHtml(payment.accountNumber)}</strong></td></tr>
        <tr><td style="padding-right:16px;color:#6f7a72">IBAN</td><td>${escapeHtml(payment.ibanFormatted)}</td></tr>
        <tr><td style="padding-right:16px;color:#6f7a72">Částka</td><td><strong>${escapeHtml(payment.amountLabel)}</strong></td></tr>
        <tr><td style="padding-right:16px;color:#6f7a72">Variabilní symbol</td><td><strong>${escapeHtml(payment.variableSymbol)}</strong></td></tr>
        <tr><td style="padding-right:16px;color:#6f7a72">Zpráva pro příjemce</td><td><strong>${escapeHtml(payment.recipientMessage)}</strong></td></tr>
      </table>
      <p style="font-size:14px;line-height:1.6;color:#4a5750">${escapeHtml(payment.instruction)}</p>
      ${hasQr ? `<img src="cid:${QR_CONTENT_ID}" alt="QR kód pro platbu ${escapeHtml(payment.amountLabel)}" width="220" height="220" style="display:block;margin-top:12px" />` : ''}
    `
    : ''

  const html = `
    <div style="font-family:system-ui,sans-serif;color:#14201a;max-width:560px">
      <p style="font-size:15px;line-height:1.6">Dobrý den, ${escapeHtml(order.customer.name)},</p>
      <p style="font-size:15px;line-height:1.6">
        rezervujeme pro vás: <strong>${escapeHtml(order.itemsLabel)}</strong>.<br />
        Celkem <strong>${escapeHtml(formatCzkPerKg(order.total))}</strong>,
        ${escapeHtml(PAYMENT_LABELS[order.payment].toLowerCase())}.<br />
        Způsob převzetí: ${escapeHtml(DELIVERY_LABELS[order.delivery])}.
      </p>
      ${htmlPaymentBlock}
      <p style="font-size:14px;line-height:1.6;color:#4a5750">Zboží držíme ${delivery.holdDays} dní. Ozveme se s přesným termínem.</p>
      <p style="font-size:14px"><a href="${escapeHtml(confirmationUrl)}">Podrobnosti rezervace</a></p>
      <p style="font-size:13px;color:#6f7a72">${escapeHtml(farmSignature(farm))}</p>
    </div>
  `

  const attachments: MailAttachment[] = hasQr
    ? [
        {
          filename: 'qr-platba.png',
          content: qrPng,
          contentType: 'image/png',
          cid: QR_CONTENT_ID,
        },
      ]
    : []

  return {
    to: order.customer.email.value,
    subject: `Potvrzení rezervace ${order.code} — ${farm.name}`,
    text,
    html,
    attachments,
  }
}

export interface FarmerNotificationInput {
  readonly order: Order
  readonly farm: FarmIdentity
  readonly farmerEmail: string
  readonly adminUrl: string
}

export function renderFarmerNotification(input: FarmerNotificationInput): MailMessage {
  const { order, farm, farmerEmail, adminUrl } = input

  const text = [
    `${order.customer.name} · ${order.customer.email.value}${order.customer.phone ? ` · ${order.customer.phone}` : ''}`,
    order.itemsLabel,
    `${DELIVERY_LABELS[order.delivery]} · ${PAYMENT_LABELS[order.payment]}`,
    `Celkem ${formatCzkPerKg(order.total)}`,
    requiresTransfer(order.payment)
      ? 'Objednávka čeká na platbu převodem — po připsání ji v administraci odškrtněte jako zaplacenou.'
      : '',
    '',
    `Poznámka: ${order.customer.note.trim() || '—'}`,
    '',
    'Sklad byl automaticky ponížen.',
    `Otevřít v administraci: ${adminUrl}`,
  ]
    .filter((line) => line !== '')
    .join('\n')

  return {
    to: farmerEmail,
    subject: `Nová rezervace ${order.code} (${formatKg(order.totalKg)})`,
    text,
  }
}

export interface OrderCancelledInput {
  readonly order: Order
  readonly farm: FarmIdentity
  readonly reason: string
}

export function renderOrderCancelled(input: OrderCancelledInput): MailMessage {
  const { order, farm, reason } = input

  const text = [
    `Dobrý den, ${order.customer.name},`,
    '',
    `moc se omlouváme, ale vaši rezervaci ${order.code} musíme zrušit.`,
    '',
    `Objednávka: ${order.itemsLabel}`,
    `Celkem: ${formatCzkPerKg(order.total)}`,
    '',
    'Důvod:',
    reason,
    '',
    requiresTransfer(order.payment)
      ? 'Pokud jste už zaplatili, ozvěte se nám a peníze obratem vrátíme.'
      : 'Nic jste neplatili, takže se nic nevrací.',
    '',
    'Brambory jsme vrátili zpět do nabídky — mrkněte na burzu, jestli si nevyberete jinou odrůdu.',
    '',
    farmSignature(farm),
  ]
    .filter((line) => line !== '')
    .join('\n')

  const html = `
    <div style="font-family:system-ui,sans-serif;color:#14201a;max-width:560px">
      <p style="font-size:15px;line-height:1.6">Dobrý den, ${escapeHtml(order.customer.name)},</p>
      <p style="font-size:15px;line-height:1.6">
        moc se omlouváme, ale vaši rezervaci <strong>${escapeHtml(order.code)}</strong> musíme zrušit.
      </p>
      <p style="font-size:14px;line-height:1.6;color:#4a5750">
        ${escapeHtml(order.itemsLabel)} · ${escapeHtml(formatCzkPerKg(order.total))}
      </p>
      <p style="font-size:15px;line-height:1.6"><strong>Důvod:</strong><br />${escapeHtml(reason)}</p>
      <p style="font-size:14px;line-height:1.6;color:#4a5750">
        ${requiresTransfer(order.payment)
          ? 'Pokud jste už zaplatili, ozvěte se nám a peníze obratem vrátíme.'
          : 'Nic jste neplatili, takže se nic nevrací.'}
      </p>
      <p style="font-size:13px;color:#6f7a72">${escapeHtml(farmSignature(farm))}</p>
    </div>
  `

  return {
    to: order.customer.email.value,
    subject: `Rezervace ${order.code} byla zrušena — ${farm.name}`,
    text,
    html,
  }
}

export function renderVerification(farm: FarmIdentity, name: string, to: string, verificationUrl: string): MailMessage {
  const text = [
    `Dobrý den, ${name},`,
    '',
    'potvrďte prosím svůj e-mail otevřením odkazu:',
    verificationUrl,
    '',
    'Odkaz platí 48 hodin. Pokud jste si účet u nás nezakládali, zprávu ignorujte.',
    '',
    farmSignature(farm),
  ].join('\n')

  return {
    to,
    subject: `Potvrďte svůj e-mail — ${farm.name}`,
    text,
    html: `
      <div style="font-family:system-ui,sans-serif;color:#14201a;max-width:560px">
        <p style="font-size:15px;line-height:1.6">Dobrý den, ${escapeHtml(name)},</p>
        <p style="font-size:15px;line-height:1.6">potvrďte prosím svůj e-mail:</p>
        <p><a href="${escapeHtml(verificationUrl)}" style="display:inline-block;padding:12px 20px;background:#1f6f4a;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">Potvrdit e-mail</a></p>
        <p style="font-size:13px;color:#6f7a72">Odkaz platí 48 hodin. Pokud jste si účet nezakládali, zprávu ignorujte.</p>
      </div>
    `,
  }
}

export function renderFarmerMessage(farm: FarmIdentity, name: string, to: string, subject: string, body: string): MailMessage {
  return {
    to,
    subject,
    text: [`Dobrý den, ${name},`, '', body, '', 'SilentAgro by Silent Industries · +420 777 123 456'].join('\n'),
    html: `
      <div style="font-family:system-ui,sans-serif;color:#14201a;max-width:560px">
        <p style="font-size:15px;line-height:1.6">Dobrý den, ${escapeHtml(name)},</p>
        <p style="font-size:15px;line-height:1.6;white-space:pre-line">${escapeHtml(body)}</p>
        <p style="font-size:13px;color:#6f7a72">${escapeHtml(farmSignature(farm))}</p>
      </div>
    `,
  }
}
