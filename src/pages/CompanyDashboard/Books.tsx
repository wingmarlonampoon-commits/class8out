import { useEffect, useState, type FormEvent } from 'react'
import { BookOpen, ExternalLink, Link2, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/useAuth'
import { ESL_SUBJECTS } from '../../data/eslSubjects'
import './Books.css'

type BookRow = {
  id: string
  title: string
  description: string | null
  subject: string
  category: string
  book_url: string
  PublicAvailability: boolean
  created_at: string
  company_code: string
  ownerName?: string
}

type OwnerRow = {
  company_code: string
  company_name: string
}

type Message = {
  type: 'success' | 'error'
  text: string
}

const CATEGORIES = ['Textbook', 'Workbook', 'Reference', 'Worksheet', 'Other']

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

function Books() {
  const { session } = useAuth()
  const [company, setCompany] = useState<{ code: string; name: string } | null>(null)

  const [books, setBooks] = useState<BookRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)

  const [showModal, setShowModal] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [subject, setSubject] = useState(ESL_SUBJECTS[0])
  const [customSubject, setCustomSubject] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [customCategory, setCustomCategory] = useState('')
  const [bookUrl, setBookUrl] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  useEffect(() => {
    const adminEmail = session?.user.email
    if (!adminEmail) return

    supabase
      .from('company_registration')
      .select('CompanyCode, company_name')
      .eq('email', adminEmail)
      .single()
      .then(({ data }) => {
        if (data) {
          setCompany({
            code: data.CompanyCode,
            name: data.company_name,
          })
        }
      })
  }, [session])

  useEffect(() => {
    if (!company) return

    setListLoading(true)

    const columns =
      'id, title, description, subject, category, book_url, PublicAvailability, created_at, company_code'

    // Own company's full catalog, plus any other company's books they've
    // marked public — books has no FK to company_registration, so the
    // owner's name for a FOREIGN company is resolved via a narrow RPC
    // (public_book_owner_names) rather than a broad company_registration
    // grant, which would over-expose that company's email/phone/settings.
    Promise.all([
      supabase
        .from('books')
        .select(columns)
        .eq('company_code', company.code),

      supabase
        .from('books')
        .select(columns)
        .eq('PublicAvailability', true)
        .neq('company_code', company.code),
    ]).then(async ([own, pub]) => {
      const merged: BookRow[] = [
        ...((own.data as BookRow[]) ?? []),
        ...((pub.data as BookRow[]) ?? []),
      ]

      merged.sort((a, b) => b.created_at.localeCompare(a.created_at))

      const foreignCodes = [
        ...new Set(
          merged
            .map((b) => b.company_code)
            .filter((code) => code !== company.code),
        ),
      ]

      const { data: owners } = await supabase.rpc(
        'public_book_owner_names',
        {
          p_codes: foreignCodes,
        },
      )

      // Explicitly type the RPC response so TypeScript knows what
      // company_code and company_name are.
      const ownerRows: OwnerRow[] = (owners ?? []) as OwnerRow[]

      const foreignNames: [string, string][] = ownerRows.map(
        (o): [string, string] => [o.company_code, o.company_name],
      )

      const nameMap = new Map<string, string>([
        [company.code, company.name],
        ...foreignNames,
      ])

      const mergedWithOwners: BookRow[] = merged.map((b) => ({
        ...b,
        ownerName: nameMap.get(b.company_code) ?? b.company_code,
      }))

      setBooks(mergedWithOwners)
      setListLoading(false)
    })
  }, [company, reloadToken])

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setSubject(ESL_SUBJECTS[0])
    setCustomSubject('')
    setCategory(CATEGORIES[0])
    setCustomCategory('')
    setBookUrl('')
    setIsPublic(true)
  }

  const openModal = () => {
    resetForm()
    setMessage(null)
    setShowModal(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (!company) {
      setMessage({
        type: 'error',
        text: 'Could not determine your company. Please try again.',
      })
      return
    }

    const finalSubject =
      subject === 'Other' ? customSubject.trim() : subject

    const finalCategory =
      category === 'Other' ? customCategory.trim() : category

    if (subject === 'Other' && !finalSubject) {
      setMessage({
        type: 'error',
        text: 'Please enter a subject.',
      })
      return
    }

    if (category === 'Other' && !finalCategory) {
      setMessage({
        type: 'error',
        text: 'Please enter a category.',
      })
      return
    }

    setLoading(true)

    const { error: insertError } = await supabase
      .from('books')
      .insert({
        company_code: company.code,
        title: title.trim(),
        description: description.trim() || null,
        subject: finalSubject,
        category: finalCategory,
        book_url: bookUrl,
        PublicAvailability: isPublic,
      })

    setLoading(false)

    if (insertError) {
      setMessage({
        type: 'error',
        text: 'Could not save the book. Please try again.',
      })
      return
    }

    setMessage({
      type: 'success',
      text: 'Book added.',
    })

    resetForm()
    setReloadToken((n) => n + 1)
  }

  return (
    <div className="books-page">
      <div className="books-page-header">
        <h1>Books</h1>

        <button
          className="btn btn-primary"
          onClick={openModal}
        >
          <Link2 size={16} /> Add Book
        </button>
      </div>

      <div className="books-list-panel">
        {listLoading ? (
          <p className="books-loading">Loading…</p>
        ) : books.length === 0 ? (
          <div className="books-empty">
            <BookOpen size={22} />
            <p>No books yet. Add one to get started.</p>
          </div>
        ) : (
          <div className="books-table-wrap">
            <table className="books-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Owner</th>
                  <th>Subject</th>
                  <th>Category</th>
                  <th>Visibility</th>
                  <th>Added</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {books.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <span className="books-row-avatar">
                        <BookOpen size={14} />
                      </span>

                      {b.title || '—'}
                    </td>

                    <td>
                      {b.ownerName ?? b.company_code}

                      {b.company_code === company?.code && (
                        <span className="books-owner-you">
                          {' '}
                          (You)
                        </span>
                      )}
                    </td>

                    <td>{b.subject || '—'}</td>

                    <td>
                      <span className="books-category-badge">
                        {b.category || '—'}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`books-visibility-badge ${
                          b.PublicAvailability
                            ? 'is-public'
                            : 'is-private'
                        }`}
                      >
                        {b.PublicAvailability ? 'Public' : 'Private'}
                      </span>
                    </td>

                    <td>{formatDate(b.created_at)}</td>

                    <td>
                      <a
                        href={b.book_url}
                        target="_blank"
                        rel="noreferrer"
                        className="books-open-link"
                      >
                        Open <ExternalLink size={13} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div
          className="books-modal-overlay"
          onClick={() => setShowModal(false)}
        >
          <div
            className="books-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="books-modal-close"
              aria-label="Close"
              onClick={() => setShowModal(false)}
            >
              <X size={18} />
            </button>

            <div className="books-modal-scroll">
              <div className="books-panel">
                <div className="books-panel-header">
                  <span className="books-panel-icon">
                    <Link2 size={18} />
                  </span>

                  <div>
                    <h2>Add Book</h2>
                    <p className="books-panel-subtitle">
                      Link a book or resource for your students.
                    </p>
                  </div>
                </div>

                <form
                  className="books-form"
                  onSubmit={handleSubmit}
                  autoComplete="off"
                >
                  <label>
                    Book Title

                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Grammar in Use"
                      autoComplete="off"
                      required
                    />
                  </label>

                  <label>
                    Description

                    <textarea
                      className="books-textarea"
                      value={description}
                      onChange={(e) =>
                        setDescription(e.target.value)
                      }
                      rows={3}
                      placeholder="What this book covers, who it's for…"
                    />
                  </label>

                  <label>
                    Subject

                    <select
                      value={subject}
                      onChange={(e) =>
                        setSubject(e.target.value)
                      }
                    >
                      {ESL_SUBJECTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>

                  {subject === 'Other' && (
                    <label>
                      Custom Subject

                      <input
                        type="text"
                        value={customSubject}
                        onChange={(e) =>
                          setCustomSubject(e.target.value)
                        }
                        placeholder="Enter a subject"
                        autoComplete="off"
                        required
                      />
                    </label>
                  )}

                  <label>
                    Category

                    <select
                      value={category}
                      onChange={(e) =>
                        setCategory(e.target.value)
                      }
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>

                  {category === 'Other' && (
                    <label>
                      Custom Category

                      <input
                        type="text"
                        value={customCategory}
                        onChange={(e) =>
                          setCustomCategory(e.target.value)
                        }
                        placeholder="Enter a category"
                        autoComplete="off"
                        required
                      />
                    </label>
                  )}

                  <label>
                    Book URL

                    <input
                      type="url"
                      value={bookUrl}
                      onChange={(e) =>
                        setBookUrl(e.target.value)
                      }
                      placeholder="https://…"
                      autoComplete="off"
                      required
                    />
                  </label>

                  <div className="books-visibility-group">
                    <span className="books-field-label">
                      Visibility
                    </span>

                    <div className="books-visibility-toggle">
                      <label
                        className={`books-visibility-pill ${
                          isPublic ? 'is-active' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          checked={isPublic}
                          onChange={() => setIsPublic(true)}
                        />
                        Public
                      </label>

                      <label
                        className={`books-visibility-pill ${
                          !isPublic ? 'is-active' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          checked={!isPublic}
                          onChange={() => setIsPublic(false)}
                        />
                        Private
                      </label>
                    </div>

                    <p className="books-visibility-help">
                      {isPublic
                        ? 'Anyone within the Class8out users can view this book and use it to their lessons.'
                        : 'Only Teachers, admins and students within your company can view this book.'}
                    </p>
                  </div>

                  {message && (
                    <p
                      className={`books-message is-${message.type}`}
                    >
                      {message.text}
                    </p>
                  )}

                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={loading || !company}
                  >
                    {loading ? 'Adding…' : 'Add Book'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Books