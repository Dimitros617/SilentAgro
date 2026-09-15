import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { MailAttachment, MailMessage } from '@/domain/ports/services'

const attachmentSchema = z.object({
  filename: z.string(),
  content: z.base64(),
  contentType: z.string(),
  cid: z.string().optional(),
})

type StoredAttachment = z.infer<typeof attachmentSchema>

const payloadSchema = z.object({
  to: z.string(),
  subject: z.string(),
  text: z.string(),
  html: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
})

function encodeAttachment(attachment: MailAttachment): StoredAttachment {
  return {
    filename: attachment.filename,
    content: Buffer.from(attachment.content).toString('base64'),
    contentType: attachment.contentType,
    ...(attachment.cid ? { cid: attachment.cid } : {}),
  }
}

function decodeAttachment(attachment: StoredAttachment): MailAttachment {
  return {
    filename: attachment.filename,
    content: Buffer.from(attachment.content, 'base64'),
    contentType: attachment.contentType,
    ...(attachment.cid ? { cid: attachment.cid } : {}),
  }
}

export function encodeMail(message: MailMessage): Prisma.InputJsonObject {
  return {
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.html !== undefined ? { html: message.html } : {}),
    ...(message.attachments ? { attachments: message.attachments.map(encodeAttachment) } : {}),
  }
}

export function decodeMail(payload: unknown, messageId: string): MailMessage {
  const parsed = payloadSchema.parse(payload)
  return {
    messageId,
    to: parsed.to,
    subject: parsed.subject,
    text: parsed.text,
    ...(parsed.html !== undefined ? { html: parsed.html } : {}),
    ...(parsed.attachments ? { attachments: parsed.attachments.map(decodeAttachment) } : {}),
  }
}
