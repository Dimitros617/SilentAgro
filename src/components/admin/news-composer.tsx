'use client'

import { useState } from 'react'
import { deleteNewsAction, publishNewsAction } from '@/app/actions/admin'
import type { NewsView } from '@/application/dto'
import { NewsCard } from '@/components/home/news-grid'
import { useToast } from '@/components/layout/toast'
import { NEWS_TAG_LABELS, NewsTag } from '@/domain/enums'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function NewsComposer({ initial: posts }: Readonly<{ initial: NewsView[] }>) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tag, setTag] = useState<NewsTag>(NewsTag.HARVEST)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pending, setPending] = useState(false)
  const { show } = useToast()

  const upload = async (file: File) => {
    if (file.size > MAX_IMAGE_BYTES) {
      show('Fotka je větší než 5 MB')
      return
    }

    setUploading(true)
    try {
      const data = new FormData()
      data.append('file', file)
      const response = await fetch('/api/uploads', { method: 'POST', body: data })
      const result = (await response.json()) as { ok: boolean; value?: { url: string }; error?: string }

      if (result.ok && result.value) setImageUrl(result.value.url)
      else show(result.error ?? 'Nahrání se nepovedlo')
    } catch {
      show('Nahrání se nepovedlo')
    } finally {
      setUploading(false)
    }
  }

  const publish = async () => {
    setPending(true)
    try {
      const result = await publishNewsAction({ title, body, tag, imageUrl })
      if (result.ok) {
        setTitle('')
        setBody('')
        setImageUrl(null)
        setTag(NewsTag.HARVEST)
        show('Novinka je na homepage')
      } else {
        show(result.error)
      }
    } catch {
      show('Spojení se serverem se přerušilo. Obnovte seznam a ověřte výsledek.')
    } finally {
      setPending(false)
    }
  }

  const remove = async (id: number) => {
    setPending(true)
    try {
      const result = await deleteNewsAction(id)
      if (!result.ok) show(result.error)
    } catch {
      show('Spojení se serverem se přerušilo. Obnovte seznam a ověřte výsledek.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid-two" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)', alignItems: 'start' }}>
      <div className="card stack" style={{ gap: 12 }}>
        <h2 className="display h3">Nová novinka</h2>

        <input
          className="input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Dnes jsme vykopali Bernie"
          aria-label="Titulek novinky"
        />

        <textarea
          className="textarea"
          rows={5}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Jak sklizeň dopadla…"
          aria-label="Text novinky"
        />

        <div className="chip-row">
          {Object.values(NewsTag).map((value) => (
            <button
              key={value}
              type="button"
              className="chip"
              aria-pressed={tag === value}
              onClick={() => setTag(value)}
            >
              {NEWS_TAG_LABELS[value]}
            </button>
          ))}
        </div>

        {imageUrl ? (
          <div style={{ position: 'relative' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- nahráno za běhu */}
            <img
              src={imageUrl}
              alt="Náhled nahrané fotky"
              style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 12 }}
            />
            <button
              type="button"
              className="btn btn--dark"
              style={{ position: 'absolute', top: 10, right: 10, padding: '7px 12px' }}
              onClick={() => setImageUrl(null)}
            >
              Odebrat
            </button>
          </div>
        ) : null}

        <label
          className="btn btn--secondary"
          style={{ borderStyle: 'dashed', height: 48, cursor: 'pointer' }}
        >
          <span>{uploading ? 'Nahrávám…' : 'Nahrát fotku z pole'}</span>
          <input
            type="file"
            disabled={uploading || pending}
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
              event.target.value = ''
            }}
          />
        </label>

        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void publish()}
          disabled={pending || uploading}
        >
          Zveřejnit na homepage
        </button>
      </div>

      <div className="stack" style={{ gap: 14 }}>
        {posts.length === 0 ? (
          <p className="muted">Zatím nic nezveřejněno.</p>
        ) : (
          posts.map((post) => (
            <div key={post.id} style={{ position: 'relative' }}>
              <NewsCard post={post} />
              <button
                type="button"
                className="btn btn--danger"
                style={{ position: 'absolute', top: 12, right: 12 }}
                onClick={() => void remove(post.id)}
                disabled={pending}
              >
                smazat
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
